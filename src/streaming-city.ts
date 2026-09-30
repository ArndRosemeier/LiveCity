import * as T from "three";
import {
  createPlan,
  massing,
  STRIDE,
  type MasterPlan,
  type CityOptions,
  type DistrictPlan,
  type DistrictData,
  type BuildingPlan,
} from "./plan";
import { generateDistrict } from "./generation";
import { Random } from "./random";
import { finish } from "./surfaces";
import type { Part, Building, Shape } from "./world";
import {
  ActorRenderer,
  createPerson,
  animatePerson,
  createVehicle,
  type Person,
  type Vehicle,
} from "./inhabitants";
import type { CityPhysics } from "./physics";

const geo = {
  box: new T.BoxGeometry(1, 1, 1),
  sphere: new T.IcosahedronGeometry(0.5, 2),
  cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 12),
  roof: new T.ConeGeometry(0.707, 1, 4).rotateY(Math.PI / 4),
};
const zero = new T.Matrix4().makeScale(0, 0, 0),
  dummy = new T.Object3D();
export interface Snapshot {
  dead: number[];
  buildings: { collapsed: boolean; from: number }[];
  people: boolean[];
  cars: boolean[];
}
export class District {
  root = new T.Group();
  parts: Part[] = [];
  buildings: Building[] = [];
  batches: T.InstancedMesh[] = [];
  citizens: Person[] = [];
  cars: Vehicle[] = [];
  cursor = 0;
  ready = false;
  bound = false;
  constructor(
    public plan: DistrictPlan,
    private data: DistrictData,
    private material: (c: number) => T.MeshStandardMaterial,
    private config: CityOptions,
    private snapshot?: Snapshot,
  ) {
    this.buildings = plan.buildings.map((p) => ({
      x: p.x,
      z: p.z,
      w: p.w,
      d: p.d,
      h: p.floors * 3.1,
      parts: [],
      floors: Array.from({ length: p.floors }, () => ({
        slab: null as unknown as Part,
        columns: [],
      })),
      collapsed: false,
      collapseFrom: Infinity,
    }));
    if (snapshot)
      this.buildings.forEach((b, i) => {
        b.collapsed = snapshot.buildings[i].collapsed;
        b.collapseFrom = snapshot.buildings[i].from;
      });
  }
  pump() {
    const a = this.data.parts,
      end = Math.min(this.data.count, this.cursor + 1300);
    for (; this.cursor < end; this.cursor++) {
      const i = this.cursor * STRIDE,
        b = a[i + 8];
      const p: Part = {
        p: new T.Vector3(a[i], a[i + 1], a[i + 2]),
        s: new T.Vector3(a[i + 3], a[i + 4], a[i + 5]),
        color: a[i + 6],
        shape: (["box", "sphere", "cylinder", "roof"] as Shape[])[a[i + 7]],
        q: new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 1, 0),
          a[i + 11],
        ),
        building: b,
        alive: true,
        owner: b >= 0 ? this.buildings[b] : undefined,
      };
      this.parts.push(p);
      if (b >= 0) {
        this.buildings[b].parts.push(p);
        const role = a[i + 9],
          floor = a[i + 10];
        if (role === 1) this.buildings[b].floors[floor].slab = p;
        if (role === 2) this.buildings[b].floors[floor].columns.push(p);
      }
    }
    if (this.cursor < this.data.count) return false;
    if (this.snapshot)
      for (const i of this.snapshot.dead)
        if (this.parts[i]) this.parts[i].alive = false;
    const groups = new Map<string, Part[]>();
    for (const p of this.parts) {
      const key = p.shape + ":" + p.color;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    for (const parts of groups.values()) {
      const shape = parts[0].shape as keyof typeof geo;
      const m = new T.InstancedMesh(
        geo[shape],
        this.material(parts[0].color),
        parts.length,
      );
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.userData.parts = parts;
      parts.forEach((p, i) => {
        p.mesh = m;
        p.index = i;
        dummy.position.copy(p.p);
        dummy.quaternion.copy(p.q);
        dummy.scale.copy(p.s);
        dummy.updateMatrix();
        m.setMatrixAt(i, p.alive ? dummy.matrix : zero);
      });
      this.root.add(m);
      this.batches.push(m);
    }
    for (const p of this.plan.buildings) {
      const label = [
        "CORNER COFFEE",
        "PROVISIONS",
        "BOOKS & PAPER",
        "ATELIER",
        "THE DELI",
        "BOTANICA",
      ][p.id % 6];
      const cv = document.createElement("canvas");
      cv.width = 512;
      cv.height = 64;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#eee4c7";
      ctx.font = "500 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, 256, 43);
      const map = new T.CanvasTexture(cv),
        m = new T.Mesh(
          new T.PlaneGeometry(p.w - 0.9, 0.38),
          new T.MeshStandardMaterial({
            map,
            transparent: true,
            side: T.DoubleSide,
          }),
        );
      m.position.set(p.x, 3.05, p.z + p.front * (p.d / 2 + 0.405));
      if (p.front < 0) m.rotation.y = Math.PI;
      m.userData.building = this.buildings[this.plan.buildings.indexOf(p)];
      this.root.add(m);
    }
    for (let i = 0; i < this.config.crowds; i++) {
      const person = createPerson(
        `${this.plan.id}/person/${i}/${this.plan.buildings[0]?.seed || this.plan.x0}`,
      );
      if (this.snapshot?.people[i] === false) {
        person.alive = false;
        person.group.visible = false;
      }
      this.citizens.push(person);
    }
    for (let i = 0; i < this.config.traffic; i++) {
      const car = createVehicle(
        `${this.plan.id}/car/${i}/${this.plan.buildings[0]?.seed || this.plan.z0}`,
      );
      if (this.snapshot?.cars[i] === false) {
        car.alive = false;
        car.group.visible = false;
      }
      this.cars.push(car);
    }
    this.data.parts = new Float32Array();
    this.ready = true;
    return true;
  }
  capture(): Snapshot {
    return {
      dead: this.parts.flatMap((p, i) => (p.alive ? [] : [i])),
      buildings: this.buildings.map((b) => ({
        collapsed: b.collapsed,
        from: b.collapseFrom,
      })),
      people: this.citizens.map((p) => p.alive),
      cars: this.cars.map((c) => c.alive),
    };
  }
  dispose() {
    for (const b of this.batches) b.dispose();
    this.root.traverse((o) => {
      if (o instanceof T.Mesh && !(o instanceof T.InstancedMesh)) {
        o.geometry.dispose();
        const m = o.material as T.MeshStandardMaterial;
        m.map?.dispose();
        m.dispose();
      }
    });
    this.root.clear();
  }
}
interface Proxy {
  mesh: T.InstancedMesh;
  index: number;
  plan: BuildingPlan;
  y: number;
  w: number;
  h: number;
  d: number;
}
function proxyMaterial(glass: boolean) {
  const m = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: glass ? 0.35 : 0.86,
    metalness: glass ? 0.35 : 0.03,
  });
  const night = { value: 0 };
  m.userData.night = night;
  m.onBeforeCompile = (s) => {
    s.uniforms.proxyNight = night;
    s.vertexShader = s.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 facadePosition; varying vec3 facadeNormal;",
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
float windowHash=fract(sin(dot(floor(vec2(along/3.1,facadePosition.y/3.1)),vec2(12.9898,78.233)))*43758.5453);
totalEmissiveRadiance+=vec3(.5,.30,.09)*window*step(.76,windowHash)*proxyNight;`,
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
vec4 fp=vec4(transformed,1.0);vec3 fn=normal;
#ifdef USE_INSTANCING
fp=instanceMatrix*fp;fn=mat3(instanceMatrix)*fn;
#endif
facadePosition=(modelMatrix*fp).xyz;facadeNormal=normalize(mat3(modelMatrix)*fn);`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 facadePosition; varying vec3 facadeNormal; uniform float proxyNight;",
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
float along=abs(facadeNormal.z)>.6?facadePosition.x:facadePosition.z;float fx=fract(along/${glass ? "2.6" : "3.1"});float fy=fract((facadePosition.y-.3)/3.1);float window=step(.24,fx)*step(fx,.76)*step(.25,fy)*step(fy,.80)*step(abs(facadeNormal.y),.2);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.26+vec3(.025,.065,.08),window);float band=step(.96,fy)*step(abs(facadeNormal.y),.2);diffuseColor.rgb*=1.-band*.25;`,
    );
  };
  m.customProgramCacheKey = () => (glass ? "glass-proxy" : "masonry-proxy");
  return m;
}
export class StreamingCity {
  root = new T.Group();
  plan: MasterPlan;
  parts: Part[] = [];
  buildings: Building[] = [];
  batches: T.InstancedMesh[] = [];
  citizens: Person[] = [];
  cars: Vehicle[] = [];
  population = 0;
  proxies: T.InstancedMesh[] = [];
  private loaded = new Map<number, District>();
  private snapshots = new Map<number, Snapshot>();
  private assembling: District[] = [];
  private inFlight = new Set<number>();
  private materials = new Map<number, T.MeshStandardMaterial>();
  private proxySlots = new Map<number, Proxy[]>();
  private actors = new ActorRenderer();
  private worker: Worker | null = null;
  private disposed = false;
  private elapsed = 0;
  private lastScan = -1;
  private desired: number[] = [];
  private physics: CityPhysics;
  private bound = new Set<number>();
  private focus = new T.Vector3();
  private frustum = new T.Frustum();
  private projection = new T.Matrix4();
  private sphere = new T.Sphere();
  night = 0;
  error = "";
  private promoted: { id: number; until: number } | null = null;
  constructor(
    public seed: string,
    input: Partial<CityOptions>,
    physics: CityPhysics,
  ) {
    this.plan = createPlan(seed, input);
    this.physics = physics;
    this.buildProxies();
    this.root.add(this.actors.root);
    try {
      this.worker = new Worker(
        new URL("./generation.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (e) => {
        if (this.disposed) return;
        if (e.data.error) {
          this.error = e.data.error;
          this.inFlight.delete(e.data.district);
          return;
        }
        const result = e.data.result as DistrictData;
        this.inFlight.delete(result.district);
        if (!this.desired.includes(result.district)) return;
        this.assembling.push(
          new District(
            this.plan.districts[result.district],
            result,
            (c) => this.material(c),
            this.plan.options,
            this.snapshots.get(result.district),
          ),
        );
      };
      this.worker.onerror = () => {
        this.error =
          "Background generation unavailable; using incremental local generation.";
        this.worker?.terminate();
        this.worker = null;
        this.inFlight.clear();
      };
    } catch {
      this.worker = null;
    }
  }
  get totalBuildings() {
    return this.plan.buildings.length;
  }
  get roads() {
    return this.plan.roads;
  }
  get extent() {
    return this.plan.extent;
  }
  get options() {
    return this.plan.options;
  }
  get activeDistricts() {
    return this.loaded.size;
  }
  get pending() {
    return this.inFlight.size + this.assembling.length;
  }
  private material(c: number) {
    let m = this.materials.get(c);
    if (!m) {
      m = new T.MeshStandardMaterial({ color: c, roughness: 0.85 });
      if (c === 0x41494a) finish(m, "asphalt");
      else if (c === 0x9a9e90) finish(m, "stone");
      else if (c === 0x967657) finish(m, "wood");
      else if (
        this.plan.buildings.some(
          (p) =>
            p.color === c &&
            ["brownstone", "tenement", "warehouse"].includes(p.style),
        )
      )
        finish(m, "brick");
      else if (
        c !== 0x344c53 &&
        c !== 0x355763 &&
        c !== 0xc9af77 &&
        c !== 0xf4d39b
      )
        finish(m, "plaster");
      if (c === 0x344c53 || c === 0x355763) {
        m.metalness = 0.4;
        m.roughness = 0.24;
      }
      if (c === 0xc9af77 || c === 0xf4d39b) {
        m.emissive.setHex(c);
        m.emissiveIntensity = 0.12 + this.night * 1.8;
      }
      this.materials.set(c, m);
    }
    return m;
  }
  setNight(n: number) {
    this.night = n;
    for (const p of this.proxies)
      (p.material as T.Material).userData.night.value = n;
    for (const [c, m] of this.materials)
      if (c === 0xc9af77 || c === 0xf4d39b)
        m.emissiveIntensity = 0.12 + n * 1.8;
  }
  private buildProxies() {
    const lists: {
      p: BuildingPlan;
      y: number;
      w: number;
      h: number;
      d: number;
    }[][] = [[], []];
    for (const p of this.plan.buildings) {
      const glass = ["glass", "setback"].includes(p.style),
        count = ["artdeco", "setback"].includes(p.style)
          ? 4
          : p.style === "glass"
            ? 2
            : 1;
      for (let i = 0; i < count; i++) {
        const f0 = Math.floor((i * p.floors) / count),
          f1 = Math.floor(((i + 1) * p.floors) / count),
          { w, d } = massing(p, f0);
        lists[glass ? 1 : 0].push({
          p,
          y: 0.3 + f0 * 3.1,
          w,
          h: (f1 - f0) * 3.1,
          d,
        });
      }
    }
    lists.forEach((list, j) => {
      const mesh = new T.InstancedMesh(
        geo.box,
        proxyMaterial(j === 1),
        list.length,
      );
      mesh.userData.proxy = list.map((v) => v.p);
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      list.forEach((v, i) => {
        dummy.position.set(v.p.x, v.y + v.h / 2, v.p.z);
        dummy.quaternion.identity();
        dummy.scale.set(v.w, v.h, v.d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, new T.Color(v.p.color));
        if (!this.proxySlots.has(v.p.district))
          this.proxySlots.set(v.p.district, []);
        this.proxySlots
          .get(v.p.district)!
          .push({ mesh, index: i, plan: v.p, y: v.y, w: v.w, h: v.h, d: v.d });
      });
      mesh.computeBoundingSphere();
      this.root.add(mesh);
      this.proxies.push(mesh);
    });
    const tile = new T.InstancedMesh(
      geo.box,
      this.material(0x9a9e90),
      this.plan.districts.length,
    );
    this.plan.districts.forEach((d, i) => {
      dummy.position.set((d.x0 + d.x1) / 2, -0.08, (d.z0 + d.z1) / 2);
      dummy.scale.set(d.x1 - d.x0 - 14, 0.3, d.z1 - d.z0 - 14);
      dummy.updateMatrix();
      tile.setMatrixAt(i, dummy.matrix);
      tile.setColorAt(i, new T.Color(d.park ? 0x798f69 : 0x9a9e90));
    });
    tile.receiveShadow = true;
    this.root.add(tile);
    const n = this.plan.roads.length,
      roads = new T.InstancedMesh(geo.box, this.material(0x41494a), n * 2);
    this.plan.roads.forEach((v, i) => {
      dummy.position.set(v, -0.2, (this.plan.min + this.plan.max) / 2);
      dummy.scale.set(14, 0.2, this.plan.extent + 18);
      dummy.updateMatrix();
      roads.setMatrixAt(i, dummy.matrix);
      dummy.position.set((this.plan.min + this.plan.max) / 2, -0.2, v);
      dummy.scale.set(this.plan.extent + 18, 0.2, 14);
      dummy.updateMatrix();
      roads.setMatrixAt(n + i, dummy.matrix);
    });
    roads.receiveShadow = true;
    this.root.add(roads);
  }
  private proxy(id: number, visible: boolean) {
    const snapshot = this.snapshots.get(id),
      district = this.plan.districts[id];
    for (const p of this.proxySlots.get(id) || []) {
      let top = Infinity;
      if (snapshot) {
        const index = district.buildings.findIndex((b) => b.id === p.plan.id);
        top = snapshot.buildings[index]?.from ?? Infinity;
      }
      if (!visible || p.y >= top) p.mesh.setMatrixAt(p.index, zero);
      else {
        const h = Math.min(p.h, top - p.y);
        dummy.position.set(p.plan.x, p.y + h / 2, p.plan.z);
        dummy.quaternion.identity();
        dummy.scale.set(p.w, h, p.d);
        dummy.updateMatrix();
        p.mesh.setMatrixAt(p.index, dummy.matrix);
      }
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  requestDistrict(id: number, manual = false) {
    if (manual) {
      this.promoted = { id, until: this.elapsed + 12 };
      this.desired = [id, ...this.desired.filter((v) => v !== id)].slice(
        0,
        this.options.budget,
      );
    }
    if (
      this.loaded.has(id) ||
      this.inFlight.has(id) ||
      this.assembling.some((d) => d.plan.id === id)
    )
      return;
    this.inFlight.add(id);
    const district = this.plan.districts[id];
    if (this.worker)
      this.worker.postMessage({
        generation: 0,
        district,
        detail: this.options.detail,
      });
    else {
      const result = generateDistrict(district, this.options.detail);
      this.inFlight.delete(id);
      this.assembling.push(
        new District(
          district,
          result,
          (c) => this.material(c),
          this.options,
          this.snapshots.get(id),
        ),
      );
    }
  }
  private refresh() {
    this.parts = [];
    this.buildings = [];
    this.batches = [];
    this.citizens = [];
    this.cars = [];
    for (const d of this.loaded.values()) {
      this.parts.push(...d.parts);
      this.buildings.push(...d.buildings);
      this.batches.push(...d.batches);
      this.citizens.push(...d.citizens);
      this.cars.push(...d.cars);
    }
    this.population = this.citizens.filter((p) => p.alive).length;
    this.actors.rebuild([...this.citizens, ...this.cars]);
  }
  update(
    dt: number,
    time: number,
    impact: T.Vector3 | null,
    camera: T.Camera,
    focus: T.Vector3,
  ) {
    this.elapsed += dt;
    this.focus.copy(focus);
    this.projection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projection);
    if (this.elapsed - this.lastScan > 0.35) {
      this.lastScan = this.elapsed;
      const candidates = this.plan.districts
        .map((d) => {
          const x = (d.x0 + d.x1) / 2,
            z = (d.z0 + d.z1) / 2,
            dist = Math.hypot(x - focus.x, z - focus.z);
          this.sphere.set(
            new T.Vector3(x, 80, z),
            Math.hypot(d.x1 - d.x0, d.z1 - d.z0) / 2 + 85,
          );
          const visible = this.frustum.intersectsSphere(this.sphere);
          return {
            id: d.id,
            dist,
            score: dist + (visible ? 0 : this.options.radius * 0.75),
          };
        })
        .filter((d) => d.dist < this.options.radius + this.options.blockSize)
        .sort((a, b) => a.score - b.score);
      this.desired = candidates.slice(0, this.options.budget).map((d) => d.id);
      if (this.promoted && this.promoted.until > this.elapsed)
        this.desired = [
          this.promoted.id,
          ...this.desired.filter((id) => id !== this.promoted!.id),
        ].slice(0, this.options.budget);
      let changed = false;
      for (const [id, d] of this.loaded) {
        if (
          this.desired.includes(id) ||
          d.buildings.some(
            (b) =>
              Number.isFinite(b.collapseFrom) &&
              b.parts.some((p) => p.alive && p.p.y >= b.collapseFrom - 0.01),
          )
        )
          continue;
        this.snapshots.set(id, d.capture());
        if (d.bound) this.physics.unbind(d);
        this.bound.delete(id);
        this.root.remove(d.root);
        d.dispose();
        this.loaded.delete(id);
        this.proxy(id, true);
        changed = true;
      }
      if (changed) this.refresh();
      for (const id of this.desired) {
        if (this.inFlight.size >= 2) break;
        this.requestDistrict(id);
      }
      const close = [...this.loaded.values()]
        .sort(
          (a, b) =>
            Math.hypot(
              (a.plan.x0 + a.plan.x1) / 2 - focus.x,
              (a.plan.z0 + a.plan.z1) / 2 - focus.z,
            ) -
            Math.hypot(
              (b.plan.x0 + b.plan.x1) / 2 - focus.x,
              (b.plan.z0 + b.plan.z1) / 2 - focus.z,
            ),
        )
        .slice(0, 4);
      for (const d of this.loaded.values()) {
        const should = close.includes(d);
        if (should && !d.bound) {
          this.physics.bind(d);
          d.bound = true;
          this.bound.add(d.plan.id);
        } else if (!should && d.bound) {
          this.physics.unbind(d);
          d.bound = false;
          this.bound.delete(d.plan.id);
        }
      }
    }
    if (this.assembling.length) {
      const d = this.assembling[0];
      if (d.pump()) {
        this.assembling.shift();
        if (this.desired.includes(d.plan.id)) {
          this.loaded.set(d.plan.id, d);
          this.root.add(d.root);
          this.proxy(d.plan.id, false);
          this.refresh();
        } else d.dispose();
      }
    }
    for (const d of this.loaded.values()) {
      for (const p of d.citizens) animatePerson(p, dt, time, d.plan, impact);
      for (const c of d.cars) {
        if (!c.alive) continue;
        const length =
          c.axis === "x" ? d.plan.x1 - d.plan.x0 : d.plan.z1 - d.plan.z0;
        const coord = c.progress * length,
          edge = c.dir > 0 ? -3 : 3;
        const red = Math.floor(time / 9) % 2 === (c.axis === "x" ? 0 : 1);
        const ahead = d.cars.some(
          (other) =>
            other !== c &&
            other.alive &&
            other.axis === c.axis &&
            other.dir === c.dir &&
            T.MathUtils.euclideanModulo(other.progress - c.progress, 1) *
              length <
              6.5,
        );
        const danger = impact && c.group.position.distanceTo(impact) < 18;
        const stop =
          ahead || danger || (red && (coord < 6 || coord > length - 6));
        if (!stop) c.progress = (c.progress + (dt * c.speed) / length) % 1;
        const v = c.dir > 0 ? c.progress : 1 - c.progress;
        c.group.position.set(
          c.axis === "x"
            ? T.MathUtils.lerp(d.plan.x0, d.plan.x1, v)
            : d.plan.x0 + edge,
          0.03,
          c.axis === "z"
            ? T.MathUtils.lerp(d.plan.z0, d.plan.z1, v)
            : d.plan.z0 + edge,
        );
        c.group.rotation.y =
          c.axis === "x" ? (c.dir * Math.PI) / 2 : c.dir < 0 ? Math.PI : 0;
      }
      d.root.traverse((o) => {
        const b = o.userData.building as Building | undefined;
        if (b) o.visible = o.position.y < b.collapseFrom;
      });
    }
    this.actors.update([...this.citizens, ...this.cars], camera.position);
    this.population = this.citizens.filter((p) => p.alive).length;
  }
  ensurePhysicsAt(point: T.Vector3) {
    for (const d of this.loaded.values())
      if (
        point.x > d.plan.x0 - 15 &&
        point.x < d.plan.x1 + 15 &&
        point.z > d.plan.z0 - 15 &&
        point.z < d.plan.z1 + 15 &&
        !d.bound
      ) {
        this.physics.bind(d);
        d.bound = true;
        this.bound.add(d.plan.id);
      }
  }
  remove(p: Part) {
    if (!p.alive) return;
    p.alive = false;
    p.mesh?.setMatrixAt(p.index!, zero);
    if (p.mesh) p.mesh.instanceMatrix.needsUpdate = true;
  }
  blocked(x: number, z: number) {
    if (this.loaded.size) {
      for (const b of this.buildings)
        if (
          !b.collapsed &&
          Math.abs(x - b.x) < b.w / 2 + 0.32 &&
          Math.abs(z - b.z) < b.d / 2 + 0.32
        )
          return true;
    }
    const ix = this.cell(x),
      iz = this.cell(z),
      id = ix * this.options.blocks + iz;
    const district = this.plan.districts[id];
    if (!this.loaded.has(id) && district)
      for (const b of district.buildings) {
        const snapshot = this.snapshots.get(id),
          index = district.buildings.indexOf(b);
        if (
          !snapshot?.buildings[index].collapsed &&
          Math.abs(x - b.x) < b.w / 2 + 0.32 &&
          Math.abs(z - b.z) < b.d / 2 + 0.32
        )
          return true;
      }
    return this.cars.some(
      (c) =>
        c.alive &&
        Math.abs(x - c.group.position.x) < (c.axis === "x" ? 2.3 : 1.1) &&
        Math.abs(z - c.group.position.z) < (c.axis === "z" ? 2.3 : 1.1),
    );
  }
  private cell(v: number) {
    let lo = 0,
      hi = this.plan.roads.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (v < this.plan.roads[mid]) hi = mid;
      else lo = mid;
    }
    return Math.max(0, Math.min(this.options.blocks - 1, lo));
  }
  dispose() {
    this.disposed = true;
    this.worker?.terminate();
    for (const d of this.loaded.values()) {
      if (d.bound) this.physics.unbind(d);
      d.dispose();
    }
    for (const d of this.assembling) d.dispose();
    this.actors.clear();
    for (const p of this.proxies) {
      (p.material as T.Material).dispose();
      p.dispose();
    }
    this.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    for (const m of this.materials.values()) m.dispose();
    this.root.clear();
  }
}
