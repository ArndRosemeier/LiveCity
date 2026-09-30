import { Random } from "./random";
export type Style =
  | "brownstone"
  | "tenement"
  | "artdeco"
  | "glass"
  | "setback"
  | "warehouse"
  | "courtyard";
export interface CityOptions {
  blocks: number;
  blockSize: number;
  coverage: number;
  height: number;
  variety: number;
  crowds: number;
  traffic: number;
  detail: number;
  radius: number;
  budget: number;
}
export const defaults: CityOptions = {
  blocks: 32,
  blockSize: 64,
  coverage: 0.88,
  height: 65,
  variety: 0.9,
  crowds: 34,
  traffic: 5,
  detail: 0.75,
  radius: 180,
  budget: 8,
};
export function options(input: Partial<CityOptions> = {}): CityOptions {
  const o = { ...defaults, ...input };
  const clamp = (v: number, a: number, b: number, f: number) =>
    Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : f;
  return {
    blocks: Math.round(clamp(o.blocks, 4, 64, 32)),
    blockSize: clamp(o.blockSize, 48, 100, 64),
    coverage: clamp(o.coverage, 0.3, 1, 0.88),
    height: Math.round(clamp(o.height, 8, 110, 65)),
    variety: clamp(o.variety, 0, 1, 0.9),
    crowds: Math.round(clamp(o.crowds, 0, 120, 34)),
    traffic: Math.round(clamp(o.traffic, 0, 20, 5)),
    detail: clamp(o.detail, 0.2, 1, 0.75),
    radius: clamp(o.radius, 80, 360, 180),
    budget: Math.round(clamp(o.budget, 2, 12, 8)),
  };
}
export interface BuildingPlan {
  id: number;
  district: number;
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  style: Style;
  color: number;
  accent: number;
  front: number;
  seed: string;
}
export interface DistrictPlan {
  id: number;
  ix: number;
  iz: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  park: boolean;
  buildings: BuildingPlan[];
}
export interface MasterPlan {
  seed: string;
  options: CityOptions;
  roads: number[];
  districts: DistrictPlan[];
  buildings: BuildingPlan[];
  min: number;
  max: number;
  extent: number;
}
const palette: Record<Style, number[]> = {
  brownstone: [0x936550, 0xa87861, 0x79574b],
  tenement: [0xb4a88d, 0xa28469, 0x956754],
  artdeco: [0xc2bda9, 0xb9ae96, 0xa8afa7],
  glass: [0x526d7a, 0x779298, 0x485c6b],
  setback: [0x9ca7a4, 0xbab6a6, 0x71818b],
  warehouse: [0x8e6756, 0xab8b69, 0x827a68],
  courtyard: [0xc1b7a2, 0x9caa9b, 0xb29a82],
};
export function createPlan(
  seed: string,
  input: Partial<CityOptions> = {},
): MasterPlan {
  const o = options(input),
    r = new Random(seed + "/streets"),
    roads = [0];
  for (let i = 0; i < o.blocks; i++)
    roads.push(roads.at(-1)! + o.blockSize * r.range(0.92, 1.08));
  const offset = roads[Math.floor(o.blocks / 2)];
  for (let i = 0; i < roads.length; i++) roads[i] -= offset;
  const districts: DistrictPlan[] = [],
    buildings: BuildingPlan[] = [];
  for (let ix = 0; ix < o.blocks; ix++)
    for (let iz = 0; iz < o.blocks; iz++) {
      const id = ix * o.blocks + iz,
        r = new Random(`${seed}/district/${ix}/${iz}`),
        x0 = roads[ix],
        x1 = roads[ix + 1],
        z0 = roads[iz],
        z1 = roads[iz + 1];
      const district: DistrictPlan = {
        id,
        ix,
        iz,
        x0,
        x1,
        z0,
        z1,
        park: r.next() < 0.055,
        buildings: [],
      };
      districts.push(district);
      if (district.park) continue;
      const bw = x1 - x0 - 18,
        bd = z1 - z0 - 18;
      const occupied = new Set<string>();
      for (let a = 0; a < 2; a++)
        for (let b = 0; b < 2; b++) {
          if (occupied.has(`${a}/${b}`)) continue;
          if (r.next() > o.coverage) continue;
          const x = x0 + 9 + ((a + 0.5) * bw) / 2,
            z = z0 + 9 + ((b + 0.5) * bd) / 2;
          const center = Math.exp(
            -Math.hypot(x, z) / (o.blocks * o.blockSize * 0.22),
          );
          const style: Style =
            r.next() < o.variety
              ? r.pick(
                  center > 0.6
                    ? ["glass", "artdeco", "setback", "tenement", "courtyard"]
                    : [
                        "brownstone",
                        "tenement",
                        "warehouse",
                        "courtyard",
                        "glass",
                      ],
                )
              : "glass";
          const tall = ["glass", "artdeco", "setback"].includes(style);
          let floors = tall
            ? Math.round(5 + o.height * center * r.range(0.25, 1))
            : style === "brownstone"
              ? r.int(3, 6)
              : style === "warehouse"
                ? r.int(2, 5)
                : r.int(5, 12);
          if (tall && r.next() < 0.035)
            floors = Math.round(o.height * r.range(0.9, 1.2));
          floors = Math.max(2, Math.min(132, floors));
          // Some commercial towers acquire a neighboring lot: a broader footprint
          // breaks up the skyline and makes space for substantial office buildings.
          const merged = a === 0 && tall && r.next() < 0.32;
          if (merged) occupied.add(`1/${b}`);
          const p: BuildingPlan = {
            id: buildings.length,
            district: id,
            x: x + (merged ? bw / 4 : 0),
            z,
            w: bw / (merged ? 1 : 2) - r.range(2.8, 5.2),
            d: bd / 2 - r.range(2.8, 5.2),
            floors,
            style,
            color: r.pick(palette[style]),
            accent: r.pick([0xd5cdb4, 0x4a5d61, 0xb7b9ab]),
            front: b === 0 ? -1 : 1,
            seed: `${seed}/building/${ix}/${iz}/${a}/${b}`,
          };
          buildings.push(p);
          district.buildings.push(p);
        }
    }
  return {
    seed,
    options: o,
    roads,
    districts,
    buildings,
    min: roads[0],
    max: roads.at(-1)!,
    extent: roads.at(-1)! - roads[0],
  };
}
export function massing(p: BuildingPlan, floor: number) {
  let factor = 1;
  if (p.style === "artdeco" || p.style === "setback") {
    const step = Math.floor(floor / Math.max(5, Math.floor(p.floors / 4)));
    factor = Math.max(0.48, 1 - step * 0.13);
  } else if (p.style === "glass" && floor > p.floors * 0.8) factor = 0.82;
  return { w: p.w * factor, d: p.d * factor };
}
export interface DistrictData {
  district: number;
  parts: Float32Array;
  count: number;
  detail: number;
}
// Record: position(3), dimensions(3), RGB integer, shape, local building, support role, floor, yaw.
export const STRIDE = 12;
