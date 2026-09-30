import * as T from "three";
import type { MasterPlan } from "./plan";
import { createTram, type Vehicle } from "./inhabitants";
import { Random } from "./random";
import { stopLine } from "./traffic";
interface Leg {
  from: number;
  to: number;
  start: number;
  duration: number;
  acceleration: number;
  peak: number;
  ramp: number;
  cruise: number;
  station: number;
  dwell: number;
}
export interface TramLine {
  id: number;
  axis: "x" | "z";
  road: number;
  stations: number[];
  legs: Leg[];
  period: number;
}
export function tramLines(plan: MasterPlan): TramLine[] {
  const lines: TramLine[] = [];
  for (const axis of ["x", "z"] as const)
    for (let road = 0; road < plan.options.blocks; road += 6) {
      const stations: number[] = [];
      for (let i = 0; i < plan.options.blocks; i += 3)
        stations.push(
          plan.roads[i] + (plan.roads[i + 1] - plan.roads[i]) * 0.42,
        );
      if (stations.length < 2) continue;
      const legs: Leg[] = [];
      let start = 0;
      const indices = [
        ...stations.keys(),
        ...Array.from(
          { length: stations.length - 2 },
          (_, i) => stations.length - 2 - i,
        ),
        0,
      ];
      for (let i = 1; i < indices.length; i++) {
        const from = stations[indices[i - 1]],
          to = stations[indices[i]],
          distance = Math.abs(to - from),
          acceleration = 1.1,
          peak = Math.min(10, Math.sqrt(distance * acceleration)),
          ramp = peak / acceleration,
          cruise = Math.max(
            0,
            (distance - (peak * peak) / acceleration) / peak,
          ),
          dwell =
            indices[i - 1] === 0 || indices[i - 1] === stations.length - 1
              ? 16
              : 8,
          duration = dwell + 2 * ramp + cruise;
        legs.push({
          from,
          to,
          start,
          duration,
          acceleration,
          peak,
          ramp,
          cruise,
          station: indices[i - 1],
          dwell,
        });
        start += duration;
      }
      lines.push({
        id: lines.length,
        axis,
        road: plan.roads[road],
        stations,
        legs,
        period: start,
      });
    }
  return lines;
}
export function tramPosition(line: TramLine, time: number) {
  const t = ((time % line.period) + line.period) % line.period,
    leg = line.legs.find((l) => t < l.start + l.duration) || line.legs.at(-1)!,
    moving = t - leg.start - leg.dwell,
    direction = Math.sign(leg.to - leg.from);
  let distance = 0,
    speed = 0;
  if (moving > 0) {
    if (moving < leg.ramp) {
      distance = 0.5 * leg.acceleration * moving * moving;
      speed = leg.acceleration * moving;
    } else if (moving < leg.ramp + leg.cruise) {
      distance = 0.5 * leg.peak * leg.ramp + (moving - leg.ramp) * leg.peak;
      speed = leg.peak;
    } else {
      const remaining = leg.duration - leg.dwell - moving;
      distance =
        Math.abs(leg.to - leg.from) -
        0.5 * leg.acceleration * remaining * remaining;
      speed = Math.max(0, leg.acceleration * remaining);
    }
  }
  const along = leg.from + distance * direction,
    lane = 4 * direction;
  if (leg.dwell === 16 && moving <= 0) {
    const turn = Math.max(0, (moving + 8) / 8),
      u = turn * turn * (3 - 2 * turn),
      angle = u * Math.PI,
      previous = -direction;
    const a = leg.from + previous * 4 * Math.sin(angle),
      cross = previous * 4 * Math.cos(angle);
    return {
      x: line.axis === "x" ? a : line.road - cross,
      z: line.axis === "x" ? line.road + cross : a,
      heading:
        line.axis === "x"
          ? Math.atan2(previous * Math.cos(angle), -previous * Math.sin(angle))
          : Math.atan2(previous * Math.sin(angle), previous * Math.cos(angle)),
      speed: turn > 0 ? (4 * Math.PI * 6 * turn * (1 - turn)) / 8 : 0,
      dwell: turn === 0,
      station: leg.station,
    };
  }
  return {
    x: line.axis === "x" ? along : line.road - lane,
    z: line.axis === "x" ? line.road + lane : along,
    heading:
      line.axis === "x"
        ? (direction * Math.PI) / 2
        : direction > 0
          ? 0
          : Math.PI,
    speed,
    dwell: moving <= 0,
    station: leg.station,
  };
}
export class Transit {
  lines: TramLine[];
  private fleet: {
    id: number;
    line: TramLine;
    offset: number;
    delay: number;
    speed: number;
    actor?: Vehicle;
  }[] = [];
  private dead = new Set<number>();
  constructor(private plan: MasterPlan) {
    this.lines = tramLines(plan);
    const r = new Random(plan.seed + "/transit");
    for (const line of this.lines) {
      const count = Math.max(2, Math.ceil(plan.extent / 650));
      for (let i = 0; i < count; i++)
        this.fleet.push({
          id: this.fleet.length,
          line,
          offset: (i * line.period) / count + r.range(0, 8),
          delay: 0,
          speed: 0,
        });
    }
  }
  get cars() {
    return this.fleet.flatMap((f) => (f.actor ? [f.actor] : []));
  }
  get fleetSize() {
    return this.fleet.length;
  }
  update(
    dt: number,
    time: number,
    focus: T.Vector3,
    blocked: (vehicle: Vehicle, next: T.Vector3) => boolean,
  ) {
    let changed = false;
    for (const f of this.fleet) {
      if (f.actor && !f.actor.alive) {
        this.dead.add(f.id);
        f.actor = undefined;
        changed = true;
      }
      if (this.dead.has(f.id)) continue;
      const sample = tramPosition(f.line, time + f.offset - f.delay),
        distance = Math.hypot(sample.x - focus.x, sample.z - focus.z);
      if (distance > 230) {
        if (f.actor) {
          f.actor = undefined;
          changed = true;
        }
        continue;
      }
      if (!f.actor) {
        f.actor = createTram(this.plan.seed + "/tram/" + f.id);
        f.actor.group.position.set(sample.x, 0.03, sample.z);
        f.speed = sample.speed;
        changed = true;
      }
      const car = f.actor;
      car.axis = Math.abs(Math.sin(sample.heading)) > 0.5 ? "x" : "z";
      car.dir = sample.heading === Math.PI || sample.heading < 0 ? -1 : 1;
      const front = stopLine(
          this.plan,
          car.group.position.x,
          car.group.position.z,
          sample.heading,
          time,
          6.2,
        ),
        braking = 2 + (f.speed * f.speed) / 2.2;
      const ahead = car.group.position
        .clone()
        .add(
          new T.Vector3(
            Math.sin(sample.heading),
            0,
            Math.cos(sample.heading),
          ).multiplyScalar(Math.max(1, braking)),
        );
      let obstruction = blocked(car, ahead);
      // Sample the whole braking corridor, including actors before its endpoint.
      for (let d = 0; !obstruction && d < braking; d += 4) {
        ahead
          .copy(car.group.position)
          .addScaledVector(
            new T.Vector3(
              Math.sin(sample.heading),
              0,
              Math.cos(sample.heading),
            ),
            d,
          );
        obstruction = blocked(car, ahead);
      }
      const stopped = front < braking || obstruction;
      f.speed = T.MathUtils.damp(
        f.speed,
        stopped ? 0 : sample.speed,
        stopped ? 3 : 1.8,
        dt,
      );
      if (stopped || f.speed < sample.speed - 0.05)
        f.delay +=
          dt * (1 - Math.min(1, f.speed / Math.max(0.1, sample.speed)));
      const desired = tramPosition(f.line, time + f.offset - f.delay),
        next = new T.Vector3(desired.x, 0.03, desired.z),
        delta = next
          .clone()
          .sub(car.group.position)
          .clampLength(0, Math.max(desired.speed, f.speed) * dt);
      next.copy(car.group.position).add(delta);
      if (!blocked(car, next)) car.group.position.copy(next);
      else {
        f.delay += dt;
        f.speed = 0;
      }
      car.group.rotation.y = desired.heading;
      car.speed = f.speed;
      const open =
        desired.dwell &&
        Math.hypot(
          car.group.position.x - desired.x,
          car.group.position.z - desired.z,
        ) < 0.4;
      car.group.userData.station = desired.station;
      car.group.userData.line = f.line.id + 1;
      car.group.userData.doorsOpen = open;
      car.group.traverse((o) => {
        if (typeof o.userData.tramDoor === "number")
          o.position.z = T.MathUtils.damp(
            o.position.z,
            o.userData.tramDoor + (open ? 0.75 : 0),
            7,
            dt,
          );
        if (o.userData.tramWheel) o.rotation.x += (f.speed * dt) / 0.28;
      });
    }
    return changed;
  }
}
