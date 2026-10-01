import * as T from "three";
import { CityLife, type LifeSample } from "./life";
import {
  advanceCrowd,
  crossingWait,
  stopLine,
  signalPhase,
  type CrowdBody,
} from "./traffic";
import { SIGNAL_COLORS, WALK_COLORS } from "./street";
import { Transit } from "./transit";
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
  posePerson,
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
  lamps: {
    part: Part;
    axis: "x" | "z" | "walk";
    aspect: number;
    active?: boolean;
  }[] = [];
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
      planId: p.id,
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
        q: new T.Quaternion().setFromEuler(
          new T.Euler(a[i + 12], a[i + 11], 0, "YXZ"),
        ),
        building: b,
        alive: true,
        owner: b >= 0 ? this.buildings[b] : undefined,
        support: a[i + 13] >= 0 ? this.parts[a[i + 13]] : undefined,
      };
      this.parts.push(p);
      if (a[i + 9] >= 10 && a[i + 9] <= 12)
        this.lamps.push({
          part: p,
          axis: a[i + 9] === 10 ? "x" : a[i + 9] === 11 ? "z" : "walk",
          aspect: a[i + 10],
        });
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
  updateSignals(time: number) {
    const phase = signalPhase(time, this.plan.ix, this.plan.iz);
    for (const lamp of this.lamps) {
      const active =
        lamp.axis === "walk"
          ? Number(phase.walk) === lamp.aspect
          : ["red", "amber", "green"][lamp.aspect] === phase[lamp.axis];
      if (active === lamp.active || !lamp.part.mesh) continue;
      lamp.active = active;
      lamp.part.mesh.setColorAt(
        lamp.part.index!,
        new T.Color().setScalar(active ? 1 : 0.055),
      );
      lamp.part.mesh.instanceColor!.needsUpdate = true;
    }
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
  life: CityLife;
  transit: Transit;
  interiorView: {
    building: number;
    floor: number;
    rooms: {
      x: number;
      z: number;
      w: number;
      d: number;
      free?: { x: number; z: number }[];
    }[];
  } | null = null;
  playerThreat: {
    position: T.Vector3;
    radius: number;
    height: number;
    speed: number;
    flying: boolean;
  } | null = null;
  private liveActors = new Map<
    number,
    {
      person?: Person;
      car?: Vehicle;
      offset: T.Vector3;
      delay: number;
      panic: number;
      speed: number;
      velocity: T.Vector3;
    }
  >();
  private lifeScan = -1;
  private extras: Part[] = [];
  private extraBatches: T.InstancedMesh[] = [];
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
  get humanDetail() {
    return this.actors.humanDetail;
  }
  private obstacles = new Map<string, Part[]>();
  private rails = new Map<string, Part[]>();
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
    this.life = new CityLife(this.plan);
    this.transit = new Transit(this.plan);
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
            { ...this.plan.options, crowds: 0, traffic: 0 },
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
  setPeopleBudget(count: number) {
    this.actors.closeBudget = Math.max(4, Math.min(32, Math.round(count)));
  }
  seekHour(hour: number) {
    this.life.setHour(hour);
    this.liveActors.clear();
    this.citizens = [];
    this.cars = this.transit.cars;
    this.actors.rebuild(this.cars);
    this.lifeScan = this.elapsed - 2;
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
      if ([...SIGNAL_COLORS, ...WALK_COLORS].includes(c)) {
        m.emissive.setHex(c);
        m.emissiveIntensity = 2;
        m.onBeforeCompile = (s) => {
          s.fragmentShader = s.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif",
          );
        };
        m.customProgramCacheKey = () => "traffic-aspect";
        this.materials.set(c, m);
        return m;
      }
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
          { ...this.options, crowds: 0, traffic: 0 },
          this.snapshots.get(id),
        ),
      );
    }
  }
  private refresh() {
    this.parts = [];
    this.buildings = [];
    this.batches = [];
    for (const d of this.loaded.values()) {
      this.parts.push(...d.parts);
      this.buildings.push(...d.buildings);
      this.batches.push(...d.batches);
    }
    this.parts.push(...this.extras);
    this.batches.push(...this.extraBatches);
    this.obstacles.clear();
    this.rails.clear();
    for (const p of this.parts)
      if (p.color === 0x73858b || p.color === 0x303b40) {
        const k = Math.floor(p.p.x / 4) + "," + Math.floor(p.p.z / 4);
        if (!this.rails.has(k)) this.rails.set(k, []);
        this.rails.get(k)!.push(p);
      }
    for (const p of this.parts)
      if (!p.owner && p.s.y > 0.32 && Math.max(p.s.x, p.s.z) < 8) {
        for (
          let x = Math.floor((p.p.x - p.s.x / 2) / 4);
          x <= Math.floor((p.p.x + p.s.x / 2) / 4);
          x++
        )
          for (
            let z = Math.floor((p.p.z - p.s.z / 2) / 4);
            z <= Math.floor((p.p.z + p.s.z / 2) / 4);
            z++
          ) {
            const k = x + "," + z;
            if (!this.obstacles.has(k)) this.obstacles.set(k, []);
            this.obstacles.get(k)!.push(p);
          }
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
    const transitChanged = this.transit.update(dt, time, focus, (car, next) => {
      if (
        this.cars.some(
          (c) =>
            c !== car &&
            c.alive &&
            c.group.visible &&
            Math.abs(next.x - c.group.position.x) <
              (car.axis === "x" ? car.length! / 2 : car.width! / 2) +
                (c.axis === "x" ? (c.length || 4.4) / 2 : (c.width || 2) / 2) &&
            Math.abs(next.z - c.group.position.z) <
              (car.axis === "z" ? car.length! / 2 : car.width! / 2) +
                (c.axis === "z" ? (c.length || 4.4) / 2 : (c.width || 2) / 2),
        )
      )
        return true;
      if (
        this.citizens.some(
          (p) =>
            p.alive &&
            p.group.visible &&
            p.group.position.y < 2 &&
            Math.abs(next.x - p.group.position.x) <
              (car.axis === "x" ? car.length! / 2 : car.width! / 2) + 0.3 &&
            Math.abs(next.z - p.group.position.z) <
              (car.axis === "z" ? car.length! / 2 : car.width! / 2) + 0.3,
        )
      )
        return true;
      const player = this.playerThreat;
      if (
        player &&
        player.position.y < 3.2 &&
        Math.abs(next.x - player.position.x) <
          (car.axis === "x" ? car.length! / 2 : car.width! / 2) +
            player.radius &&
        Math.abs(next.z - player.position.z) <
          (car.axis === "z" ? car.length! / 2 : car.width! / 2) + player.radius
      )
        return true;
      if (this.physics.floorHeight(next.x, next.z) > 0.36) return true;
      const cx = Math.floor(next.x / 4),
        cz = Math.floor(next.z / 4);
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++)
          for (const p of this.rails.get(cx + x + "," + (cz + z)) || [])
            if (
              !p.alive &&
              Math.abs(next.x - p.p.x) < 2 &&
              Math.abs(next.z - p.p.z) < 2
            )
              return true;
      return false;
    });
    this.updateLives(dt, time, impact, transitChanged);
    for (const d of this.loaded.values()) d.updateSignals(time);
    for (const d of this.loaded.values())
      d.root.traverse((o) => {
        const b = o.userData.building as Building | undefined;
        if (b) o.visible = o.position.y < b.collapseFrom;
      });
    this.actors.update([...this.citizens, ...this.cars], camera.position);
    this.population = this.citizens.filter((p) => p.alive).length;
  }
  private updateLives(
    dt: number,
    time: number,
    impact: T.Vector3 | null,
    transitChanged = false,
  ) {
    this.life.tick(dt);
    for (const [id, a] of this.liveActors)
      if (!(a.person || a.car)!.alive) this.life.dead.add(id);
    for (const b of this.buildings)
      if (Number.isFinite(b.collapseFrom)) {
        if (b.planId !== undefined) this.life.displaced.add(b.planId);
      }
    if (this.elapsed - this.lifeScan > 1 || transitChanged) {
      this.lifeScan = this.elapsed;
      const indoors = new Set(
        this.interiorView
          ? this.life.indoors(
              this.interiorView.building,
              this.interiorView.floor,
            )
          : [],
      );
      const wanted = new Set(
        this.life
          .nearby([...this.loaded.keys()])
          .slice(0, this.options.crowds * this.options.budget),
      );
      for (const id of indoors) wanted.add(id);
      let changed = transitChanged;
      for (const [id, a] of this.liveActors)
        if (
          (!wanted.has(id) && a.panic < this.life.seconds) ||
          (a.car && (indoors.has(id) || !this.life.sample(id).vehicle)) ||
          (a.person && !indoors.has(id) && this.life.sample(id).vehicle)
        ) {
          this.liveActors.delete(id);
          changed = true;
        }
      for (const id of wanted)
        if (!this.liveActors.has(id)) {
          const v = this.life.sample(id);
          const useCar = v.vehicle && !indoors.has(id);
          const actor = useCar
            ? createVehicle(this.seed + "/vehicle/" + id)
            : createPerson(this.seed + "/resident/" + id);
          actor.group.userData.resident = id;
          actor.group.position.set(v.x, 0.285, v.z);
          this.liveActors.set(id, {
            person: useCar ? undefined : (actor as Person),
            car: useCar ? (actor as Vehicle) : undefined,
            offset: new T.Vector3(),
            delay: this.life.delays.get(id) || 0,
            panic: 0,
            speed: 0,
            velocity: new T.Vector3(),
          });
          changed = true;
        }
      if (changed) {
        this.citizens = [...this.liveActors.values()].flatMap((a) =>
          a.person ? [a.person] : [],
        );
        this.cars = [...this.liveActors.values()]
          .flatMap((a) => (a.car ? [a.car] : []))
          .concat(this.transit.cars);
        this.actors.rebuild([...this.citizens, ...this.cars]);
      }
    }
    const peopleBuckets = new Map<string, Person[]>();
    for (const p of this.citizens) {
      if (!p.alive || !p.group.visible) continue;
      const key =
        Math.floor(p.group.position.x / 2) +
        "," +
        Math.floor(p.group.position.z / 2);
      if (!peopleBuckets.has(key)) peopleBuckets.set(key, []);
      peopleBuckets.get(key)!.push(p);
    }
    const crowdBodies: CrowdBody[] = [];
    const crowdRecords: {
      id: number;
      a: {
        person?: Person;
        velocity: T.Vector3;
        delay: number;
        speed: number;
        offset: T.Vector3;
      };
      sample: LifeSample;
      frightened: boolean;
    }[] = [];
    const carBuckets = new Map<string, Vehicle[]>();
    const interiorSlots = new Map<number, number>();
    for (const c of this.cars) {
      const k =
        Math.floor(c.group.position.x / 12) +
        "," +
        Math.floor(c.group.position.z / 12);
      if (!carBuckets.has(k)) carBuckets.set(k, []);
      carBuckets.get(k)!.push(c);
    }
    for (const [id, a] of this.liveActors) {
      const actor = a.person || a.car!;
      if (!actor.alive) continue;
      const v = this.life.sample(id),
        pos = actor.group.position;
      if (a.person && actor.group.userData.indoor && !v.inside) {
        const transitTime =
          6 + ((actor.group.userData.roomFloor || 0) * 3.1) / 3;
        a.delay += transitTime;
        this.life.delays.set(id, a.delay);
        actor.group.userData.exitUntil = this.life.seconds + transitTime;
        actor.group.userData.indoor = false;
        actor.group.visible = false;
        continue;
      }
      if (actor.group.userData.exitUntil) {
        if (actor.group.userData.exitUntil > this.life.seconds) {
          actor.group.visible = false;
          continue;
        }
        delete actor.group.userData.exitUntil;
        pos.set(v.x, 0.285, v.z);
        a.velocity.set(0, 0, 0);
      }
      if (
        a.person &&
        this.interiorView &&
        v.inside &&
        v.destination === this.interiorView.building &&
        this.life.floor(id, v.destination) === this.interiorView.floor
      ) {
        const room =
            this.interiorView.rooms[
              v.activity === "sleeping" ? 1 : v.activity === "working" ? 2 : 0
            ],
          base = 0.41 + this.interiorView.floor * 3.1;
        const roomIndex = this.interiorView.rooms.indexOf(room),
          slot = interiorSlots.get(roomIndex) || 0;
        interiorSlots.set(roomIndex, slot + 1);
        actor.group.visible = true;
        actor.group.userData.indoor = true;
        actor.group.userData.roomFloor = this.interiorView.floor;
        actor.group.rotation.x = 0;
        pos.set(room.x + room.w * 0.18, base, room.z);
        posePerson(a.person, dt, time, 0, 0);
        if (v.activity === "sleeping") {
          pos.set(
            room.x + (slot % 2 ? -0.32 : 0.32),
            base + 0.69,
            room.z + 0.85,
          );
          actor.group.rotation.x = -Math.PI / 2;
        } else if (v.activity === "working") {
          pos.z -= 1.5;
          pos.x = room.x + ((slot % 3) - 1) * 0.65;
          for (const arm of a.person.shoulders) arm.rotation.x = -0.65;
        } else {
          pos.set(room.x + ((slot % 3) - 1) * 0.62, base - 0.4, room.z - 0.1);
          actor.group.rotation.y = Math.PI;
          for (const hip of a.person.hips) hip.rotation.x = -Math.PI / 2;
          for (const knee of a.person.knees) knee.rotation.x = Math.PI / 2;
        }
        const capacity = v.activity === "sleeping" ? 2 : 3;
        if (slot >= capacity && room.free?.length) {
          const point = room.free[(slot - capacity) % room.free.length];
          pos.set(point.x, base, point.z);
          actor.group.rotation.x = 0;
          posePerson(
            a.person,
            dt,
            time,
            0,
            Math.atan2(room.x - point.x, room.z - point.z),
          );
        }
        continue;
      }
      actor.group.rotation.x = 0;
      let danger: T.Vector3 | null = null;
      if (impact && pos.distanceTo(impact) < 28) danger = impact;
      const player = this.playerThreat;
      if (
        player &&
        player.position.y < 5 + player.height &&
        Math.hypot(pos.x - player.position.x, pos.z - player.position.z) <
          player.radius + (player.height > 5 ? 18 : 1.2)
      )
        danger = player.position;
      for (const t of this.life.threats)
        if (Math.hypot(pos.x - t.x, pos.z - t.z) < t.radius)
          danger = new T.Vector3(t.x, 0, t.z);
      if (a.person) {
        if (danger)
          a.panic = this.life.seconds + (player && player.height > 5 ? 8 : 3);
        const frightened = a.panic > this.life.seconds;
        actor.group.visible = !v.inside || frightened;
        if (!actor.group.visible) continue;
        const target = new T.Vector3(v.x, 0.285, v.z);
        let speed = v.speed;
        if (frightened && danger) {
          const dir = pos.clone().sub(danger);
          dir.y = 0;
          if (dir.lengthSq() < 0.01) dir.set(id % 2 ? 1 : -1, 0, 1);
          dir.normalize();
          target.copy(pos).addScaledVector(dir, 3);
          speed = player && player.height > 5 ? 4 : 2.8;
        } else if (v.activity === "commuting") {
          target.x += Math.sin(v.heading) * 0.55;
          target.z += Math.cos(v.heading) * 0.55;
          if (crossingWait(this.plan, pos.x, pos.z, target.x, target.z, time)) {
            target.copy(pos);
            speed = 0;
          }
        }
        const radius = 0.28 * a.person.scale;
        crowdBodies.push({
          id,
          x: pos.x,
          z: pos.z,
          vx: a.velocity.x,
          vz: a.velocity.z,
          tx: target.x,
          tz: target.z,
          radius,
          speed,
        });
        crowdRecords.push({ id, a, sample: v, frightened });
      } else {
        const forward = new T.Vector3(
          Math.sin(v.heading),
          0,
          Math.cos(v.heading),
        );
        let stop = !!danger;
        const brakingDistance = 6 + (a.speed * a.speed) / 14;
        if (player && player.position.y < 1.8) {
          const diff = player.position.clone().sub(pos),
            along = diff.dot(forward),
            side = Math.abs(diff.x * forward.z - diff.z * forward.x);
          if (
            along > -player.radius &&
            along < brakingDistance + player.radius &&
            side < 1.6 + player.radius
          )
            stop = true;
        }
        const aheadPoint = pos
          .clone()
          .addScaledVector(forward, brakingDistance);
        if (this.physics.floorHeight(aheadPoint.x, aheadPoint.z) > 0.35)
          stop = true;
        const redDistance = stopLine(this.plan, pos.x, pos.z, v.heading, time);
        if (redDistance < brakingDistance) stop = true;
        const cx = Math.floor(pos.x / 12),
          cz = Math.floor(pos.z / 12);
        for (let x = -1; x <= 1; x++)
          for (let z = -1; z <= 1; z++)
            for (const other of carBuckets.get(cx + x + "," + (cz + z)) || []) {
              if (other === a.car || !other.alive) continue;
              const diff = other.group.position.clone().sub(pos),
                along = diff.dot(forward);
              if (
                along > 0 &&
                along < brakingDistance + (other.length || 4.4) / 2 &&
                Math.abs(diff.x * forward.z - diff.z * forward.x) < 1.7
              )
                stop = true;
            }
        for (const p of this.citizens)
          if (p.alive && p.group.visible) {
            const diff = p.group.position.clone().sub(pos),
              along = diff.dot(forward),
              side = Math.abs(diff.x * forward.z - diff.z * forward.x);
            if (
              Math.abs(diff.y) < 2 &&
              along > -1 &&
              along < brakingDistance &&
              side < 1.8
            )
              stop = true;
          }
        if (stop) {
          a.speed = Math.max(0, a.speed - dt * 7);
        } else {
          a.speed = Math.min(v.speed, a.speed + dt * 2);
        }
        if (v.activity === "commuting") {
          a.delay += dt * (1 - a.speed / Math.max(0.1, v.speed));
          this.life.delays.set(id, a.delay);
        }
        const desired = this.life.sample(id);
        const movement = new T.Vector3(desired.x - pos.x, 0, desired.z - pos.z);
        movement.clampLength(0, a.speed * dt);
        const next = pos.clone().add(movement);
        if (!this.vehicleBlocked(next.x, next.y, next.z, 0.1, 1.7, a.car))
          pos.copy(next);
        else {
          a.delay += dt;
          this.life.delays.set(id, a.delay);
          a.speed = 0;
        }
        pos.y = 0.03;
        actor.group.visible = !v.inside;
        const turn =
          T.MathUtils.euclideanModulo(
            v.heading - actor.group.rotation.y + Math.PI,
            Math.PI * 2,
          ) - Math.PI;
        actor.group.rotation.y += turn * Math.min(1, dt * 5);
        a.car!.axis = Math.abs(forward.x) > 0.5 ? "x" : "z";
      }
    }
    const resolved = advanceCrowd(
      crowdBodies,
      dt,
      (x, z, r) =>
        this.volumeBlocked(x, 0.285, z, r, 1.8) ||
        this.vehicleBlocked(x, 0.285, z, r, 1.8),
    );
    resolved.forEach((next, i) => {
      const { id, a, sample, frightened } = crowdRecords[i],
        p = a.person!;
      a.velocity.set(next.vx, 0, next.vz);
      a.speed = a.velocity.length();
      p.group.position.set(next.x, 0.285, next.z);
      if (sample.activity === "commuting" && !frightened) {
        const progress = Math.max(
          0,
          next.vx * Math.sin(sample.heading) +
            next.vz * Math.cos(sample.heading),
        );
        a.delay +=
          dt * (1 - Math.min(1, progress / Math.max(0.1, sample.speed)));
        this.life.delays.set(id, a.delay);
      }
      posePerson(
        p,
        dt,
        time,
        Math.min(4, a.speed),
        a.speed > 0.1 ? Math.atan2(next.vx, next.vz) : sample.heading,
        frightened,
      );
    });
  }
  vehicleBlocked(
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    ignore?: Vehicle,
  ) {
    return this.cars.some(
      (c) =>
        c !== ignore &&
        c.alive &&
        c.group.visible &&
        y < (c.kind === "tram" ? 3.4 : 1.8) &&
        y + h > 0 &&
        Math.abs(x - c.group.position.x) <
          (c.axis === "x" ? (c.length || 4.4) / 2 : (c.width || 2) / 2) + r &&
        Math.abs(z - c.group.position.z) <
          (c.axis === "z" ? (c.length || 4.4) / 2 : (c.width || 2) / 2) + r,
    );
  }
  nearBuildings(point: T.Vector3, radius: number) {
    const result: BuildingPlan[] = [];
    for (
      let ix = this.cell(point.x - radius);
      ix <= this.cell(point.x + radius);
      ix++
    )
      for (
        let iz = this.cell(point.z - radius);
        iz <= this.cell(point.z + radius);
        iz++
      )
        result.push(
          ...this.plan.districts[ix * this.options.blocks + iz].buildings,
        );
    return result;
  }
  physicsRemove(p: Part) {
    this.physics.removePart(p);
  }
  surfaceHeight(x: number, z: number, ceiling: number) {
    let floor = 0.23;
    const district =
      this.plan.districts[this.cell(x) * this.options.blocks + this.cell(z)];
    for (const p of district.buildings) {
      const b = this.loaded.get(p.district)?.buildings[
          district.buildings.indexOf(p)
        ],
        saved = this.snapshots.get(p.district)?.buildings[
          district.buildings.indexOf(p)
        ];
      const top = Math.min(
        p.floors * 3.1 + 0.8,
        b?.collapseFrom ?? saved?.from ?? Infinity,
      );
      const size = massing(p, Math.min(p.floors - 1, Math.floor(top / 3.1)));
      if (
        top > 0.4 &&
        top <= ceiling &&
        Math.abs(x - p.x) < size.w / 2 &&
        Math.abs(z - p.z) < size.d / 2
      )
        floor = Math.max(floor, top);
    }
    return floor;
  }
  physicsInterior(parts: Part[]) {
    this.physics.bindGeometry(parts);
  }
  attachInterior(parts: Part[], batches: T.InstancedMesh[], owner: Building) {
    this.extras = parts;
    this.extraBatches = batches;
    owner.parts.push(...parts);
    this.physics.bindGeometry(parts);
    this.refresh();
  }
  detachInterior(parts: Part[], batches: T.InstancedMesh[]) {
    this.physics.unbind({ parts });
    for (const b of this.buildings)
      b.parts = b.parts.filter((p) => !parts.includes(p));
    this.extras = [];
    this.extraBatches = [];
    this.refresh();
  }
  volumeBlocked(
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    ignore?: number,
  ) {
    for (let cx = Math.floor((x - r) / 4); cx <= Math.floor((x + r) / 4); cx++)
      for (
        let cz = Math.floor((z - r) / 4);
        cz <= Math.floor((z + r) / 4);
        cz++
      )
        for (const p of this.obstacles.get(cx + "," + cz) || [])
          if (
            p.alive &&
            y < p.p.y + p.s.y / 2 &&
            y + h > p.p.y - p.s.y / 2 &&
            Math.abs(x - p.p.x) < p.s.x / 2 + r &&
            Math.abs(z - p.p.z) < p.s.z / 2 + r
          )
            return true;
    if (
      x - r < this.plan.min ||
      x + r > this.plan.max ||
      z - r < this.plan.min ||
      z + r > this.plan.max
    )
      return true;
    const ix0 = this.cell(x - r),
      ix1 = this.cell(x + r),
      iz0 = this.cell(z - r),
      iz1 = this.cell(z + r);
    for (let ix = ix0; ix <= ix1; ix++)
      for (let iz = iz0; iz <= iz1; iz++)
        for (const p of this.plan.districts[ix * this.options.blocks + iz]
          .buildings) {
          if (p.id === ignore) continue;
          const live = this.loaded.get(p.district)?.buildings[
              this.plan.districts[p.district].buildings.indexOf(p)
            ],
            saved = this.snapshots.get(p.district)?.buildings[
              this.plan.districts[p.district].buildings.indexOf(p)
            ];
          const top = live?.collapseFrom ?? saved?.from ?? Infinity;
          const height = Math.min(p.floors * 3.1 + 0.8, top);
          if (
            height > 0.4 &&
            y < height &&
            y + h > 0.3 &&
            Math.abs(x - p.x) < p.w / 2 + r &&
            Math.abs(z - p.z) < p.d / 2 + r
          )
            return true;
        }
    return false;
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
