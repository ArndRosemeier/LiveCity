import * as T from "three";
import type { Part, Building } from "./world";
import type { WorldLike } from "./world-types";
import { CityPhysics } from "./physics";
import type { RigidBody } from "@dimforge/rapier3d-compat";
interface Debris {
  p: T.Vector3;
  v: T.Vector3;
  scale: T.Vector3;
  rotation: T.Euler;
  spin: T.Vector3;
  life: number;
  settled: boolean;
  color: T.Color;
  body: RigidBody | null;
  geometry?: T.BufferGeometry;
}
interface Dust {
  p: T.Vector3;
  v: T.Vector3;
  age: number;
  life: number;
  size: number;
}
const dummy = new T.Object3D();
export class Destruction {
  root = new T.Group();
  pieces: Debris[] = [];
  clouds: Dust[] = [];
  max = 650;
  cursor = 0;
  destroyed = 0;
  lastImpact: T.Vector3 | null = null;
  impactAge = 0;
  physics = new CityPhysics();
  private mesh: T.InstancedMesh;
  private dust: T.InstancedMesh;
  private actorFragments = new Map<
    T.BufferGeometry,
    { mesh: T.InstancedMesh; slots: Set<number> }
  >();
  private collapses: { building: Building; delay: number; from: number }[] = [];
  constructor() {
    this.mesh = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshStandardMaterial({ roughness: 1 }),
      this.max,
    );
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.dust = new T.InstancedMesh(
      new T.IcosahedronGeometry(1, 1),
      new T.MeshBasicMaterial({
        color: 0xb9ad98,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
      100,
    );
    this.dust.frustumCulled = false;
    this.root.add(this.mesh, this.dust);
    this.clear();
  }
  clear() {
    this.physics.clear();
    for (const batch of this.actorFragments.values()) {
      this.root.remove(batch.mesh);
      batch.mesh.dispose();
    }
    this.actorFragments.clear();
    this.pieces = [];
    this.clouds = [];
    this.cursor = 0;
    this.destroyed = 0;
    this.collapses = [];
    this.lastImpact = null;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, dummy.matrix);
    for (let i = 0; i < 100; i++) this.dust.setMatrixAt(i, dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dust.instanceMatrix.needsUpdate = true;
  }
  private spawn(
    p: T.Vector3,
    s: T.Vector3,
    color: number,
    origin: T.Vector3,
    force: number,
    orientation = new T.Quaternion(),
    geometry?: T.BufferGeometry,
  ) {
    const direction = p.clone().sub(origin);
    if (direction.lengthSq() < 0.1) direction.set(0.3, 1, 0.2);
    direction.normalize();
    const rand = () => Math.random() - 0.5;
    const v = direction.multiplyScalar(force * (0.4 + Math.random() * 0.6));
    v.y += 2 + Math.random() * 3;
    v.x += rand() * 3;
    v.z += rand() * 3;
    const piece: Debris = {
      p: p.clone(),
      v,
      scale: s.clone(),
      rotation: new T.Euler(rand(), rand(), rand()),
      spin: new T.Vector3(rand() * 5, rand() * 5, rand() * 5),
      life: 40,
      settled: false,
      color: new T.Color(color),
      body: null,
      geometry,
    };
    if (this.pieces.length === this.max)
      this.physics.removeBody(this.pieces[this.cursor].body);
    const collisionSize = s.clone(),
      collisionOffset = new T.Vector3();
    if (geometry) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      geometry.boundingBox!.getSize(collisionSize).multiply(s);
      geometry.boundingBox!.getCenter(collisionOffset).multiply(s);
    }
    piece.body = this.physics.body(
      p,
      collisionSize,
      v,
      piece.spin,
      orientation,
      collisionOffset,
    );
    if (this.pieces.length < this.max) this.pieces.push(piece);
    else {
      this.pieces[this.cursor] = piece;
      this.cursor = (this.cursor + 1) % this.max;
    }
    return piece;
  }
  private fracture(
    city: WorldLike,
    part: Part,
    origin: T.Vector3,
    force: number,
  ) {
    if (!part.alive) return;
    city.remove(part);
    this.physics.removePart(part);
    this.destroyed++;
    const cuts = part.s
      .toArray()
      .map((v) => Math.min(4, Math.max(1, Math.ceil(v / 1.8))));
    const size = new T.Vector3(
      part.s.x / cuts[0],
      part.s.y / cuts[1],
      part.s.z / cuts[2],
    );
    for (let x = 0; x < cuts[0]; x++)
      for (let y = 0; y < cuts[1]; y++)
        for (let z = 0; z < cuts[2]; z++) {
          const offset = new T.Vector3(
            (x + 0.5) * size.x - part.s.x * 0.5,
            (y + 0.5) * size.y - part.s.y * 0.5,
            (z + 0.5) * size.z - part.s.z * 0.5,
          ).applyQuaternion(part.q);
          this.spawn(
            part.p.clone().add(offset),
            size,
            part.color,
            origin,
            force,
            part.q,
          );
        }
  }
  hit(city: WorldLike, point: T.Vector3, radius: number, power = 1) {
    this.lastImpact = point.clone();
    this.impactAge = 0;
    const damaged = new Set<Building>();
    for (const p of city.parts) {
      if (!p.alive || (p.building < 0 && (p.s.x > 25 || p.s.z > 25))) continue;
      const dist = p.p.distanceTo(point);
      if (dist < radius) {
        this.fracture(city, p, point, (radius - dist) * power + 2);
        if (p.building >= 0) damaged.add(p.owner || city.buildings[p.building]);
      }
    }
    for (const b of damaged) {
      for (let floor = 0; floor < b.floors.length; floor++) {
        const base = 0.3 + floor * 3.1;
        const { columns, slab } = b.floors[floor];
        if (columns.filter((p) => p.alive).length < 3 || !slab?.alive) {
          if (base < b.collapseFrom) {
            b.collapseFrom = base;
            b.collapsed = floor === 0;
            const queued = this.collapses.find((c) => c.building === b);
            if (queued) queued.from = base;
            else this.collapses.push({ building: b, delay: 0.25, from: base });
          }
          break;
        }
      }
    }
    for (const person of city.citizens) {
      if (person.alive && person.group.position.distanceTo(point) < radius) {
        person.alive = false;
        person.group.visible = false;
        this.breakGroup(person.group, point, power * 3);
        city.population--;
      }
    }
    for (const car of city.cars) {
      if (car.alive && car.group.position.distanceTo(point) < radius + 1.3) {
        car.alive = false;
        car.group.visible = false;
        this.breakGroup(car.group, point, power * 5);
      }
    }
    for (let i = 0; i < Math.min(16, radius * 3); i++)
      this.clouds.push({
        p: point
          .clone()
          .add(
            new T.Vector3(
              (Math.random() - 0.5) * radius,
              Math.random() * 2,
              (Math.random() - 0.5) * radius,
            ),
          ),
        v: new T.Vector3(
          (Math.random() - 0.5) * 1.2,
          0.7 + Math.random(),
          (Math.random() - 0.5) * 1.2,
        ),
        age: 0,
        life: 3 + Math.random() * 2,
        size: 0.7 + Math.random(),
      });
    if (this.clouds.length > 100)
      this.clouds.splice(0, this.clouds.length - 100);
  }
  private breakGroup(group: T.Group, point: T.Vector3, force: number) {
    group.updateMatrixWorld(true);
    const members: { mesh: T.Mesh; piece: Debris }[] = [];
    group.traverse((o) => {
      if (o instanceof T.Mesh) {
        const p = new T.Vector3(),
          s = new T.Vector3(),
          q = new T.Quaternion();
        o.matrixWorld.decompose(p, q, s);
        const mat = o.material as T.MeshStandardMaterial;
        members.push({
          mesh: o,
          piece: this.spawn(
            p,
            s,
            mat.color.getHex(),
            point,
            force,
            q,
            o.geometry,
          ),
        });
      }
    });
    if (!group.userData.vehicle) {
      const torso = members[0],
        head = members[1];
      for (let i = 1; i < members.length; i++) {
        const child = members[i];
        let parent = torso;
        let hinge = false;
        if (child.mesh.parent === group) {
          if (i === 1) hinge = true;
          else if (child.mesh.position.y > 1.35) parent = head;
        } else {
          const first = members.find(
            (m) => m.mesh.parent === child.mesh.parent,
          );
          if (first && first !== child) parent = first;
          else hinge = true;
        }
        const declared = members.find(
          (m) => m.mesh === child.mesh.userData.jointParent,
        );
        if (declared) {
          parent = declared;
          hinge = !!child.mesh.userData.jointHinge;
        }
        const anchor = child.mesh.userData.jointAnchor as
          T.Object3D | undefined;
        if (parent?.piece.body && child.piece.body)
          this.physics.joint(
            parent.piece.body,
            child.piece.body,
            hinge,
            anchor?.getWorldPosition(new T.Vector3()),
          );
      }
    }
  }
  floorHeight(x: number, z: number) {
    return this.physics.floorHeight(x, z);
  }
  bindCity(city: { parts: Part[]; buildings: Building[] }) {
    this.physics.bind(city);
  }
  update(dt: number, city: WorldLike) {
    this.impactAge += dt;
    if (this.impactAge > 8) this.lastImpact = null;
    for (let i = this.collapses.length - 1; i >= 0; i--) {
      const c = this.collapses[i];
      c.delay -= dt;
      if (c.delay > 0) continue;
      const b = c.building;
      let count = 0;
      for (const p of b.parts) {
        if (p.alive && p.p.y >= c.from - 0.01) {
          this.fracture(city, p, new T.Vector3(b.x, b.h * 0.8, b.z), 1.8);
          if (++count >= 14) break;
        }
      }
      city.root.traverse((o) => {
        if (
          (o.userData.building === b ||
            o.userData.building === city.buildings.indexOf(b)) &&
          o.position.y >= c.from
        )
          o.visible = false;
      });
      if (count === 0) this.collapses.splice(i, 1);
      else c.delay = 0.025;
    }
    this.physics.step(dt);
    const hidden = new T.Matrix4().makeScale(0, 0, 0);
    for (const batch of this.actorFragments.values()) {
      for (const i of batch.slots) batch.mesh.setMatrixAt(i, hidden);
      batch.slots.clear();
    }
    this.pieces.forEach((p, i) => {
      p.life -= dt;
      if (p.body) {
        if (p.life <= 0) {
          this.physics.removeBody(p.body);
          p.body = null;
        } else {
          p.p.copy(p.body.translation());
          p.v.copy(p.body.linvel());
          p.rotation.setFromQuaternion(
            new T.Quaternion().copy(p.body.rotation()),
          );
          p.settled = p.body.isSleeping();
        }
      }
      dummy.position.copy(p.p);
      dummy.rotation.copy(p.rotation);
      dummy.scale
        .copy(p.scale)
        .multiplyScalar(Math.min(1, Math.max(0, p.life)));
      dummy.updateMatrix();
      let target = this.mesh;
      if (p.geometry) {
        let batch = this.actorFragments.get(p.geometry);
        if (!batch) {
          const mesh = new T.InstancedMesh(
            p.geometry,
            this.mesh.material,
            this.max,
          );
          mesh.frustumCulled = false;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
          for (let j = 0; j < this.max; j++) mesh.setMatrixAt(j, hidden);
          batch = { mesh, slots: new Set() };
          this.actorFragments.set(p.geometry, batch);
          this.root.add(mesh);
        }
        target = batch.mesh;
        batch.slots.add(i);
        this.mesh.setMatrixAt(i, hidden);
      }
      target.setMatrixAt(i, dummy.matrix);
      target.setColorAt(i, p.color);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (const batch of this.actorFragments.values()) {
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
    }
    this.clouds = this.clouds.filter((p) => p.age < p.life);
    for (let i = 0; i < 100; i++) {
      const p = this.clouds[i];
      if (p) {
        p.age += dt;
        p.p.addScaledVector(p.v, dt);
        dummy.position.copy(p.p);
        dummy.rotation.set(0, p.age * 0.2, 0);
        dummy.scale.setScalar(
          p.size * (1 + p.age * 0.7) * Math.sin((Math.PI * p.age) / p.life),
        );
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix();
      this.dust.setMatrixAt(i, dummy.matrix);
    }
    this.dust.instanceMatrix.needsUpdate = true;
  }
}
