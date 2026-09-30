import * as T from "three";
import { Random } from "./random";
import { finish } from "./surfaces";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
type Shape = "box" | "sphere" | "cylinder" | "ring";
export interface Part {
  p: T.Vector3;
  s: T.Vector3;
  q: T.Quaternion;
  color: number;
  shape: Shape;
  building: number;
  alive: boolean;
  mesh?: T.InstancedMesh;
  index?: number;
}
export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  parts: Part[];
  floors: { slab: Part; columns: Part[] }[];
  collapsed: boolean;
  collapseFrom: number;
}
interface Citizen {
  group: T.Group;
  legs: T.Group[];
  arms: T.Group[];
  axis: "x" | "z";
  lane: number;
  dir: number;
  speed: number;
  phase: number;
  alive: boolean;
}
interface Car {
  group: T.Group;
  axis: "x" | "z";
  lane: number;
  dir: number;
  speed: number;
  alive: boolean;
}
const geometries = {
  box: new T.BoxGeometry(1, 1, 1),
  sphere: new T.IcosahedronGeometry(0.5, 2),
  cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 12),
  ring: new T.TorusGeometry(0.5, 0.055, 6, 20),
};
const matrix = new T.Matrix4(),
  zero = new T.Matrix4().makeScale(0, 0, 0);
export class City {
  root = new T.Group();
  parts: Part[] = [];
  buildings: Building[] = [];
  batches: T.InstancedMesh[] = [];
  citizens: Citizen[] = [];
  cars: Car[] = [];
  rng: Random;
  roads = [-64, -32, 0, 32, 64];
  population = 0;
  districts = 0;
  private materials = new Map<number, T.MeshStandardMaterial>();
  private actorBatches: {
    mesh: T.InstancedMesh;
    entries: { object: T.Mesh; owner: T.Group }[];
  }[] = [];
  constructor(public seed: string) {
    this.rng = new Random(seed);
    const widths = Array.from({ length: 4 }, () => this.rng.range(28, 36));
    const factor = 128 / widths.reduce((a, b) => a + b, 0);
    this.roads = [-64];
    for (const w of widths) this.roads.push(this.roads.at(-1)! + w * factor);
    this.build();
    this.batch();
    this.people();
    this.traffic();
    this.batchActors();
  }
  material(color: number) {
    let m = this.materials.get(color);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness: 0.86 });
      if (
        [
          0xbab2a0, 0xa78268, 0xb8afa0, 0x9d9e90, 0xbdad93, 0x956d59, 0x7a8d89,
        ].includes(color)
      )
        finish(m, [0xa78268, 0x956d59].includes(color) ? "brick" : "plaster");
      if (color === 0x41494a) finish(m, "asphalt");
      if (color === 0x9a9e90) finish(m, "stone");
      if (color === 0x967657) finish(m, "wood");
      if (color === 0x344c53 || color === 0x29434a) {
        m.roughness = 0.22;
        m.metalness = 0.45;
      }
      this.materials.set(color, m);
    }
    return m;
  }
  add(
    shape: Shape,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    building = -1,
    ry = 0,
  ) {
    const part: Part = {
      p: new T.Vector3(x, y, z),
      s: new T.Vector3(sx, sy, sz),
      q: new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), ry),
      color,
      shape,
      building,
      alive: true,
    };
    this.parts.push(part);
    if (building >= 0) this.buildings[building].parts.push(part);
    return part;
  }
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
    b = -1,
    r = 0,
  ) {
    return this.add("box", x, y, z, w, h, d, c, b, r);
  }
  private build() {
    const r = this.rng;
    this.box(0, -1.2, 0, 154, 2, 154, 0x606c62);
    for (const x of this.roads) {
      for (let z = -72; z <= 72; z += 3) {
        this.box(x, -0.07, z, 9, 0.2, 2.98, 0x41494a);
        if (this.roads.every((v) => Math.abs(v - z) > 5.8))
          this.box(z, -0.065, x, 2.98, 0.2, 9, 0x41494a);
      }
      for (let z = -72; z < 74; z += 5) {
        if (this.roads.every((v) => Math.abs(v - z) > 6)) {
          this.box(x, 0.045, z, 0.12, 0.025, 2, 0xc4bda6);
          this.box(z, 0.045, x, 2, 0.025, 0.12, 0xc4bda6);
        }
      }
    }
    for (const x of this.roads)
      for (const z of this.roads) {
        for (let i = -3; i <= 3; i++) {
          this.box(x + i, 0.05, z + 5.2, 0.48, 0.03, 2.1, 0xded9bf);
          this.box(x + 5.2, 0.05, z + i, 2.1, 0.03, 0.48, 0xded9bf);
        }
      }
    let block = 0;
    for (let ix = 0; ix < 4; ix++)
      for (let iz = 0; iz < 4; iz++) {
        const x = (this.roads[ix] + this.roads[ix + 1]) / 2,
          z = (this.roads[iz] + this.roads[iz + 1]) / 2,
          bw = this.roads[ix + 1] - this.roads[ix] - 10,
          bd = this.roads[iz + 1] - this.roads[iz] - 10;
        for (let a = -bw / 2 + 1.25; a < bw / 2; a += 2.5)
          for (let b = -bd / 2 + 1.25; b < bd / 2; b += 2.5)
            this.box(x + a, 0.08, z + b, 2.48, 0.3, 2.48, 0x9a9e90);
        if ((ix === 1 && iz === 1) || r.next() < 0.12) {
          this.park(x, z);
          continue;
        }
        for (const dx of [-bw / 4, bw / 4])
          for (const dz of [-bd / 4, bd / 4]) {
            const w = bw / 2 - r.range(1.2, 2.2),
              d = bd / 2 - r.range(1.2, 2.2);
            const floors = r.int(2, 7) + (ix === 2 && iz === 2 ? 3 : 0);
            this.building(x + dx, z + dz, w, d, floors, block++);
          }
        for (const a of [-bw / 2, bw / 2]) {
          this.tree(x + a, z - bd * 0.36);
          this.tree(x + a, z + bd * 0.36);
          this.lamp(x + a, z);
          this.bench(x + a, z + 3, a > 0 ? Math.PI / 2 : -Math.PI / 2);
        }
        this.box(x - 11.8, 0.55, z - 3, 0.6, 1, 0.6, 0x365152);
        this.box(x - 11.8, 1.07, z - 3, 0.7, 0.1, 0.7, 0x242e30);
        this.bicycle(x + bw / 2, z - 3);
        this.cafe(x - bw / 2, z + 4);
        this.add(
          "cylinder",
          x - bw / 2,
          0.45,
          z - bd / 2,
          0.25,
          0.7,
          0.25,
          0xa15c45,
        );
        this.add(
          "sphere",
          x - bw / 2,
          0.86,
          z - bd / 2,
          0.33,
          0.24,
          0.33,
          0xa15c45,
        );
      }
    for (const x of this.roads)
      for (const z of this.roads) {
        this.lamp(x + 5.6, z + 6.2);
        if (Math.abs(x) < 64 && Math.abs(z) < 64) {
          this.box(x - 5.7, 1.8, z + 5.6, 0.12, 3.4, 0.12, 0x313f3f);
          this.box(x - 5.7, 3.5, z + 5.6, 0.65, 0.7, 0.1, 0x465c55);
        }
      }
    for (const x of this.roads.slice(1, -1))
      for (const z of this.roads.slice(1, -1)) {
        for (const side of [-1, 1]) {
          this.add(
            "cylinder",
            x + side * 5.3,
            1.7,
            z + side * 5.3,
            0.12,
            3.4,
            0.12,
            0x354845,
          );
          this.box(
            x + side * 5.3,
            3.15,
            z + side * 5.3,
            0.3,
            0.8,
            0.32,
            0x293d3e,
          );
          this.add(
            "sphere",
            x + side * 5.3,
            3.37,
            z + side * 5.3 + 0.17,
            0.13,
            0.13,
            0.08,
            0xc67051,
          );
          this.add(
            "sphere",
            x + side * 5.3,
            2.93,
            z + side * 5.3 + 0.17,
            0.13,
            0.13,
            0.08,
            0x93ae76,
          );
        }
      }
    this.districts = block;
  }
  private building(
    x: number,
    z: number,
    w: number,
    d: number,
    floors: number,
    _id: number,
  ) {
    const r = this.rng,
      b = this.buildings.length,
      h = floors * 3.1;
    this.buildings.push({
      x,
      z,
      w,
      d,
      h,
      parts: [],
      floors: [],
      collapsed: false,
      collapseFrom: Infinity,
    });
    const c = r.pick([
      0xbab2a0, 0xa78268, 0xb8afa0, 0x9d9e90, 0xbdad93, 0x956d59, 0x7a8d89,
    ]);
    const trim = r.pick([0xd4cbb4, 0xc0bca9, 0x667774]);
    // Each floor is a hollow, separately destructible shell with beams and facade bays.
    for (let f = 0; f < floors; f++) {
      const y = 0.3 + f * 3.1;
      const support = {
        slab: this.box(x, y, z, w, 0.22, d, trim, b),
        columns: [] as Part[],
      };
      this.buildings[b].floors.push(support);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const xx = x - w / 2 + ((i + 0.5) * w) / 4,
            zz = z + (side * d) / 2;
          const bay = w / 4;
          this.box(xx, y + 0.39, zz, bay - 0.04, 0.74, 0.28, c, b);
          this.box(xx, y + 2.53, zz, bay - 0.04, 0.91, 0.28, c, b);
          for (const edge of [-1, 1])
            this.box(
              xx + edge * (bay / 4 + 0.3375),
              y + 1.59,
              zz,
              (bay - 1.35) / 2,
              1.65,
              0.28,
              c,
              b,
            );
          this.box(
            xx,
            y + 1.65,
            zz + side * 0.16,
            1.35,
            1.65,
            0.07,
            0x344c53,
            b,
          );
          this.box(xx, y + 1.65, zz + side * 0.22, 0.055, 1.65, 0.08, trim, b);
          this.box(xx, y + 1.65, zz + side * 0.22, 1.35, 0.055, 0.08, trim, b);
          this.box(xx, y + 0.77, zz + side * 0.2, 1.55, 0.13, 0.32, trim, b);
          if (r.next() < 0.24)
            this.box(
              xx,
              y + 1.65,
              zz + side * 0.205,
              0.92,
              1.35,
              0.045,
              0xc9af77,
              b,
            );
        }
        for (let i = 0; i < 3; i++) {
          const zz = z - d / 2 + ((i + 0.5) * d) / 3,
            xx = x + (side * w) / 2;
          const bay = d / 3;
          this.box(xx, y + 0.39, zz, 0.28, 0.74, bay - 0.04, c, b);
          this.box(xx, y + 2.53, zz, 0.28, 0.91, bay - 0.04, c, b);
          for (const edge of [-1, 1])
            this.box(
              xx,
              y + 1.59,
              zz + edge * (bay / 4 + 0.3375),
              0.28,
              1.65,
              (bay - 1.35) / 2,
              c,
              b,
            );
          this.box(
            xx + side * 0.16,
            y + 1.65,
            zz,
            0.07,
            1.65,
            1.35,
            0x344c53,
            b,
          );
          this.box(xx + side * 0.22, y + 1.65, zz, 0.08, 1.65, 0.055, trim, b);
          this.box(xx + side * 0.22, y + 0.77, zz, 0.32, 0.13, 1.55, trim, b);
        }
      }
      for (const dx of [-w / 2, w / 2])
        for (const dz of [-d / 2, d / 2])
          support.columns.push(
            this.box(x + dx, y + 1.5, z + dz, 0.36, 3, 0.36, trim, b),
          );
      if (f > 0 && f % 2 === 0) {
        this.box(x, y + 0.05, z + d / 2 + 0.35, w + 0.3, 0.14, 0.85, trim, b);
        this.box(x, y + 0.7, z + d / 2 + 0.68, w, 0.65, 0.055, 0x42514f, b);
      }
    }
    this.box(x, h + 0.4, z, w + 0.6, 0.35, d + 0.6, 0x59635c, b);
    for (const side of [-1, 1]) {
      this.box(x + (side * w) / 2, h + 0.8, z, 0.16, 0.7, d + 0.4, trim, b);
      this.box(x, h + 0.8, z + (side * d) / 2, w, 0.7, 0.16, trim, b);
    }
    this.box(x + 1, h + 0.95, z + 1, 1.9, 1, 1.2, 0x73817a, b);
    this.box(x - 2, h + 0.65, z - 1, 2, 0.2, 3, 0x384c54, b, -0.15);
    const nearest = this.roads.reduce((a, v) =>
        Math.abs(v - z) < Math.abs(a - z) ? v : a,
      ),
      dir = nearest > z ? 1 : -1,
      front = z + (dir * d) / 2;
    this.box(x, 0.3 + 1.15, front + dir * 0.18, 1.35, 2.3, 0.1, 0x263e43, b);
    // Framed shop glazing, transoms, a brass handle, planter boxes, and outdoor seating.
    for (const side of [-1, 1]) {
      this.box(
        x + side * w * 0.3,
        1.5,
        front + dir * 0.2,
        w * 0.25,
        2,
        0.12,
        0x344c53,
        b,
      );
      this.box(
        x + side * w * 0.3,
        2.53,
        front + dir * 0.25,
        w * 0.28,
        0.08,
        0.16,
        trim,
        b,
      );
      this.box(
        x + side * 0.66,
        1.5,
        front + dir * 0.3,
        0.06,
        2.3,
        0.08,
        trim,
        b,
      );
      this.box(
        x + side * w * 0.36,
        0.6,
        front + dir * 0.7,
        1.4,
        0.7,
        0.5,
        0x70533e,
        b,
      );
      for (let k = 0; k < 3; k++)
        this.add(
          "sphere",
          x + side * w * 0.36 + (k - 1) * 0.4,
          1.08,
          front + dir * 0.7,
          0.55,
          0.65,
          0.6,
          0x687c50,
          b,
        );
    }
    this.box(x + 0.43, 1.4, front + dir * 0.3, 0.04, 0.25, 0.04, 0xc6ad82, b);
    this.box(
      x,
      2.95,
      front + dir * 0.28,
      w - 0.7,
      0.48,
      0.25,
      r.pick([0x486866, 0x8c5845, 0x65684a]),
      b,
    );
    this.sign(
      x,
      2.95,
      front + dir * 0.43,
      w - 1.2,
      r.pick([
        "ATELIER",
        "CORNER COFFEE",
        "PROVISIONS",
        "STUDIO 04",
        "BOOKS & PAPER",
        "BOTANICA",
      ]),
      dir,
      b,
    );
    if (r.next() < 0.5) {
      this.box(x, 2.55, front + dir * 0.85, w - 0.5, 0.12, 1.5, 0xc6ad82, b);
      for (let i = 0; i < 8; i++)
        this.box(
          x - w / 2 + 0.6 + (i * (w - 1)) / 8,
          2.48,
          front + dir * 1.55,
          (w - 1) / 8,
          0.26,
          0.12,
          i % 2 ? 0xc6ad82 : 0x5b7770,
          b,
        );
    }
    if (r.next() < 0.25) {
      for (let f = 1; f < floors; f++) {
        this.box(x - w / 2 - 0.65, f * 3.1 + 0.4, z, 1, 0.12, 2.3, 0x394b48, b);
        for (const zz of [-1, 1]) {
          this.box(
            x - w / 2 - 1.1,
            f * 3.1 + 0.9,
            z + zz,
            0.05,
            1,
            0.05,
            0x394b48,
            b,
          );
          this.box(
            x - w / 2 - 0.65,
            f * 3.1 + 1.4,
            z + zz,
            1,
            0.06,
            0.06,
            0x394b48,
            b,
          );
        }
        for (let y = 0; y < 3; y += 0.3)
          this.box(
            x - w / 2 - 0.9,
            f * 3.1 + y,
            z + 0.5,
            0.55,
            0.045,
            0.05,
            0x394b48,
            b,
          );
      }
    }
  }
  private sign(
    x: number,
    y: number,
    z: number,
    w: number,
    label: string,
    dir: number,
    b: number,
  ) {
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 64;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#eee4c7";
    ctx.font = "500 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 256, 42);
    const texture = new T.CanvasTexture(cv);
    const mat = new T.MeshStandardMaterial({
      map: texture,
      transparent: true,
      roughness: 1,
      side: T.DoubleSide,
    });
    const mesh = new T.Mesh(new T.PlaneGeometry(w, 0.4), mat);
    mesh.position.set(x, y, z);
    if (dir < 0) mesh.rotation.y = Math.PI;
    mesh.userData.building = b;
    mesh.userData.anchor = this.buildings[b].parts.at(-1);
    this.root.add(mesh);
  }
  tree(x: number, z: number) {
    this.add("cylinder", x, 1.25, z, 0.3, 2.5, 0.3, 0x70533e);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4;
      this.add(
        "sphere",
        x + Math.sin(a) * 0.65,
        2.9 + (i % 2) * 0.55,
        z + Math.cos(a) * 0.65,
        2.5,
        2.6,
        2.3,
        this.rng.pick([0x536947, 0x687c50, 0x79845b]),
      );
    }
  }
  lamp(x: number, z: number) {
    this.add("cylinder", x, 2.1, z, 0.09, 4.2, 0.09, 0x394b48);
    this.box(x, 4.2, z, 0.5, 0.13, 0.5, 0x33443f);
    this.box(x, 4.08, z, 0.3, 0.2, 0.3, 0xf4d39b);
  }
  private rod(a: T.Vector3, b: T.Vector3, width: number, color: number) {
    const p = a.clone().add(b).multiplyScalar(0.5),
      delta = b.clone().sub(a);
    const part = this.add(
      "cylinder",
      p.x,
      p.y,
      p.z,
      width,
      delta.length(),
      width,
      color,
    );
    part.q.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
  }
  private bicycle(x: number, z: number) {
    const c = this.rng.pick([0x8b5144, 0x486c67, 0xb6a371]);
    for (const d of [-0.6, 0.6])
      this.add(
        "ring",
        x,
        0.55,
        z + d,
        0.85,
        0.85,
        0.85,
        0x303e3b,
        -1,
        Math.PI / 2,
      );
    const a = new T.Vector3(x, 0.55, z - 0.6),
      b = new T.Vector3(x, 0.55, z + 0.6),
      crank = new T.Vector3(x, 0.55, z),
      seat = new T.Vector3(x, 1.08, z - 0.15),
      head = new T.Vector3(x, 1.12, z + 0.4);
    for (const [p, q] of [
      [a, seat],
      [seat, crank],
      [crank, a],
      [crank, head],
      [head, seat],
      [head, b],
    ])
      this.rod(p, q, 0.045, c);
    this.box(x, 1.15, z - 0.15, 0.24, 0.07, 0.3, 0x293b37);
    this.rod(head, new T.Vector3(x, 1.3, z + 0.45), 0.04, 0x78877c);
    this.box(x, 1.3, z + 0.45, 0.55, 0.035, 0.04, 0x78877c);
  }
  private cafe(x: number, z: number) {
    this.add("cylinder", x, 0.55, z, 0.08, 1.1, 0.08, 0x405550);
    this.add("cylinder", x, 1.1, z, 1.1, 0.08, 1.1, 0xb6a080);
    for (const dz of [-0.9, 0.9]) {
      this.box(x, 0.55, z + dz, 0.55, 0.08, 0.55, 0x7c9280);
      this.box(
        x,
        0.88,
        z + dz + (dz > 0 ? 0.24 : -0.24),
        0.55,
        0.6,
        0.06,
        0x7c9280,
      );
      for (const dx of [-0.2, 0.2])
        for (const zz of [-0.2, 0.2])
          this.box(x + dx, 0.27, z + dz + zz, 0.04, 0.55, 0.04, 0x3b514a);
    }
    this.add("cylinder", x, 1.21, z, 0.18, 0.2, 0.18, 0xddd6c0);
  }
  bench(x: number, z: number, ry = 0) {
    for (const y of [0.5, 0.68])
      this.box(x, y, z, 1.65, 0.12, 0.55, 0x967657, -1, ry);
    this.box(x, 1.04, z - 0.25, 1.65, 0.45, 0.1, 0x967657, -1, ry);
    for (const dx of [-0.6, 0.6])
      this.box(x + dx, 0.3, z, 0.09, 0.6, 0.4, 0x354845);
  }
  park(x: number, z: number) {
    this.box(x, 0.22, z, 20, 0.12, 20, 0x79866a);
    this.box(x, 0.3, z, 2, 0.05, 20, 0xc0b797);
    this.box(x, 0.31, z, 20, 0.05, 2, 0xc0b797);
    for (const dx of [-7, 7])
      for (const dz of [-7, 7]) this.tree(x + dx, z + dz);
    this.bench(x + 3, z + 3);
    this.bench(x - 3, z - 3);
    this.add("cylinder", x, 0.65, z, 4, 0.6, 4, 0xaaa998);
    this.add("cylinder", x, 0.98, z, 3.3, 0.08, 3.3, 0x5c8585);
    this.add("sphere", x, 1.6, z, 0.55, 1.4, 0.55, 0x9aab9e);
  }
  private batch() {
    const groups = new Map<string, Part[]>();
    for (const p of this.parts) {
      const key = p.shape + ":" + p.color;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    for (const list of groups.values()) {
      const m = new T.InstancedMesh(
        geometries[list[0].shape],
        this.material(list[0].color),
        list.length,
      );
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.parts = list;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      list.forEach((p, i) => {
        matrix.compose(p.p, p.q, p.s);
        m.setMatrixAt(i, matrix);
        p.mesh = m;
        p.index = i;
      });
      this.root.add(m);
      this.batches.push(m);
    }
  }
  remove(p: Part) {
    if (!p.alive) return;
    p.alive = false;
    p.mesh!.setMatrixAt(p.index!, zero);
    p.mesh!.instanceMatrix.needsUpdate = true;
  }
  private local(
    group: T.Group,
    shape: Shape,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: number,
  ) {
    const m = new T.Mesh(
      shape === "box" ? rounded : geometries[shape],
      this.material(c),
    );
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    group.add(m);
    return m;
  }
  private people() {
    const r = this.rng;
    for (let i = 0; i < 90; i++) {
      const group = new T.Group(),
        legs: T.Group[] = [],
        arms: T.Group[] = [];
      const skin = r.pick([0xc89973, 0x8e5d40, 0xe4ba97, 0xb77f5b]);
      const shirt = r.pick([
        0x6e8a87, 0xad7350, 0xddd2b6, 0x485c6b, 0x8d8b55, 0x9a6262,
      ]);
      this.local(group, "box", 0, 1.08, 0, 0.4, 0.56, 0.24, shirt);
      this.local(group, "sphere", 0, 1.56, 0, 0.29, 0.34, 0.3, skin);
      this.local(group, "sphere", 0, 1.67, -0.025, 0.3, 0.19, 0.3, 0x45392e);
      this.local(group, "sphere", 0, 1.55, 0.15, 0.07, 0.09, 0.08, skin);
      for (const side of [-1, 1])
        this.local(
          group,
          "sphere",
          side * 0.065,
          1.6,
          0.135,
          0.035,
          0.035,
          0.035,
          0x303b35,
        );
      if (i % 4 === 0) {
        this.local(group, "box", 0, 1.73, 0, 0.32, 0.08, 0.3, shirt);
        this.local(group, "box", 0, 1.7, 0.08, 0.35, 0.03, 0.42, shirt);
      }
      if (i % 3 === 0)
        this.local(group, "box", 0, 1.12, -0.19, 0.3, 0.4, 0.15, 0x896d4d);
      for (const side of [-1, 1]) {
        const leg = new T.Group();
        leg.position.set(side * 0.115, 0.83, 0);
        this.local(leg, "box", 0, -0.3, 0, 0.14, 0.6, 0.16, 0x384448);
        this.local(leg, "box", 0, -0.64, 0.04, 0.17, 0.12, 0.27, 0x303936);
        group.add(leg);
        legs.push(leg);
        const arm = new T.Group();
        arm.position.set(side * 0.25, 1.32, 0);
        this.local(arm, "box", 0, -0.23, 0, 0.12, 0.43, 0.14, shirt);
        this.local(arm, "sphere", 0, -0.5, 0, 0.12, 0.16, 0.12, skin);
        group.add(arm);
        arms.push(arm);
      }
      const axis = i % 2 ? "x" : "z",
        lane = r.pick(this.roads) + (r.next() < 0.5 ? -5.5 : 5.5),
        dir = r.next() < 0.5 ? -1 : 1;
      group.position.set(
        axis === "x" ? r.range(-70, 70) : lane,
        0.1,
        axis === "z" ? r.range(-70, 70) : lane,
      );
      group.rotation.y =
        axis === "x" ? (dir * Math.PI) / 2 : dir < 0 ? Math.PI : 0;
      const scale = r.range(0.98, 1.18);
      group.scale.setScalar(scale);
      this.root.add(group);
      this.citizens.push({
        group,
        legs,
        arms,
        axis,
        lane,
        dir,
        speed: r.range(0.65, 1.35),
        phase: r.range(0, 6),
        alive: true,
      });
    }
    this.population = this.citizens.length;
  }
  private traffic() {
    const r = this.rng;
    for (let i = 0; i < 26; i++) {
      const group = new T.Group(),
        color = r.pick([
          0x9b493b, 0xc4c3b5, 0x527879, 0xdbc293, 0x52616c, 0x697553,
        ]);
      group.userData.vehicle = true;
      this.local(group, "box", 0, 0.65, 0, 1.65, 0.55, 3.6, color);
      if (i % 5 === 0) {
        this.local(group, "box", 0, 1.2, -0.6, 1.5, 1.25, 2.3, color);
        this.local(group, "box", 0, 1.4, 0.6, 1.35, 0.65, 0.04, 0x29434a);
      }
      if (i % 5 === 1)
        this.local(group, "box", 0, 0.97, -1, 1.5, 0.23, 1.4, color);
      this.local(group, "box", 0, 1.08, -0.25, 1.45, 0.48, 1.85, color);
      this.local(group, "box", 0, 1.13, 0.71, 1.3, 0.36, 0.04, 0x29434a);
      this.local(group, "box", 0, 1.13, -1.2, 1.3, 0.36, 0.04, 0x29434a);
      for (const side of [-1, 1]) {
        this.local(
          group,
          "box",
          side * 0.735,
          1.12,
          -0.25,
          0.04,
          0.36,
          1.65,
          0x29434a,
        );
        for (const z of [-1.15, 1.15]) {
          const wheel = this.local(
            group,
            "cylinder",
            side * 0.83,
            0.285,
            z,
            0.61,
            0.18,
            0.61,
            0x252d2d,
          );
          wheel.rotation.z = Math.PI / 2;
          const hub = this.local(
            group,
            "cylinder",
            side * 0.94,
            0.285,
            z,
            0.31,
            0.02,
            0.31,
            0xb9b5a1,
          );
          hub.rotation.z = Math.PI / 2;
        }
        this.local(
          group,
          "box",
          side * 0.55,
          0.7,
          1.81,
          0.35,
          0.18,
          0.05,
          0xf5ddb3,
        );
        this.local(
          group,
          "box",
          side * 0.55,
          0.7,
          -1.81,
          0.35,
          0.18,
          0.05,
          0x9e3e2e,
        );
      }
      const axis = i % 2 ? "x" : "z",
        dir = i % 4 < 2 ? 1 : -1,
        lane = r.pick(this.roads) + dir * 2;
      group.position.set(
        axis === "x" ? r.range(-72, 72) : lane,
        0.05,
        axis === "z" ? r.range(-72, 72) : lane,
      );
      group.rotation.y =
        axis === "x" ? (dir * Math.PI) / 2 : dir < 0 ? Math.PI : 0;
      this.root.add(group);
      this.cars.push({
        group,
        axis,
        lane,
        dir,
        speed: r.range(3.2, 5.6),
        alive: true,
      });
    }
  }
  update(dt: number, time: number, impact: T.Vector3 | null) {
    for (const p of this.citizens) {
      if (!p.alive) continue;
      let speed = p.speed;
      if (impact && p.group.position.distanceTo(impact) < 18) speed *= 2.6;
      const coordinate = p.group.position[p.axis];
      const crossing = this.roads.find(
        (v) => Math.abs(coordinate - v) < 6.4 && Math.abs(coordinate - v) > 4.7,
      );
      if (
        crossing !== undefined &&
        Math.floor(time / 9) % 2 === (p.axis === "x" ? 0 : 1)
      )
        speed = 0;
      const wander = Math.sin(time * 0.3 + p.phase) * 0.18;
      p.group.position[p.axis === "x" ? "z" : "x"] = p.lane + wander;
      p.group.position[p.axis] += p.dir * speed * dt;
      if (Math.abs(p.group.position[p.axis]) > 73)
        p.group.position[p.axis] = -p.dir * 73;
      const wave = Math.sin(time * speed * 5 + p.phase) * 0.42;
      p.legs[0].rotation.x = wave;
      p.legs[1].rotation.x = -wave;
      p.arms[0].rotation.x = -wave;
      p.arms[1].rotation.x = wave;
      const distanceToCrossing = Math.min(
        ...this.roads.map((v) => Math.abs(p.group.position[p.axis] - v)),
      );
      p.group.position.y =
        0.1 +
        Math.abs(wave) * 0.045 -
        0.2 * T.MathUtils.clamp((4.8 - distanceToCrossing) / 0.4, 0, 1);
    }
    for (const car of this.cars) {
      if (!car.alive) continue;
      const v = car.group.position[car.axis],
        intersection = this.roads.find((a) => Math.abs(v - a) < 7);
      const stop =
        intersection !== undefined &&
        Math.floor(time / 9) % 2 === (car.axis === "x" ? 0 : 1) &&
        Math.abs(v - intersection) > 4;
      const ahead = this.cars.some(
        (other) =>
          other !== car &&
          other.alive &&
          other.axis === car.axis &&
          other.dir === car.dir &&
          Math.abs(other.lane - car.lane) < 0.5 &&
          (other.group.position[car.axis] - v) * car.dir > 0 &&
          (other.group.position[car.axis] - v) * car.dir < 5.3,
      );
      const danger = impact && car.group.position.distanceTo(impact) < 7;
      car.group.position[car.axis] +=
        stop || ahead || danger ? 0 : car.dir * car.speed * dt;
      if (Math.abs(car.group.position[car.axis]) > 75)
        car.group.position[car.axis] = -car.dir * 75;
    }
    this.updateActors();
  }
  private batchActors() {
    const groups = new Map<string, { object: T.Mesh; owner: T.Group }[]>();
    for (const actor of [...this.citizens, ...this.cars]) {
      this.root.remove(actor.group);
      actor.group.updateMatrixWorld(true);
      actor.group.traverse((o) => {
        if (o instanceof T.Mesh) {
          const key = o.geometry.uuid + ":" + (o.material as T.Material).uuid;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push({ object: o, owner: actor.group });
        }
      });
    }
    for (const entries of groups.values()) {
      const first = entries[0].object;
      const mesh = new T.InstancedMesh(
        first.geometry,
        first.material,
        entries.length,
      );
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.actorBatches.push({ mesh, entries });
    }
    this.updateActors();
  }
  private updateActors() {
    for (const o of this.root.children)
      if (o.userData.anchor) o.visible = o.userData.anchor.alive;
    for (const actor of [...this.citizens, ...this.cars])
      actor.group.updateMatrixWorld(true);
    for (const batch of this.actorBatches) {
      batch.entries.forEach(({ object, owner }, i) =>
        batch.mesh.setMatrixAt(i, owner.visible ? object.matrixWorld : zero),
      );
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  blocked(x: number, z: number) {
    return (
      this.buildings.some(
        (b) =>
          !b.collapsed &&
          Math.abs(x - b.x) < b.w / 2 + 0.35 &&
          Math.abs(z - b.z) < b.d / 2 + 0.35,
      ) ||
      this.cars.some(
        (c) =>
          c.alive &&
          Math.abs(x - c.group.position.x) < (c.axis === "x" ? 2.05 : 1.05) &&
          Math.abs(z - c.group.position.z) < (c.axis === "z" ? 2.05 : 1.05),
      )
    );
  }
  dispose() {
    this.root.traverse((o) => {
      if (o instanceof T.Mesh) {
        if (!Object.values(geometries).includes(o.geometry as T.BoxGeometry))
          o.geometry.dispose();
        if (o.material instanceof T.MeshStandardMaterial && o.material.map) {
          o.material.map.dispose();
          o.material.dispose();
        }
      }
    });
    for (const b of this.batches) b.dispose();
    for (const b of this.actorBatches) b.mesh.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}
