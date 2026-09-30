import type { MasterPlan } from "./plan";
export type Light = "green" | "amber" | "red";
export function signalPhase(time: number, ix: number, iz: number) {
  const phase = (((time + ((ix * 7 + iz * 11) % 19)) % 35) + 35) % 35;
  return {
    x: (phase < 12 ? "green" : phase < 14 ? "amber" : "red") as Light,
    z: (phase >= 15 && phase < 27
      ? "green"
      : phase >= 27 && phase < 29
        ? "amber"
        : "red") as Light,
    walk: phase >= 30,
    phase,
  };
}
export function nearestRoad(plan: MasterPlan, value: number) {
  let lo = 0,
    hi = plan.roads.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (plan.roads[mid] < value) lo = mid;
    else hi = mid;
  }
  return Math.abs(plan.roads[lo] - value) < Math.abs(plan.roads[hi] - value)
    ? lo
    : hi;
}
export function stopLine(
  plan: MasterPlan,
  x: number,
  z: number,
  heading: number,
  time: number,
  front = 2.2,
) {
  const axis = Math.abs(Math.sin(heading)) > 0.5 ? "x" : "z",
    sign = (axis === "x" ? Math.sin(heading) : Math.cos(heading)) > 0 ? 1 : -1;
  const along = axis === "x" ? x : z,
    cross = axis === "x" ? z : x,
    step = plan.options.blockSize;
  let junction = nearestRoad(plan, along);
  // Already in the box: clear the intersection even when the signal changes.
  if (Math.abs(along - plan.roads[junction]) < 7 + front) junction += sign;
  else if (sign * (plan.roads[junction] - along) < 0) junction += sign;
  if (junction < 0 || junction >= plan.roads.length) return Infinity;
  const other = nearestRoad(plan, cross),
    ix = axis === "x" ? junction : other,
    iz = axis === "x" ? other : junction;
  const distance = sign * (plan.roads[junction] - along) - 9.4 - front;
  return Math.abs(cross - plan.roads[other]) < 6 &&
    distance < step &&
    signalPhase(time, ix, iz)[axis] !== "green"
    ? Math.max(0, distance)
    : Infinity;
}
export function crossingWait(
  plan: MasterPlan,
  x: number,
  z: number,
  tx: number,
  tz: number,
  time: number,
) {
  const ix = nearestRoad(plan, x),
    iz = nearestRoad(plan, z),
    rx = plan.roads[ix],
    rz = plan.roads[iz];
  if (signalPhase(time, ix, iz).walk) return false;
  // Stop at the curb before entering a roadway, never strand someone halfway.
  return (
    (Math.abs(x - rx) >= 6.2 &&
      Math.abs(tx - rx) < 6.2 &&
      Math.abs(z - rz) < 10) ||
    (Math.abs(z - rz) >= 6.2 &&
      Math.abs(tz - rz) < 6.2 &&
      Math.abs(x - rx) < 10)
  );
}
export interface CrowdBody {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  tx: number;
  tz: number;
  radius: number;
  speed: number;
}
export interface CrowdResult {
  x: number;
  z: number;
  vx: number;
  vz: number;
}
// Bounded predictive steering plus simultaneous positional constraints. This is
// not a full ORCA linear program: the final constraints also resolve stationary
// overlap and prevent wall penetration without an all-pairs neighborhood scan.
export function advanceCrowd(
  bodies: CrowdBody[],
  dt: number,
  blocked: (x: number, z: number, r: number) => boolean,
) {
  const cells = new Map<string, number[]>(),
    key = (x: number, z: number) => Math.floor(x / 3) + "," + Math.floor(z / 3);
  bodies.forEach((b, i) => {
    const k = key(b.x, b.z);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(i);
  });
  const neighbors = (b: CrowdBody) => {
    const list: number[] = [],
      cx = Math.floor(b.x / 3),
      cz = Math.floor(b.z / 3);
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++)
        list.push(...(cells.get(cx + x + "," + (cz + z)) || []));
    return list;
  };
  const next: CrowdResult[] = bodies.map((b) => {
    let dx = b.tx - b.x,
      dz = b.tz - b.z,
      len = Math.hypot(dx, dz),
      vx =
        len > 0.02
          ? (dx / len) * Math.min(b.speed, len / Math.max(dt, 0.001))
          : 0,
      vz =
        len > 0.02
          ? (dz / len) * Math.min(b.speed, len / Math.max(dt, 0.001))
          : 0;
    for (const i of neighbors(b)) {
      const o = bodies[i];
      if (o === b) continue;
      const px = o.x - b.x,
        pz = o.z - b.z,
        rvx = vx - o.vx,
        rvz = vz - o.vz,
        rv2 = rvx * rvx + rvz * rvz;
      const t = Math.max(
          0,
          Math.min(1.3, rv2 > 1e-5 ? (px * rvx + pz * rvz) / rv2 : 0),
        ),
        sx = px - rvx * t,
        sz = pz - rvz * t,
        d = Math.hypot(sx, sz),
        safe = b.radius + o.radius + 0.12;
      if (d < safe && Math.hypot(px, pz) < 3) {
        const sideX = vz,
          sideZ = -vx,
          sideLen = Math.max(0.001, Math.hypot(sideX, sideZ)),
          urgency = (safe - d) * (1 - t / 1.5);
        vx += (sideX / sideLen) * urgency * 1.4;
        vz += (sideZ / sideLen) * urgency * 1.4;
        if (t < 0.5) {
          vx *= 0.65;
          vz *= 0.65;
        }
      }
    }
    const speed = Math.hypot(vx, vz);
    if (speed > b.speed) {
      vx *= b.speed / speed;
      vz *= b.speed / speed;
    }
    let x = b.x + vx * dt,
      z = b.z + vz * dt;
    if (blocked(x, z, b.radius)) {
      if (!blocked(x, b.z, b.radius)) z = b.z;
      else if (!blocked(b.x, z, b.radius)) x = b.x;
      else {
        x = b.x;
        z = b.z;
      }
    }
    return {
      x,
      z,
      vx: (x - b.x) / Math.max(dt, 0.001),
      vz: (z - b.z) / Math.max(dt, 0.001),
    };
  });
  for (let iteration = 0; iteration < 4; iteration++) {
    const shifts = bodies.map(() => ({ x: 0, z: 0 }));
    bodies.forEach((b, i) => {
      for (const j of neighbors(b))
        if (j > i) {
          const o = bodies[j],
            a = next[i],
            c = next[j],
            dx = a.x - c.x,
            dz = a.z - c.z,
            d = Math.hypot(dx, dz),
            min = b.radius + o.radius + 0.035;
          if (d < min) {
            const angle = Math.min(b.id, o.id) * 2.399,
              nx = d > 0.001 ? dx / d : Math.cos(angle),
              nz = d > 0.001 ? dz / d : Math.sin(angle),
              push = (min - d) * 0.51;
            shifts[i].x += nx * push;
            shifts[i].z += nz * push;
            shifts[j].x -= nx * push;
            shifts[j].z -= nz * push;
          }
        }
    });
    next.forEach((a, i) => {
      const s = shifts[i],
        x = a.x + s.x,
        z = a.z + s.z;
      if (!blocked(x, z, bodies[i].radius)) {
        a.x = x;
        a.z = z;
      }
    });
  }
  next.forEach((a, i) => {
    a.vx = (a.x - bodies[i].x) / Math.max(dt, 0.001);
    a.vz = (a.z - bodies[i].z) / Math.max(dt, 0.001);
  });
  return next;
}
