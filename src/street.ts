import type { DistrictPlan } from "./plan";
import { Random } from "./random";
export type StreetAdd = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  c: number,
  shape?: number,
  b?: number,
  role?: number,
  floor?: number,
  yaw?: number,
  pitch?: number,
  support?: number,
) => number;
export const SIGNAL_COLORS = [0xff493e, 0xffbf45, 0x4ce2a3];
export const WALK_COLORS = [0xf89553, 0xc9ffe8];
export function streetInfrastructure(
  p: DistrictPlan,
  detail: number,
  emit: StreetAdd,
) {
  let parent = -1;
  const add: StreetAdd = (...values) => {
    if (values[13] === undefined) values[13] = parent;
    return emit(...values);
  };
  const x = p.x0,
    z = p.z0,
    w = p.x1 - x,
    d = p.z1 - z,
    r = new Random("street/" + p.id + "/" + x + "/" + z),
    metal = 0x354449;
  // A junction owns all four approaches. The lamp records carry axis and aspect
  // metadata; rendering and driving use the exact same clock/phase function.
  for (const axis of [0, 1])
    for (const sign of [-1, 1]) {
      const px = x + (axis === 0 ? sign * 7.8 : 7.8),
        pz = z + (axis === 1 ? sign * 7.8 : -7.8);
      parent = add(px, 2.15, pz, 0.15, 4.3, 0.15, metal, 2);
      const hx = axis === 0 ? px : x + sign * 4,
        hz = axis === 1 ? pz : z + sign * 4;
      add(
        (hx + px) / 2,
        4.18,
        (hz + pz) / 2,
        Math.max(0.1, Math.abs(hx - px)),
        0.1,
        Math.max(0.1, Math.abs(hz - pz)),
        metal,
      );
      add(
        hx,
        3.58,
        hz,
        axis === 0 ? 0.18 : 0.42,
        0.94,
        axis === 0 ? 0.42 : 0.18,
        0x222c2e,
      );
      for (let i = 0; i < 3; i++)
        add(
          hx + (axis === 0 ? -sign * 0.105 : 0),
          3.86 - i * 0.27,
          hz + (axis === 1 ? -sign * 0.105 : 0),
          0.2,
          0.2,
          0.2,
          SIGNAL_COLORS[i],
          1,
          -1,
          axis === 0 ? 10 : 11,
          i,
        );
      add(px, 2.45, pz, 0.36, 0.5, 0.3, 0x222c2e);
      for (let i = 0; i < 2; i++)
        add(
          px + 0.19,
          2.57 - i * 0.22,
          pz,
          0.035,
          0.16,
          0.17,
          WALK_COLORS[i],
          0,
          -1,
          12,
          i,
        );
      // Stop bars leave the crosswalk and intersection box clear.
      parent = -1;
      add(
        x + (axis === 0 ? sign * 9.4 : sign * 4),
        0.057,
        z + (axis === 1 ? sign * 9.4 : sign * 4),
        axis === 0 ? 0.28 : 2.8,
        0.026,
        axis === 1 ? 0.28 : 2.8,
        0xe1dac3,
      );
    }
  // Sewer covers, curb drains, litter bins, hydrants, bicycle racks and cabinets.
  for (const side of [0, 1]) {
    const px = side ? p.x0 + 8.2 : (x + p.x1) / 2,
      pz = side ? (z + p.z1) / 2 : z + 8.2;
    add(px, 0.7, pz, 0.46, 0.92, 0.46, 0x46625b, 2);
    add(px, 1.19, pz, 0.5, 0.08, 0.5, metal, 2);
    for (let i = 0; i < 7; i++)
      add(px - 0.22 + i * 0.07, 0.74, pz + 0.235, 0.028, 0.67, 0.024, 0x203b38);
    const hx = side ? px : p.x0 + 15,
      hz = side ? z + 15 : pz;
    add(hx, 0.61, hz, 0.22, 0.83, 0.22, 0xb85b39, 2);
    add(hx, 0.99, hz, 0.31, 0.12, 0.31, 0xb85b39, 2);
    add(hx, 0.65, hz, 0.45, 0.16, 0.16, 0xb85b39);
    add(
      side ? x + 3 : px,
      0.025,
      side ? pz : z + 3,
      0.76,
      0.035,
      0.76,
      0x303d40,
      2,
    );
    for (let i = 0; i < 5; i++)
      add(
        side ? x + 6.3 : px - 0.32 + i * 0.16,
        0.04,
        side ? pz - 0.32 + i * 0.16 : z + 6.3,
        side ? 0.5 : 0.035,
        0.035,
        side ? 0.035 : 0.5,
        0x253337,
      );
    for (let i = 0; i < 3; i++) {
      const bx = side ? px : px + 4 + i * 0.7,
        bz = side ? pz + 4 + i * 0.7 : pz;
      add(bx - 0.19, 0.61, bz, 0.04, 0.78, 0.04, 0x798887, 2);
      add(bx + 0.19, 0.61, bz, 0.04, 0.78, 0.04, 0x798887, 2);
      add(bx, 0.98, bz, 0.42, 0.04, 0.04, 0x798887);
    }
  }
  const ux = x + 9.7,
    uz = z + d * 0.68;
  add(ux, 0.92, uz, 0.68, 1.35, 0.47, 0x6b7b74);
  add(ux, 1.63, uz, 0.74, 0.06, 0.51, metal);
  if (detail > 0.6)
    for (let i = 0; i < 8; i++)
      add(ux - 0.22 + i * 0.06, 1.12, uz + 0.24, 0.025, 0.37, 0.012, 0x3b4b45);
  // Rail corridors every sixth street share the right-hand vehicle lanes.
  // Segmented rails and overhead wires belong to the destruction graph.
  for (const axis of [0, 1])
    if ((axis === 0 ? p.iz : p.ix) % 6 === 0) {
      const length = axis === 0 ? w : d;
      for (let a = 1; a < length; a += 2) {
        for (const rail of [-4.72, -3.28, 3.28, 4.72])
          add(
            axis === 0 ? x + a : x + rail,
            0.015,
            axis === 0 ? z + rail : z + a,
            axis === 0 ? 1.98 : 0.065,
            0.08,
            axis === 0 ? 0.065 : 1.98,
            0x73858b,
          );
        if (detail > 0.6)
          add(
            axis === 0 ? x + a : x,
            -0.01,
            axis === 0 ? z : z + a,
            axis === 0 ? 0.19 : 1.9,
            0.07,
            axis === 0 ? 1.9 : 0.19,
            0x675849,
          );
      }
      const poles = [length * 0.25, length * 0.75];
      const poleRoots: number[] = [];
      for (const a of poles) {
        const px = axis === 0 ? x + a : x + 7.5,
          pz = axis === 0 ? z + 7.5 : z + a;
        parent = add(px, 3.25, pz, 0.17, 6.5, 0.17, metal, 2);
        poleRoots.push(parent);
        add(
          axis === 0 ? px : x + 1.6,
          6.05,
          axis === 0 ? z + 1.6 : pz,
          axis === 0 ? 0.09 : 11.8,
          0.09,
          axis === 0 ? 11.8 : 0.09,
          metal,
        );
        add(
          axis === 0 ? px : x,
          6.15,
          axis === 0 ? z : pz,
          0.16,
          0.3,
          0.16,
          0xa7b1a6,
          2,
        );
        parent = -1;
      }
      for (const track of [-4, 4])
        for (let a = 2; a < length; a += 4) {
          parent = poleRoots[a < length * 0.5 ? 0 : 1];
          const sag = 0.2 * Math.sin((a / length) * Math.PI);
          add(
            axis === 0 ? x + a : x + track,
            5.6 - sag,
            axis === 0 ? z + track : z + a,
            axis === 0 ? 4.03 : 0.025,
            0.03,
            axis === 0 ? 0.025 : 4.03,
            0x303b40,
          );
        }
      parent = -1;
      if ((axis === 0 ? p.ix : p.iz) % 3 === 0) {
        for (const platformSide of [-1, 1]) {
          const sx = axis === 0 ? x + length * 0.42 : x + platformSide * 8.6,
            sz = axis === 0 ? z + platformSide * 8.6 : z + length * 0.42;
          add(
            sx,
            0.25,
            sz,
            axis === 0 ? 7 : 1.7,
            0.08,
            axis === 0 ? 1.7 : 7,
            0xc6bba4,
          );
          add(
            sx,
            2.52,
            sz,
            axis === 0 ? 5.4 : 1.7,
            0.14,
            axis === 0 ? 1.7 : 5.4,
            0x4b6264,
          );
          for (const sign of [-1, 1])
            add(
              sx + (axis === 0 ? sign * 2.5 : 0),
              1.4,
              sz + (axis === 1 ? sign * 2.5 : 0),
              0.08,
              2.4,
              0.08,
              metal,
            );
          add(
            sx + (axis === 1 ? platformSide * 0.72 : 0),
            1.45,
            sz + (axis === 0 ? platformSide * 0.72 : 0),
            axis === 0 ? 5 : 0.04,
            1.95,
            axis === 0 ? 0.04 : 5,
            0x5c7d85,
          );
          add(
            sx,
            0.67,
            sz,
            axis === 0 ? 2.8 : 0.5,
            0.11,
            axis === 0 ? 0.5 : 2.8,
            0x967657,
          );
          add(
            sx + (axis === 0 ? 3.3 : 0),
            1.9,
            sz + (axis === 1 ? 3.3 : 0),
            0.06,
            3.35,
            0.06,
            metal,
            2,
          );
          add(
            sx + (axis === 0 ? 3.3 : 0),
            3.38,
            sz + (axis === 1 ? 3.3 : 0),
            0.45,
            0.55,
            0.1,
            0x61b2a3,
          );
        }
      }
      const terminal = axis === 0 ? p.ix : p.iz,
        lastStop = Math.floor((p.gridSize - 1) / 3) * 3;
      if (terminal === 0 || terminal === lastStop) {
        const dir = terminal === 0 ? -1 : 1,
          center = (axis === 0 ? x : z) + length * 0.42;
        for (const radius of [3.28, 4.72])
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI,
              b = ((i + 1) / 24) * Math.PI,
              aa = center + dir * radius * Math.sin(a),
              ab = center + dir * radius * Math.sin(b),
              ca = dir * radius * Math.cos(a),
              cb = dir * radius * Math.cos(b);
            const ax = axis === 0 ? aa : x - ca,
              bx = axis === 0 ? ab : x - cb,
              az = axis === 0 ? z + ca : aa,
              bz = axis === 0 ? z + cb : ab;
            add(
              (ax + bx) / 2,
              0.015,
              (az + bz) / 2,
              Math.hypot(bx - ax, bz - az) + 0.02,
              0.08,
              0.065,
              0x73858b,
              0,
              -1,
              0,
              -1,
              Math.atan2(-(bz - az), bx - ax),
            );
          }
      }
    }
  // Distribution lines run through older, smaller blocks; the dense center
  // uses underground utility cabinets instead of implausible pole forests.
  if (p.buildings.every((b) => b.floors < 20) && detail > 0.5) {
    for (const a of [12, w - 12]) {
      add(x + a, 3.5, z + 9, 0.22, 7, 0.22, 0x725d48, 2);
      add(x + a, 6.65, z + 9, 1.6, 0.1, 0.1, metal);
    }
    for (const line of [-0.5, 0, 0.5])
      for (let a = 14; a < w - 12; a += 3)
        add(
          x + a,
          6.52 - 0.28 * Math.sin(((a - 12) / (w - 24)) * Math.PI),
          z + 9 + line,
          3.03,
          0.025,
          0.025,
          0x303b40,
        );
  }
  if (p.park) {
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399,
        rr = Math.sqrt(i / 12) * Math.min(w, d) * 0.22;
      add(
        (x + p.x1) / 2 + Math.cos(a) * rr,
        0.52,
        (z + p.z1) / 2 + Math.sin(a) * rr,
        0.9,
        0.65,
        0.8,
        r.pick([0x506c47, 0x697f52, 0x84945b]),
        1,
      );
    }
  }
}
