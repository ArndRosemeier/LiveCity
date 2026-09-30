import { Random } from "./random";
import type { MasterPlan, BuildingPlan } from "./plan";
export type Activity =
  | "sleeping"
  | "at home"
  | "commuting"
  | "working"
  | "shopping"
  | "relaxing"
  | "evacuating";
export interface LifeSample {
  id: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  activity: Activity;
  vehicle: boolean;
  inside: boolean;
  destination: number;
}
export interface Threat {
  x: number;
  z: number;
  radius: number;
  until: number;
}
const DAY = 24 * 300;
export class CityLife {
  readonly count: number;
  readonly homes: Int32Array;
  readonly jobs: Int32Array;
  readonly leisure: Int32Array;
  readonly offsets: Float32Array;
  readonly speeds: Float32Array;
  readonly drivers: Uint8Array;
  readonly cells: Int32Array;
  readonly buckets = new Map<number, Set<number>>();
  readonly dead = new Set<number>();
  readonly displaced = new Set<number>();
  readonly delays = new Map<number, number>();
  readonly hunger: Float32Array;
  readonly energy: Float32Array;
  readonly savings: Float32Array;
  private updated: Float64Array;
  threats: Threat[] = [];
  seconds = 17.7 * 300;
  cursor = 0;
  private previousHour = 17.7;
  constructor(public plan: MasterPlan) {
    this.count = plan.districts.length * plan.options.crowds;
    this.homes = new Int32Array(this.count);
    this.jobs = new Int32Array(this.count);
    this.leisure = new Int32Array(this.count);
    this.offsets = new Float32Array(this.count);
    this.speeds = new Float32Array(this.count);
    this.drivers = new Uint8Array(this.count);
    this.cells = new Int32Array(this.count).fill(-1);
    this.hunger = new Float32Array(this.count);
    this.energy = new Float32Array(this.count).fill(80);
    this.savings = new Float32Array(this.count);
    this.updated = new Float64Array(this.count).fill(this.seconds);
    const occupied = plan.districts.filter((d) => d.buildings.length);
    if (!occupied.length) this.count = 0;
    for (let id = 0; id < this.count; id++) {
      const r = new Random(plan.seed + "/resident/" + id),
        homeDistrict =
          plan.districts[Math.floor(id / Math.max(1, plan.options.crowds))];
      const home = r.pick(
        homeDistrict.buildings.length
          ? homeDistrict.buildings
          : r.pick(occupied).buildings,
      );
      const nearby = (span: number) => {
        const ix = Math.max(
            0,
            Math.min(
              plan.options.blocks - 1,
              homeDistrict.ix + r.int(-span, span),
            ),
          ),
          iz = Math.max(
            0,
            Math.min(
              plan.options.blocks - 1,
              homeDistrict.iz + r.int(-span, span),
            ),
          );
        const d = plan.districts[ix * plan.options.blocks + iz];
        return r.pick(
          d.buildings.length
            ? d.buildings
            : homeDistrict.buildings.length
              ? homeDistrict.buildings
              : [home],
        );
      };
      this.homes[id] = home.id;
      this.jobs[id] = nearby(4).id;
      this.leisure[id] = nearby(2).id;
      this.offsets[id] = r.range(-0.45, 0.45);
      this.speeds[id] = r.range(1.1, 1.6);
      this.drivers[id] = Number(
        r.next() <
          Math.min(
            0.6,
            (plan.options.traffic / Math.max(1, plan.options.crowds)) * 2,
          ),
      );
      this.hunger[id] = r.range(20, 50);
      this.savings[id] = r.range(100, 1000);
      this.index(id);
    }
  }
  setHour(hour: number) {
    this.seconds = Math.floor(this.seconds / DAY) * DAY + hour * 300;
    this.updated.fill(this.seconds);
    for (let id = 0; id < this.count; id++) this.index(id);
  }
  get hour() {
    return (this.seconds / 300) % 24;
  }
  get population() {
    return this.count - this.dead.size;
  }
  tick(dt: number) {
    this.seconds += dt;
    const batch = Math.min(this.count, 3072);
    for (let i = 0; i < batch; i++) {
      this.index(this.cursor);
      this.cursor = (this.cursor + 1) % Math.max(1, this.count);
    }
    this.threats = this.threats.filter((t) => t.until > this.seconds);
    this.previousHour = this.hour;
  }
  private door(b: BuildingPlan, vehicle: boolean) {
    const d = this.plan.districts[b.district];
    return vehicle
      ? { x: b.x, z: b.front < 0 ? d.z0 - 3 : d.z1 + 3 }
      : { x: b.x, z: b.z + b.front * (b.d / 2 + 1.1) };
  }
  route(a: BuildingPlan, b: BuildingPlan, vehicle: boolean) {
    const start = this.door(a, vehicle),
      end = this.door(b, vehicle),
      da = this.plan.districts[a.district],
      db = this.plan.districts[b.district];
    const lane = vehicle ? -3 : 8.1;
    const za = a.front < 0 ? da.z0 + lane : da.z1 - lane,
      zb = b.front < 0 ? db.z0 + lane : db.z1 - lane;
    const trunk = this.plan.roads[da.ix] + lane;
    return [
      start,
      { x: start.x, z: za },
      { x: trunk, z: za },
      { x: trunk, z: zb },
      { x: end.x, z: zb },
      end,
    ];
  }
  sample(id: number): LifeSample {
    const home = this.plan.buildings[this.homes[id]],
      job = this.plan.buildings[this.jobs[id]],
      shop = this.plan.buildings[this.leisure[id]],
      vehicle = !!this.drivers[id];
    const h = ((this.seconds - (this.delays.get(id) || 0)) / 300) % 24,
      offset = this.offsets[id];
    let from = home,
      to = home,
      start = 0,
      activity: Activity = "at home";
    if (h < 6.7 + offset || h > 22.7 + offset) activity = "sleeping";
    else if (h < 8.5 + offset) {
      from = home;
      to = job;
      start = 6.7 + offset;
      activity = "commuting";
    } else if (h < 17 + offset) {
      from = job;
      to = job;
      activity = "working";
    } else if (h < 18.8 + offset) {
      from = job;
      to = shop;
      start = 17 + offset;
      activity = "commuting";
    } else if (h < 20 + offset) {
      from = shop;
      to = shop;
      activity = id % 3 ? "shopping" : "relaxing";
    } else if (h < 22 + offset) {
      from = shop;
      to = home;
      start = 20 + offset;
      activity = "commuting";
    }
    const path = this.route(from, to, vehicle);
    let length = 0;
    for (let i = 1; i < path.length; i++)
      length += Math.hypot(
        path[i].x - path[i - 1].x,
        path[i].z - path[i - 1].z,
      );
    const speed = vehicle ? 9 : this.speeds[id];
    let distance = Math.max(0, (h - start) * 300 * speed);
    let x = path.at(-1)!.x,
      z = path.at(-1)!.z,
      heading = 0,
      inside = true;
    if (activity === "commuting" && distance < length && from !== to) {
      inside = false;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i],
          l = Math.hypot(b.x - a.x, b.z - a.z);
        if (distance <= l && l > 0.001) {
          const t = distance / l;
          x = a.x + (b.x - a.x) * t;
          z = a.z + (b.z - a.z) * t;
          heading = Math.atan2(b.x - a.x, b.z - a.z);
          break;
        }
        distance -= l;
      }
    } else if (activity === "commuting")
      activity = to === job ? "working" : to === home ? "at home" : "shopping";
    if ((activity === "shopping" || activity === "relaxing") && id % 4 === 0) {
      inside = false;
      x +=
        ((id % 13) - 6) * Math.min(1, to.w / 14) +
        Math.sin(this.seconds * 0.12 + id) * 0.3;
      z += to.front * 0.4;
    }
    if (this.displaced.has(from.id) || this.displaced.has(to.id)) {
      const d = this.plan.districts[home.district];
      x = d.x0 + 8;
      z = d.z0 + 12 + (id % 12);
      inside = false;
      activity = "evacuating";
    }
    return {
      id,
      x,
      z,
      heading,
      speed: inside ? 0 : activity === "evacuating" ? this.speeds[id] : speed,
      activity,
      vehicle: activity === "evacuating" ? false : vehicle,
      inside,
      destination: to.id,
    };
  }
  cell(x: number, z: number) {
    const roads = this.plan.roads;
    const axis = (v: number) => {
      let lo = 0,
        hi = roads.length - 1;
      while (lo + 1 < hi) {
        const m = (lo + hi) >> 1;
        if (v < roads[m]) hi = m;
        else lo = m;
      }
      return Math.max(0, Math.min(this.plan.options.blocks - 1, lo));
    };
    return axis(x) * this.plan.options.blocks + axis(z);
  }
  private index(id: number) {
    if (!this.count) return;
    const s = this.sample(id),
      cell = this.cell(s.x, s.z);
    const dt = Math.max(0, this.seconds - this.updated[id]);
    this.updated[id] = this.seconds;
    if (!this.dead.has(id)) {
      this.hunger[id] = Math.max(
        5,
        Math.min(
          100,
          this.hunger[id] + dt * (s.activity === "shopping" ? -0.15 : 0.035),
        ),
      );
      this.energy[id] = Math.max(
        0,
        Math.min(
          100,
          this.energy[id] +
            dt *
              (s.activity === "sleeping"
                ? 0.06
                : s.activity === "commuting"
                  ? -0.035
                  : -0.012),
        ),
      );
      this.savings[id] = Math.max(
        0,
        this.savings[id] +
          dt *
            (s.activity === "working"
              ? 0.07
              : s.activity === "shopping"
                ? -0.025
                : 0),
      );
    }
    if (this.cells[id] === cell) return;
    this.buckets.get(this.cells[id])?.delete(id);
    if (!this.buckets.has(cell)) this.buckets.set(cell, new Set());
    this.buckets.get(cell)!.add(id);
    this.cells[id] = cell;
  }
  nearby(districts: number[]) {
    const result: number[] = [];
    for (const cell of districts)
      for (const id of this.buckets.get(cell) || [])
        if (!this.dead.has(id)) {
          const s = this.sample(id);
          if (!s.inside) result.push(id);
        }
    return result;
  }
  indoors(building: number, floor: number) {
    const result: number[] = [],
      b = this.plan.buildings[building];
    for (let id = 0; id < this.count; id++)
      if (
        !this.dead.has(id) &&
        (this.homes[id] === building ||
          this.jobs[id] === building ||
          this.leisure[id] === building) &&
        this.floor(id, building) === floor
      ) {
        const s = this.sample(id);
        if (s.inside && s.destination === building) result.push(id);
      }
    return result;
  }
  floor(id: number, building: number) {
    const b = this.plan.buildings[building];
    return this.homes[id] === building
      ? 1 + (id % Math.max(1, b.floors - 1))
      : id % b.floors;
  }
  incident(x: number, z: number, radius: number) {
    this.threats.push({ x, z, radius, until: this.seconds + 20 });
    if (this.threats.length > 16) this.threats.shift();
  }
  describe(id: number) {
    const r = new Random(this.plan.seed + "/identity/" + id),
      names = [
        "Alex",
        "Sam",
        "Morgan",
        "Robin",
        "Jamie",
        "Avery",
        "Jordan",
        "Taylor",
        "Casey",
        "Drew",
      ],
      family = [
        "Chen",
        "Rivera",
        "Khan",
        "Martin",
        "Okafor",
        "Park",
        "Silva",
        "Rossi",
      ];
    const s = this.sample(id);
    return {
      name: r.pick(names) + " " + r.pick(family),
      occupation: r.pick([
        "architect",
        "teacher",
        "nurse",
        "baker",
        "engineer",
        "shopkeeper",
        "designer",
      ]),
      activity: s.activity,
      home: this.homes[id],
      work: this.jobs[id],
      destination: s.destination,
      energy: Math.round(this.energy[id]),
      hunger: Math.round(this.hunger[id]),
      savings: Math.round(this.savings[id]),
    };
  }
}
