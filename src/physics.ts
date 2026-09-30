import * as RAPIER from "@dimforge/rapier3d-compat";
import * as T from "three";
import type { Part, Building } from "./world";

export const initializePhysics = () => RAPIER.init();
export class CityPhysics {
  world: RAPIER.World;
  private staticParts = new Map<Part, RAPIER.Collider>();
  private accumulator = 0;
  constructor() {
    this.world = this.createWorld();
  }
  private createWorld() {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    world.numSolverIterations = 4;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(12000, 0.5, 12000)
        .setTranslation(0, -0.7, 0)
        .setFriction(0.8),
    );
    return world;
  }
  clear() {
    this.world.free();
    this.world = this.createWorld();
    this.staticParts.clear();
    this.accumulator = 0;
  }
  bind(city: { parts: Part[]; buildings: Building[] }) {
    const supports = new Set<Part>();
    for (const b of city.buildings)
      for (const floor of b.floors) {
        supports.add(floor.slab);
        floor.columns.forEach((p) => supports.add(p));
      }
    for (const p of city.parts) {
      if (!p.alive || this.staticParts.has(p)) continue;
      const masonry =
        p.building >= 0 &&
        p.shape === "box" &&
        p.s.y > 0.7 &&
        p.s.y < 1 &&
        Math.min(p.s.x, p.s.z) > 0.2;
      const roof = p.building >= 0 && p.s.y === 0.35 && p.s.x > 5 && p.s.z > 5;
      const pavement =
        p.building < 0 &&
        p.shape === "box" &&
        p.s.y <= 0.3 &&
        p.s.x < 12 &&
        p.s.z < 12 &&
        p.p.y < 0.3;
      if (!supports.has(p) && !masonry && !roof && !pavement) continue;
      const desc = RAPIER.ColliderDesc.cuboid(p.s.x / 2, p.s.y / 2, p.s.z / 2)
        .setTranslation(p.p.x, p.p.y, p.p.z)
        .setRotation(p.q)
        .setFriction(0.72)
        .setRestitution(0.08);
      this.staticParts.set(p, this.world.createCollider(desc));
    }
  }
  removePart(part: Part) {
    const collider = this.staticParts.get(part);
    if (collider) {
      this.world.removeCollider(collider, true);
      this.staticParts.delete(part);
    }
  }
  unbind(city: { parts: Part[] }) {
    for (const p of city.parts) this.removePart(p);
  }
  body(
    position: T.Vector3,
    size: T.Vector3,
    velocity: T.Vector3,
    spin: T.Vector3,
    rotation: T.Quaternion,
    colliderOffset = new T.Vector3(),
  ) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setAngvel(spin)
      .setLinearDamping(0.08)
      .setAngularDamping(0.35)
      .setCanSleep(true)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        Math.max(0.015, size.x * 0.48),
        Math.max(0.015, size.y * 0.48),
        Math.max(0.015, size.z * 0.48),
      )
        .setTranslation(colliderOffset.x, colliderOffset.y, colliderOffset.z)
        .setDensity(1200)
        .setFriction(0.68)
        .setRestitution(0.12),
      body,
    );
    return body;
  }
  removeBody(body: RAPIER.RigidBody | null) {
    if (body?.isValid()) this.world.removeRigidBody(body);
  }
  step(dt: number) {
    if (this.world.bodies.len() === 0) return;
    this.accumulator = Math.min(this.accumulator + dt, 0.05);
    while (this.accumulator >= 1 / 60) {
      this.world.step();
      this.accumulator -= 1 / 60;
    }
  }
  floorHeight(x: number, z: number) {
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray({ x, y: 6, z }, { x: 0, y: -1, z: 0 }),
      6,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_FIXED,
    );
    if (!hit || hit.normal.y < 0.35) return 0;
    const body = hit.collider.parent();
    if (!body || (!body.isSleeping() && Math.abs(body.linvel().y) > 0.2))
      return 0;
    return Math.max(0, 6 - hit.timeOfImpact);
  }
  joint(
    a: RAPIER.RigidBody,
    b: RAPIER.RigidBody,
    hinge: boolean,
    at?: T.Vector3,
  ) {
    if (!a.isValid() || !b.isValid()) return;
    const pa = new T.Vector3().copy(a.translation()),
      pb = new T.Vector3().copy(b.translation()),
      point = at?.clone() || pa.clone().add(pb).multiplyScalar(0.5);
    const qa = new T.Quaternion().copy(a.rotation()).invert(),
      qb = new T.Quaternion().copy(b.rotation()).invert();
    const anchorA = point.clone().sub(pa).applyQuaternion(qa),
      anchorB = point.clone().sub(pb).applyQuaternion(qb);
    const data = hinge
      ? RAPIER.JointData.spherical(anchorA, anchorB)
      : RAPIER.JointData.fixed(anchorA, qa, anchorB, qb);
    this.world.createImpulseJoint(data, a, b, true).setContactsEnabled(false);
  }
  get dynamicBodies() {
    return this.world.bodies.len();
  }
  get colliders() {
    return this.world.colliders.len();
  }
}
