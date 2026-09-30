import * as T from "three";
import { Random } from "./random";
import type { BuildingPlan } from "./plan";
import { massing } from "./plan";
import type { Part, Building } from "./world";
import type { StreamingCity } from "./streaming-city";
export interface Room {
  x: number;
  z: number;
  w: number;
  d: number;
  purpose: string;
}
export interface InteriorLayout {
  floor: number;
  rooms: Room[];
  clearHeight: number;
  corridor: number;
}
export function interiorLayout(b: BuildingPlan, floor: number): InteriorLayout {
  b = { ...b, ...massing(b, floor) };
  const corridor = 2.4,
    w = (b.w - corridor - 0.7) / 2,
    d = (b.d - 0.7) / 2;
  const rooms: Room[] = [];
  for (const side of [-1, 1])
    for (const end of [-1, 1])
      rooms.push({
        x: b.x + side * (corridor / 2 + w / 2),
        z: b.z + (end * d) / 2,
        w,
        d,
        purpose:
          floor === 0
            ? ["cafe", "studio", "office", "shop"][rooms.length]
            : ["living room", "bedroom", "kitchen", "bathroom"][rooms.length],
      });
  return { floor, rooms, clearHeight: 2.88, corridor };
}
interface Door {
  part: Part;
  closed: T.Vector3;
  open: boolean;
}
export class Interiors {
  root = new T.Group();
  parts: Part[] = [];
  batches: T.InstancedMesh[] = [];
  doors: Door[] = [];
  active: BuildingPlan | null = null;
  floor = 0;
  owner: Building | null = null;
  private dead = new Map<string, number[]>();
  constructor(private city: () => StreamingCity) {}
  doorPoint(b: BuildingPlan) {
    return new T.Vector3(b.x, 0.41, b.z + b.front * (b.d / 2 + 0.2));
  }
  nearest(point: T.Vector3) {
    let best: BuildingPlan | undefined,
      dist = 3;
    for (const b of this.city().nearBuildings(point, 3)) {
      const d = this.doorPoint(b).distanceTo(point);
      if (d < dist) {
        best = b;
        dist = d;
      }
    }
    return best;
  }
  enter(b: BuildingPlan, scale: number) {
    if (scale * 1.78 > 2.65 || scale * 0.58 > 1.5)
      return "You do not fit through this doorway. Shrink with numpad −.";
    const city = this.city();
    city.requestDistrict(b.district, true);
    const owner = city.buildings.find((o) => o.x === b.x && o.z === b.z);
    if (!owner)
      return "Street detail is growing. Try the door again in a moment.";
    if (owner.collapsed || owner.collapseFrom < 3.1)
      return "This building is unsafe after structural damage.";
    this.active = b;
    this.owner = owner;
    this.floor = 0;
    // Open an actual aperture through the generated ground-floor facade.
    const door = this.doorPoint(b);
    for (const p of owner.parts)
      if (
        p.alive &&
        p.p.y < 3.05 &&
        p.p.y > 0.45 &&
        Math.abs(p.p.x - b.x) < 1.65 &&
        Math.abs(p.p.z - door.z) < 0.7
      ) {
        city.remove(p);
        city.physicsRemove(p);
      }
    this.generate();
    return "";
  }
  floorY() {
    return 0.41 + this.floor * 3.1;
  }
  changeFloor(delta: number) {
    if (!this.active || !this.owner) return false;
    const next = T.MathUtils.clamp(
      this.floor + delta,
      0,
      this.active.floors - 1,
    );
    if (0.3 + next * 3.1 >= this.owner.collapseFrom || next === this.floor)
      return false;
    this.store();
    this.floor = next;
    this.generate();
    return true;
  }
  private store() {
    if (this.active)
      this.dead.set(
        this.active.id + "/" + this.floor,
        this.parts.flatMap((p, i) => (p.alive ? [] : [i])),
      );
  }
  exit() {
    this.store();
    this.clear();
    this.active = null;
    this.owner = null;
  }
  private clear() {
    const city = this.city();
    city.detachInterior(this.parts, this.batches);
    for (const m of this.batches) {
      m.geometry.dispose();
      (m.material as T.Material).dispose();
      m.dispose();
    }
    this.parts = [];
    this.batches = [];
    this.doors = [];
    this.root.clear();
    this.city().interiorView = null;
  }
  private generate() {
    this.clear();
    const b = { ...this.active!, ...massing(this.active!, this.floor) },
      r = new Random(b.seed + "/interior/" + this.floor),
      layout = interiorLayout(this.active!, this.floor),
      base = this.floorY();
    const add = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: number,
    ) => {
      const p: Part = {
        p: new T.Vector3(x, base + y, z),
        s: new T.Vector3(w, h, d),
        q: new T.Quaternion(),
        color: c,
        shape: "box",
        building: 0,
        owner: this.owner!,
        alive: true,
      };
      this.parts.push(p);
      return p;
    };
    // Perimeter walls sit inside the exterior shell, with a full-height entrance gap.
    for (const side of [-1, 1])
      add(
        b.x + side * (b.w / 2 - 0.25),
        1.4,
        b.z,
        0.16,
        2.8,
        b.d - 0.5,
        0xd2c7af,
      );
    for (const side of [-1, 1]) {
      const z = b.z + side * (b.d / 2 - 0.25);
      if (side === b.front && this.floor === 0) {
        for (const dx of [-1, 1])
          add(
            b.x + dx * (b.w / 4 + 0.45),
            1.4,
            z,
            b.w / 2 - 1.1,
            2.8,
            0.16,
            0xd2c7af,
          );
        add(b.x, 2.67, z, 1.8, 0.27, 0.16, 0xd2c7af);
      } else add(b.x, 1.4, z, b.w - 0.5, 2.8, 0.16, 0xd2c7af);
    }
    for (const side of [-1, 1]) {
      const x = b.x + side * 1.2;
      for (const end of [-1, 1]) {
        const z = b.z + end * b.d * 0.25;
        const length = b.d / 2 - 0.35;
        for (const e of [-1, 1])
          add(
            x,
            1.4,
            z + e * (length / 4 + 0.27),
            0.12,
            2.8,
            length / 2 - 0.65,
            0xe1d7c2,
          );
        add(x, 2.52, z, 0.12, 0.56, 1.1, 0xe1d7c2);
        const p = add(x, 1.04, z, 0.08, 2.08, 1.02, 0x866449);
        this.doors.push({ part: p, closed: p.p.clone(), open: false });
      }
      add(
        b.x + side * (b.w / 4 + 0.6),
        1.4,
        b.z,
        b.w / 2 - 1.55,
        2.8,
        0.12,
        0xe1d7c2,
      );
    }
    for (const room of layout.rooms) {
      const color = r.pick([0x8f9a82, 0x9b826b, 0x7d9297]);
      add(room.x, 0.018, room.z, room.w - 0.3, 0.03, room.d - 0.3, 0x9e896e);
      if (room.purpose === "bedroom") {
        add(room.x, 0.25, room.z, 1.65, 0.5, 2.1, 0x6d5544);
        add(room.x, 0.54, room.z, 1.6, 0.13, 2, 0xddd6c4);
        add(room.x, 0.64, room.z - 0.65, 1.35, 0.14, 0.45, color);
      } else if (room.purpose === "bathroom") {
        add(room.x, 0.38, room.z, 0.7, 0.76, 0.8, 0xe5e0ce);
        add(room.x + 0.9, 1.1, room.z, 0.8, 0.15, 0.5, 0xe5e0ce);
        add(room.x - 0.8, 0.6, room.z + 1, 1.5, 1.2, 0.08, 0x5d8289);
      } else if (room.purpose === "kitchen") {
        add(
          room.x,
          0.45,
          room.z + room.d / 2 - 0.65,
          room.w - 1,
          0.9,
          0.65,
          0x777d66,
        );
        add(
          room.x,
          0.94,
          room.z + room.d / 2 - 0.65,
          room.w - 1,
          0.08,
          0.72,
          0xd6d4c2,
        );
        add(room.x + room.w / 2 - 0.6, 1, room.z, 0.8, 2, 0.8, 0xb7bcb1);
      } else {
        add(room.x, 0.38, room.z, 2.2, 0.76, 0.85, color);
        add(room.x, 0.9, room.z + 0.32, 2.2, 0.65, 0.17, color);
        add(room.x, 0.35, room.z - 1.5, 1.5, 0.7, 0.85, 0x967657);
        for (const s of [-1, 1])
          add(room.x + s, 0.4, room.z - 1.5, 0.5, 0.8, 0.5, color);
      }
      add(
        room.x + room.w / 2 - 0.45,
        1.05,
        room.z - room.d / 2 + 0.45,
        0.65,
        2.1,
        0.5,
        0x967657,
      );
      for (let i = 0; i < 4; i++)
        add(
          room.x + room.w / 2 - 0.42,
          0.35 + i * 0.48,
          room.z - room.d / 2 + 0.43,
          0.5,
          0.08,
          0.46,
          0xc0a779,
        );
      add(room.x, 2.75, room.z, 0.7, 0.08, 0.7, 0xf4d39b);
    }
    // Elevator at the end of the central accessible corridor.
    add(b.x, 1.2, b.z - b.front * (b.d / 2 - 0.5), 1.6, 2.4, 0.12, 0x647879);
    const dead = this.dead.get(b.id + "/" + this.floor) || [];
    for (const i of dead) if (this.parts[i]) this.parts[i].alive = false;
    const groups = new Map<number, Part[]>();
    for (const p of this.parts) {
      if (!groups.has(p.color)) groups.set(p.color, []);
      groups.get(p.color)!.push(p);
    }
    const dummy = new T.Object3D();
    for (const [c, parts] of groups) {
      const m = new T.InstancedMesh(
        new T.BoxGeometry(1, 1, 1),
        new T.MeshStandardMaterial({
          color: c,
          roughness: 0.8,
          emissive: c === 0xf4d39b ? c : 0,
          emissiveIntensity: 0.5,
        }),
        parts.length,
      );
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.parts = parts;
      parts.forEach((p, i) => {
        p.mesh = m;
        p.index = i;
        dummy.position.copy(p.p);
        dummy.scale.copy(p.s);
        dummy.updateMatrix();
        m.setMatrixAt(
          i,
          p.alive ? dummy.matrix : new T.Matrix4().makeScale(0, 0, 0),
        );
      });
      this.root.add(m);
      this.batches.push(m);
    }
    const light = new T.PointLight(0xffd6a1, 35, Math.max(b.w, b.d), 2);
    light.position.set(b.x, base + 2.45, b.z);
    this.root.add(light);
    this.city().interiorView = {
      building: b.id,
      floor: this.floor,
      rooms: layout.rooms,
    };
    this.city().attachInterior(this.parts, this.batches, this.owner!);
  }
  interact(point: T.Vector3) {
    for (const door of this.doors)
      if (door.part.alive && door.closed.distanceTo(point) < 2) {
        door.open = !door.open;
        door.part.p.copy(door.closed);
        door.part.q.setFromAxisAngle(
          new T.Vector3(0, 1, 0),
          door.open ? Math.PI / 2 : 0,
        );
        if (door.open) {
          door.part.p.x += 0.48;
          door.part.p.z += 0.46;
        }
        const o = new T.Object3D();
        o.position.copy(door.part.p);
        o.quaternion.copy(door.part.q);
        o.scale.copy(door.part.s);
        o.updateMatrix();
        door.part.mesh!.setMatrixAt(door.part.index!, o.matrix);
        door.part.mesh!.instanceMatrix.needsUpdate = true;
        this.city().physicsRemove(door.part);
        this.city().physicsInterior([door.part]);
        return true;
      }
    return false;
  }
  blocked(x: number, y: number, z: number, r: number, h: number) {
    if (!this.active) return false;
    if (y + h > this.floorY() + 2.86 || y < this.floorY() - 0.1) return true;
    return this.parts.some(
      (p) =>
        p.alive &&
        p.s.y > 0.08 &&
        y < p.p.y + p.s.y / 2 &&
        y + h > p.p.y - p.s.y / 2 &&
        Math.abs(x - p.p.x) < (Math.abs(p.q.y) > 0.5 ? p.s.z : p.s.x) / 2 + r &&
        Math.abs(z - p.p.z) < (Math.abs(p.q.y) > 0.5 ? p.s.x : p.s.z) / 2 + r,
    );
  }
  get elevator() {
    return this.active
      ? new T.Vector3(
          this.active.x,
          this.floorY(),
          this.active.z -
            this.active.front * (massing(this.active, this.floor).d / 2 - 1.5),
        )
      : null;
  }
}
