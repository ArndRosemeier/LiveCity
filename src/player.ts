import * as T from "three";
import { createPerson, posePerson, type Person } from "./inhabitants";
import { HumanSurface } from "./human-surface";
export interface PlayerEnvironment {
  blocked(x: number, y: number, z: number, r: number, h: number): boolean;
  floor(x: number, z: number, y: number): number;
  contact(
    position: T.Vector3,
    radius: number,
    energy: number,
    landing: boolean,
  ): void;
}
export class Player {
  readonly trail = new T.Group();
  private trails: { line: T.Line; positions: Float32Array }[] = [];
  readonly avatar: Person = createPerson("COMMON-GROUND/PLAYER");
  readonly surface = new HumanSurface(this.avatar);
  readonly position = new T.Vector3(8.3, 0.23, 24);
  readonly velocity = new T.Vector3();
  scale = 1;
  targetScale = 1;
  yaw = 0;
  pitch = 0;
  zoom = 5;
  flying = false;
  grounded = true;
  distance = 0;
  private stepDistance = 0;
  private impactCooldown = 0;
  cameraPosition = new T.Vector3();
  constructor() {
    for (let side = 0; side < 2; side++) {
      const positions = new Float32Array(32 * 3),
        geometry = new T.BufferGeometry();
      geometry.setAttribute(
        "position",
        new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
      );
      const line = new T.Line(
        geometry,
        new T.LineBasicMaterial({
          color: 0xcbe8ed,
          transparent: true,
          opacity: 0.18,
          blending: T.AdditiveBlending,
          depthWrite: false,
        }),
      );
      line.frustumCulled = false;
      this.trail.add(line);
      this.trails.push({ line, positions });
    }
    this.trail.visible = false;
    for (const o of [...this.avatar.group.children])
      if (o.userData.carriedBag) this.avatar.group.remove(o);
    this.avatar.group.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.visible = Boolean(o.userData.accessory);
      }
    });
    this.avatar.group.scale.setScalar(1);
  }
  get mass() {
    return 80 * this.scale ** 3;
  }
  get radius() {
    return 0.29 * this.scale;
  }
  get height() {
    return 1.78 * this.scale;
  }
  get eye() {
    return 1.62 * this.scale;
  }
  get thirdPerson() {
    return this.zoom > 0.15;
  }
  resize(factor: number, env: PlayerEnvironment) {
    const next = T.MathUtils.clamp(this.targetScale * factor, 0.15, 24);
    if (
      next > this.scale &&
      env.blocked(
        this.position.x,
        this.position.y,
        this.position.z,
        0.29 * next,
        1.78 * next,
      )
    )
      return false;
    this.targetScale = next;
    return true;
  }
  teleport(x: number, z: number, y = 0.23) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }
  update(
    dt: number,
    time: number,
    keys: Set<string>,
    enabled: boolean,
    env: PlayerEnvironment,
  ) {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const next = T.MathUtils.lerp(
      this.scale,
      this.targetScale,
      1 - Math.exp(-dt * 5),
    );
    if (
      next < this.scale ||
      !env.blocked(
        this.position.x,
        this.position.y,
        this.position.z,
        0.29 * next,
        1.78 * next,
      )
    )
      this.scale = next;
    else this.targetScale = this.scale;
    let x = enabled
      ? Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"))
      : 0;
    let z = enabled
      ? Number(keys.has("KeyS") || keys.has("ArrowDown")) -
        Number(keys.has("KeyW") || keys.has("ArrowUp"))
      : 0;
    const norm = Math.max(1, Math.hypot(x, z));
    x /= norm;
    z /= norm;
    const speed =
      (this.flying ? 12 : keys.has("ShiftLeft") ? 6.5 : 3.1) *
      Math.sqrt(this.scale);
    const target = new T.Vector3(
      (x * Math.cos(this.yaw) + z * Math.sin(this.yaw)) * speed,
      0,
      (-x * Math.sin(this.yaw) + z * Math.cos(this.yaw)) * speed,
    );
    if (this.flying) {
      target.y = enabled
        ? (Number(keys.has("Space")) -
            Number(keys.has("ControlLeft") || keys.has("KeyC"))) *
          speed
        : 0;
      target.y += -z * Math.sin(this.pitch) * speed;
    }
    const acceleration = this.flying ? 3 : 10 / Math.sqrt(this.scale);
    this.velocity.x = T.MathUtils.damp(
      this.velocity.x,
      target.x,
      acceleration,
      dt,
    );
    this.velocity.z = T.MathUtils.damp(
      this.velocity.z,
      target.z,
      acceleration,
      dt,
    );
    if (this.flying)
      this.velocity.y = T.MathUtils.damp(this.velocity.y, target.y, 3, dt);
    else this.velocity.y -= 9.81 * dt;
    const old = this.position.clone(),
      steps = Math.max(
        1,
        Math.ceil(
          (this.velocity.length() * dt) / Math.max(0.08, this.radius * 0.45),
        ),
      );
    for (let k = 0; k < steps; k++) {
      const delta = this.velocity.clone().multiplyScalar(dt / steps);
      for (const axis of ["x", "z"] as const) {
        const candidate = this.position.clone();
        candidate[axis] += delta[axis];
        if (
          !env.blocked(
            candidate.x,
            candidate.y,
            candidate.z,
            this.radius,
            this.height,
          )
        )
          this.position[axis] = candidate[axis];
        else {
          if (this.impactCooldown === 0) {
            env.contact(
              candidate,
              this.radius,
              0.5 * this.mass * this.velocity.lengthSq(),
              false,
            );
            this.impactCooldown = 0.3;
          }
          this.velocity[axis] = 0;
        }
      }
      const y = this.position.y + delta.y;
      if (
        !env.blocked(
          this.position.x,
          y,
          this.position.z,
          this.radius,
          this.height,
        )
      )
        this.position.y = y;
      else if (this.velocity.y > 0) this.velocity.y = 0;
      const floor = env.floor(
        this.position.x,
        this.position.z,
        Math.max(this.position.y, old.y) + this.height * 0.1,
      );
      if (this.position.y <= floor) {
        const fallSpeed = -this.velocity.y;
        this.position.y = floor;
        this.velocity.y = Math.max(0, this.velocity.y);
        if (!this.grounded && fallSpeed > 3)
          env.contact(
            this.position.clone(),
            this.radius,
            0.5 * this.mass * fallSpeed ** 2,
            true,
          );
        this.grounded = true;
      } else this.grounded = false;
    }
    const travel = Math.hypot(this.position.x - old.x, this.position.z - old.z);
    this.distance += travel;
    this.stepDistance += travel;
    if (this.grounded && !this.flying && this.stepDistance > this.scale * 0.7) {
      if (this.scale > 3)
        env.contact(
          this.position.clone(),
          this.radius,
          this.mass * 9.81 * 0.15 * this.scale,
          true,
        );
      this.stepDistance = 0;
    }
    const g = this.avatar.group;
    g.position.copy(this.position);
    g.scale.setScalar(this.scale);
    g.visible = this.thirdPerson;
    const moving = travel > dt * 0.08,
      heading = moving
        ? Math.atan2(this.velocity.x, this.velocity.z)
        : this.yaw + Math.PI;
    const poseTime = moving
      ? (this.distance * Math.PI * 2) /
        (1.2 * this.scale * 6 * this.avatar.speed)
      : time / Math.sqrt(this.scale);
    posePerson(this.avatar, dt, poseTime, moving ? speed : 0, heading);
    if (this.flying) {
      this.avatar.spine.rotation.x = T.MathUtils.damp(
        this.avatar.spine.rotation.x,
        moving ? -0.42 : 0,
        5,
        dt,
      );
      for (let i = 0; i < 2; i++) {
        this.avatar.shoulders[i].rotation.z =
          (i ? 1 : -1) *
          (0.45 + Math.min(0.35, Math.abs(this.velocity.x) * 0.02));
        this.avatar.shoulders[i].rotation.x = -0.8;
        this.avatar.knees[i].rotation.x = 0.5;
        this.avatar.hips[i].rotation.x = 0.15;
      }
    } else
      this.avatar.spine.rotation.x = T.MathUtils.damp(
        this.avatar.spine.rotation.x,
        0,
        6,
        dt,
      );
    this.updateTrail(x, dt);
    this.surface.update(this.avatar, time);
  }
  private updateTrail(x: number, dt: number) {
    const g = this.avatar.group;
    g.rotation.z = T.MathUtils.damp(
      g.rotation.z,
      this.flying ? T.MathUtils.clamp(-x * 0.22, -0.22, 0.22) : 0,
      5,
      dt,
    );
    const showTrail =
      this.flying && this.thirdPerson && this.velocity.length() > 4;
    g.updateMatrixWorld(true);
    this.trails.forEach((t, i) => {
      const point = this.avatar.elbows[i].localToWorld(
        new T.Vector3(0, -0.25, 0),
      );
      if (!this.trail.visible)
        for (let j = 0; j < 32; j++) point.toArray(t.positions, j * 3);
      else {
        t.positions.copyWithin(3, 0, 93);
        point.toArray(t.positions, 0);
      }
      t.line.geometry.attributes.position.needsUpdate = true;
    });
    this.trail.visible = showTrail;
  }
  jump() {
    if (!this.flying && this.grounded) {
      this.velocity.y = 4.6 * Math.sqrt(this.scale);
      this.grounded = false;
    }
  }
  camera(
    camera: T.PerspectiveCamera,
    blocked: (point: T.Vector3) => boolean,
    dt: number,
  ) {
    camera.fov = T.MathUtils.damp(
      camera.fov,
      68 + (this.flying ? Math.min(12, this.velocity.length() * 0.3) : 0),
      4,
      dt,
    );
    const eye = this.position.clone().add(new T.Vector3(0, this.eye, 0));
    const desired = eye.clone();
    if (this.thirdPerson) {
      const direction = new T.Vector3(0, 0, 1).applyEuler(
        new T.Euler(this.pitch, this.yaw, 0, "YXZ"),
      );
      const length = this.zoom * this.scale;
      for (
        let d = 0.15 * this.scale;
        d <= length;
        d += Math.max(0.08, 0.12 * this.scale)
      ) {
        const p = eye.clone().addScaledVector(direction, d);
        if (blocked(p)) break;
        desired.copy(p);
      }
      desired.y = Math.max(this.position.y + 0.1 * this.scale, desired.y);
    }
    this.cameraPosition.lerp(desired, 1 - Math.exp(-dt * 18));
    if (this.cameraPosition.distanceTo(desired) > Math.max(40, this.scale * 20))
      this.cameraPosition.copy(desired);
    camera.position.copy(this.thirdPerson ? this.cameraPosition : eye);
    camera.near = Math.max(0.015, 0.05 * this.scale);
    camera.updateProjectionMatrix();
    camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    if (this.thirdPerson)
      camera.lookAt(
        eye
          .clone()
          .add(
            new T.Vector3(0, 0, -2 * this.scale).applyEuler(
              new T.Euler(this.pitch, this.yaw, 0, "YXZ"),
            ),
          ),
      );
  }
}
