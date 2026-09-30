import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Random } from "./random";
import { HumanSurface } from "./human-surface";
import type { DistrictPlan } from "./plan";
export interface Actor {
  group: T.Group;
  alive: boolean;
}
export interface Person extends Actor {
  hips: T.Group[];
  knees: T.Group[];
  ankles: T.Group[];
  shoulders: T.Group[];
  elbows: T.Group[];
  head: T.Group;
  spine: T.Group;
  phase: number;
  speed: number;
  progress: number;
  direction: number;
  pauseUntil: number;
  scale: number;
}
export interface Vehicle extends Actor {
  progress: number;
  speed: number;
  dir: number;
  axis: "x" | "z";
  lane: number;
  length?: number;
  width?: number;
  kind?: "car" | "tram";
}
const sphere = new T.SphereGeometry(0.5, 12, 8),
  capsule = new T.CapsuleGeometry(0.5, 1, 4, 8),
  box = new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
  tube = new T.CylinderGeometry(0.5, 0.5, 1, 8),
  wheel = new T.CylinderGeometry(0.5, 0.5, 1, 16);
const torso = new T.LatheGeometry(
  [
    new T.Vector2(0.14, -0.23),
    new T.Vector2(0.16, -0.13),
    new T.Vector2(0.18, 0.02),
    new T.Vector2(0.22, 0.17),
    new T.Vector2(0.18, 0.21),
    new T.Vector2(0.065, 0.24),
  ],
  16,
);
// Continuous tapered silhouettes keep cloth volume at the joints instead of
// terminating each limb in a capsule tip.
const thighShape = new T.LatheGeometry(
  [
    new T.Vector2(0.32, -0.5),
    new T.Vector2(0.36, -0.3),
    new T.Vector2(0.48, 0.12),
    new T.Vector2(0.5, 0.38),
    new T.Vector2(0.43, 0.5),
  ],
  12,
);
const shinShape = new T.LatheGeometry(
  [
    new T.Vector2(0.25, -0.5),
    new T.Vector2(0.28, -0.3),
    new T.Vector2(0.45, 0.12),
    new T.Vector2(0.4, 0.4),
    new T.Vector2(0.4, 0.5),
  ],
  12,
);
const armShape = new T.LatheGeometry(
  [
    new T.Vector2(0.32, -0.5),
    new T.Vector2(0.36, -0.25),
    new T.Vector2(0.44, 0.1),
    new T.Vector2(0.5, 0.4),
    new T.Vector2(0.45, 0.5),
  ],
  12,
);
const headShape = new T.LatheGeometry(
  [
    new T.Vector2(0.028, 0),
    new T.Vector2(0.066, 0.018),
    new T.Vector2(0.092, 0.07),
    new T.Vector2(0.105, 0.14),
    new T.Vector2(0.096, 0.205),
    new T.Vector2(0.063, 0.24),
    new T.Vector2(0.0, 0.255),
  ],
  16,
);
const hairCap = new T.SphereGeometry(
  0.5,
  14,
  8,
  0,
  Math.PI * 2,
  0,
  Math.PI * 0.57,
);
const nose = new T.BufferGeometry();
nose.setAttribute(
  "position",
  new T.Float32BufferAttribute(
    [
      -0.013, 0, 0, 0.013, 0, 0, 0, -0.026, 0.026, -0.013, 0, 0, 0, -0.026,
      0.026, -0.012, -0.035, 0.008, 0.013, 0, 0, 0.012, -0.035, 0.008, 0,
      -0.026, 0.026, -0.012, -0.035, 0.008, 0, -0.026, 0.026, 0.012, -0.035,
      0.008,
    ],
    3,
  ),
);
nose.computeVertexNormals();
const materialCache = new Map<number, T.MeshStandardMaterial>();
function coachwork(profile: number[][]) {
  const positions: number[] = [],
    indices: number[] = [],
    columns = 32,
    rows = (profile.length - 1) * 6;
  for (let j = 0; j <= rows; j++) {
    const t = (j / rows) * (profile.length - 1),
      i = Math.min(profile.length - 2, Math.floor(t)),
      f = t - i,
      a = profile[i],
      b = profile[i + 1],
      s = f * f * (3 - 2 * f);
    for (let k = 0; k <= columns; k++) {
      const angle = (k / columns) * Math.PI * 2,
        rx = T.MathUtils.lerp(a[1], b[1], s),
        ry = T.MathUtils.lerp(a[2], b[2], s),
        center = T.MathUtils.lerp(a[3], b[3], s);
      positions.push(
        Math.sin(angle) * rx,
        Math.max(0.4, center + Math.cos(angle) * ry),
        T.MathUtils.lerp(a[0], b[0], f),
      );
    }
  }
  for (let j = 0; j < rows; j++)
    for (let k = 0; k < columns; k++) {
      const a = j * (columns + 1) + k,
        b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const carBody = coachwork([
  [-2.14, 0.01, 0.01, 0.65],
  [-2.08, 0.72, 0.13, 0.65],
  [-1.8, 0.85, 0.21, 0.67],
  [-1.2, 0.89, 0.25, 0.68],
  [0, 0.88, 0.27, 0.69],
  [1.2, 0.86, 0.22, 0.65],
  [1.82, 0.8, 0.16, 0.63],
  [2.1, 0.72, 0.11, 0.64],
  [2.15, 0.01, 0.01, 0.64],
]);
const carRoof = coachwork([
  [-1.34, 0.01, 0.01, 0.89],
  [-1.27, 0.68, 0.08, 0.98],
  [-0.92, 0.67, 0.2, 1.13],
  [-0.3, 0.66, 0.2, 1.14],
  [0.26, 0.64, 0.19, 1.13],
  [0.68, 0.67, 0.06, 0.93],
  [0.82, 0.01, 0.01, 0.87],
]);
export function actorMaterial(c: number) {
  let m = materialCache.get(c);
  if (!m) {
    m = new T.MeshStandardMaterial({ color: c, roughness: 0.78 });
    if (c === 0x29434a) {
      m.roughness = 0.13;
      m.metalness = 0.55;
    }
    if (
      [
        0x6f8587, 0xa25543, 0xc4bfae, 0x4a5967, 0x9b9276, 0x41776d, 0x446d87,
        0xa75d47,
      ].includes(c)
    ) {
      m.roughness = 0.29;
      m.metalness = 0.58;
    }
    materialCache.set(c, m);
  }
  return m;
}
function mesh(
  parent: T.Group,
  geometry: T.BufferGeometry,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  c: number,
  jointParent?: T.Mesh,
  hinge = false,
  anchor?: T.Group,
  detail = false,
) {
  const m = new T.Mesh(geometry, actorMaterial(c));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.userData.jointParent = jointParent;
  m.userData.jointHinge = hinge;
  m.userData.jointAnchor = anchor;
  m.userData.detail = detail;
  parent.add(m);
  return m;
}
export function createPerson(seed: string): Person {
  const r = new Random(seed),
    group = new T.Group(),
    hips: T.Group[] = [],
    knees: T.Group[] = [],
    ankles: T.Group[] = [],
    shoulders: T.Group[] = [],
    elbows: T.Group[] = [];
  const skin = r.pick([0xe0b597, 0xc99673, 0xa77555, 0x835b45, 0x654735]),
    hair = r.pick([0x2e2927, 0x49392d, 0x70614c, 0x9b8765, 0x5b5754]),
    shirt = r.pick([
      0x78928c, 0x606d84, 0xa77760, 0xb9b3a1, 0x414e59, 0x847e67, 0x8c6265,
    ]),
    pants = r.pick([0x4b5054, 0x656758, 0x384c61, 0x88745f]),
    shoe = 0x343635;
  const scale = r.range(0.93, 1.13),
    width = r.range(0.9, 1.1);
  group.scale.setScalar(scale);
  Object.assign(group.userData, { seed, skin, hair, shirt, pants, width });
  const spine = new T.Group();
  spine.position.y = 1.17;
  group.add(spine);
  const chest = mesh(spine, torso, 0, 0, 0, width, 1, 0.64, shirt);
  const pelvis = mesh(
    group,
    sphere,
    0,
    0.89,
    0,
    0.34 * width,
    0.24,
    0.23,
    pants,
    chest,
    false,
    spine,
  );
  mesh(spine, tube, 0, 0.28, 0, 0.085, 0.115, 0.085, skin, chest);
  const head = new T.Group();
  head.position.set(0, 0.335, 0);
  spine.add(head);
  const skull = mesh(
    head,
    headShape,
    0,
    0,
    0,
    r.range(0.93, 1.06),
    1,
    r.range(0.85, 0.96),
    skin,
    chest,
    true,
    head,
  );
  mesh(head, hairCap, 0, 0.14, -0.012, 0.218, 0.244, 0.205, hair, skull);
  const hairstyle = r.int(0, 5);
  group.userData.hairstyle = hairstyle;
  if (hairstyle === 1) {
    mesh(head, sphere, 0, 0.075, -0.095, 0.18, 0.28, 0.12, hair, skull);
  }
  if (hairstyle === 2) {
    mesh(head, sphere, 0, 0.16, -0.13, 0.09, 0.1, 0.12, hair, skull);
  }
  if (hairstyle === 3) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      mesh(
        head,
        sphere,
        Math.sin(a) * 0.065,
        0.225 + Math.cos(a) * 0.008,
        Math.cos(a) * 0.05,
        0.07,
        0.065,
        0.07,
        hair,
        skull,
      );
    }
  }
  if (hairstyle === 4)
    mesh(head, box, 0, 0.242, 0.015, 0.23, 0.04, 0.25, shirt, skull);
  for (const side of [-1, 1]) {
    mesh(
      head,
      sphere,
      side * 0.101,
      0.12,
      0,
      0.028,
      0.055,
      0.024,
      skin,
      skull,
      false,
      undefined,
      true,
    );
    mesh(
      head,
      sphere,
      side * 0.044,
      0.145,
      0.084,
      0.042,
      0.013,
      0.015,
      0xd9d5c4,
      skull,
      false,
      undefined,
      true,
    );
    mesh(
      head,
      sphere,
      side * 0.044,
      0.145,
      0.092,
      0.012,
      0.012,
      0.006,
      0x393b34,
      skull,
      false,
      undefined,
      true,
    );
    const brow = mesh(
      head,
      box,
      side * 0.045,
      0.163,
      0.08,
      0.044,
      0.008,
      0.011,
      hair,
      skull,
      false,
      undefined,
      true,
    );
    brow.rotation.z = side * r.range(-0.1, 0.1);
  }
  mesh(
    head,
    nose,
    0,
    0.145,
    0.083,
    1,
    1,
    1,
    skin,
    skull,
    false,
    undefined,
    true,
  );
  mesh(
    head,
    box,
    0,
    0.075,
    0.079,
    0.049,
    0.006,
    0.012,
    0x98695f,
    skull,
    false,
    undefined,
    true,
  );
  for (const side of [-1, 1]) {
    const hip = new T.Group();
    hip.position.set(side * 0.093, 0.89, 0);
    group.add(hip);
    const thigh = mesh(
      hip,
      thighShape,
      0,
      -0.215,
      0,
      0.17,
      0.43,
      0.19,
      pants,
      pelvis,
      true,
      hip,
    );
    const knee = new T.Group();
    knee.position.y = -0.43;
    hip.add(knee);
    mesh(knee, sphere, 0, 0, 0, 0.112, 0.095, 0.12, pants, thigh);
    const shin = mesh(
      knee,
      shinShape,
      0,
      -0.205,
      0,
      0.14,
      0.41,
      0.15,
      pants,
      thigh,
      true,
      knee,
    );
    const ankle = new T.Group();
    ankle.position.y = -0.41;
    knee.add(ankle);
    mesh(
      ankle,
      box,
      0,
      -0.02,
      0.055,
      0.115,
      0.075,
      0.255,
      shoe,
      shin,
      false,
      ankle,
    );
    hips.push(hip);
    knees.push(knee);
    ankles.push(ankle);
    const shoulder = new T.Group();
    shoulder.position.set(side * 0.205 * width, 0.18, 0);
    spine.add(shoulder);
    const upper = mesh(
      shoulder,
      armShape,
      0,
      -0.14,
      0,
      0.11,
      0.28,
      0.12,
      shirt,
      chest,
      true,
      shoulder,
    );
    const elbow = new T.Group();
    elbow.position.y = -0.28;
    shoulder.add(elbow);
    mesh(shoulder, sphere, 0, -0.015, 0, 0.108, 0.12, 0.108, shirt, chest);
    mesh(elbow, sphere, 0, 0, 0, 0.078, 0.09, 0.08, shirt, upper);
    const sleeve = mesh(
      elbow,
      armShape,
      0,
      -0.115,
      0,
      0.085,
      0.25,
      0.09,
      r.next() < 0.55 ? shirt : skin,
      upper,
      true,
      elbow,
    );
    const wrist = new T.Group();
    wrist.position.y = -0.25;
    elbow.add(wrist);
    const palm = mesh(
      wrist,
      sphere,
      0,
      -0.025,
      0.01,
      0.066,
      0.09,
      0.042,
      skin,
      sleeve,
      false,
      wrist,
    );
    for (let f = 0; f < 4; f++)
      mesh(
        wrist,
        capsule,
        (f - 1.5) * 0.013,
        -0.08,
        0.01,
        0.011,
        0.023,
        0.012,
        skin,
        palm,
        false,
        wrist,
        true,
      );
    mesh(
      wrist,
      capsule,
      -side * 0.039,
      -0.045,
      0.022,
      0.014,
      0.024,
      0.014,
      skin,
      palm,
      false,
      wrist,
      true,
    );
    shoulders.push(shoulder);
    elbows.push(elbow);
  }
  if (r.next() < 0.3) {
    mesh(
      spine,
      box,
      0,
      -0.01,
      -0.14,
      0.24,
      0.31,
      0.115,
      r.pick([0x6c6755, 0x895e4c, 0x4d6262]),
      chest,
    ).userData.accessory = true;
    for (const side of [-1, 1])
      mesh(
        spine,
        box,
        side * 0.12,
        0,
        0.06,
        0.018,
        0.34,
        0.024,
        0x454b45,
        chest,
      ).userData.accessory = true;
  }
  if (r.next() < 0.15) {
    const bag = mesh(
      group,
      box,
      0.24,
      0.55,
      0.025,
      0.19,
      0.25,
      0.09,
      0xb6a185,
      chest,
    );
    bag.userData.detail = false;
    bag.userData.carriedBag = true;
    bag.userData.accessory = true;
  }
  return {
    group,
    alive: true,
    hips,
    knees,
    ankles,
    shoulders,
    elbows,
    spine,
    head,
    phase: r.range(0, Math.PI * 2),
    speed: r.range(0.82, 1.48),
    progress: r.next(),
    direction: r.next() < 0.5 ? -1 : 1,
    pauseUntil: 0,
    scale,
  };
}
export function animatePerson(
  p: Person,
  dt: number,
  time: number,
  district: DistrictPlan,
  impact: T.Vector3 | null,
) {
  if (!p.alive) return;
  const lane = Math.sin(p.phase * 3.7) * 0.48;
  const x0 = district.x0 + 8.25 + lane,
    x1 = district.x1 - 8.25 - lane,
    z0 = district.z0 + 8.25 + lane,
    z1 = district.z1 - 8.25 - lane,
    w = x1 - x0,
    d = z1 - z0,
    perimeter = 2 * (w + d);
  const danger = impact && p.group.position.distanceTo(impact) < 24;
  let speed = danger ? p.speed * 2.5 : p.speed;
  const idling = !danger && Math.sin(time * 0.12 + p.phase) > 0.985;
  if (idling) speed = 0;
  p.progress = T.MathUtils.euclideanModulo(
    p.progress + (dt * speed * p.direction) / perimeter,
    1,
  );
  let s = p.progress * perimeter;
  let x: number, z: number, heading: number;
  if (s < w) {
    x = x0 + s;
    z = z0;
    heading = Math.PI / 2;
  } else if ((s -= w) < d) {
    x = x1;
    z = z0 + s;
    heading = 0;
  } else if ((s -= d) < w) {
    x = x1 - s;
    z = z1;
    heading = -Math.PI / 2;
  } else {
    s -= w;
    x = x0;
    z = z1 - s;
    heading = Math.PI;
  }
  p.group.position.set(x, 0.285, z);
  if (p.direction < 0) heading += Math.PI;
  posePerson(p, dt, time, speed, heading, !!danger);
}
export function posePerson(
  p: Person,
  dt: number,
  time: number,
  speed: number,
  heading: number,
  danger = false,
) {
  let delta =
    T.MathUtils.euclideanModulo(
      heading - p.group.rotation.y + Math.PI,
      Math.PI * 2,
    ) - Math.PI;
  p.group.rotation.y += delta * Math.min(1, dt * 7);
  const phase = time * (danger ? 9 : 6) * p.speed + p.phase,
    amplitude = speed ? 0.27 : 0;
  const bob = speed
    ? -0.025 * Math.abs(Math.sin(phase))
    : Math.sin(time * 1.8 + p.phase) * 0.002;
  p.spine.position.y = 1.17 + bob;
  for (let i = 0; i < 2; i++) {
    const t = phase + i * Math.PI,
      footZ = Math.sin(t) * amplitude,
      footY = 0.055 + Math.max(0, Math.cos(t)) * (speed ? 0.105 : 0),
      hipY = 0.89 + bob;
    p.hips[i].position.y = hipY;
    const dy = footY - hipY,
      len = Math.min(0.839, Math.hypot(dy, footZ)),
      knee =
        Math.PI -
        Math.acos(
          T.MathUtils.clamp(
            (0.43 * 0.43 + 0.41 * 0.41 - len * len) / (2 * 0.43 * 0.41),
            -1,
            1,
          ),
        );
    const hip =
      -Math.atan2(footZ, -dy) -
      Math.acos(
        T.MathUtils.clamp(
          (0.43 * 0.43 + len * len - 0.41 * 0.41) / (2 * 0.43 * len),
          -1,
          1,
        ),
      );
    p.hips[i].rotation.x = hip;
    p.knees[i].rotation.x = knee;
    p.ankles[i].rotation.x = -hip - knee;
    p.shoulders[i].rotation.x = Math.sin(t) * amplitude * 0.7;
    p.shoulders[i].rotation.z = (i === 0 ? 1 : -1) * 0.06;
    p.elbows[i].rotation.x =
      -0.2 - Math.max(0, -Math.sin(t)) * amplitude * 0.65;
  }
  p.spine.rotation.y = Math.sin(phase) * amplitude * 0.09;
  p.head.rotation.y = Math.sin(time * 0.7 + p.phase) * 0.16;
  p.head.rotation.x = Math.sin(time * 0.4 + p.phase) * 0.04;
}
export function createVehicle(seed: string): Vehicle {
  const r = new Random(seed),
    group = new T.Group(),
    c = r.pick([0x6f8587, 0xa25543, 0xc4bfae, 0x4a5967, 0x9b9276]);
  group.userData.vehicle = true;
  mesh(group, carBody, 0, 0, 0, 1, 1, 1, c);
  mesh(group, carRoof, 0, 0, 0, 1, 1, 1, c);
  mesh(group, box, 0, 1.08, 0.8, 1.4, 0.36, 0.05, 0x29434a).rotation.x = -0.3;
  mesh(group, box, 0, 1.08, -1.25, 1.4, 0.36, 0.05, 0x29434a).rotation.x = 0.25;
  if (r.next() < 0.2) {
    mesh(group, box, 0, 1.2, -0.6, 1.6, 1.2, 2.6, c);
  }
  for (const side of [-1, 1]) {
    for (const z of [-0.75, 0.24]) {
      mesh(group, box, side * 0.775, 1.08, z, 0.05, 0.35, 0.84, 0x29434a);
      mesh(
        group,
        box,
        side * 0.886,
        0.7,
        z - 0.12,
        0.025,
        0.04,
        0.18,
        0xb9b5a1,
      );
      mesh(
        group,
        box,
        side * 0.882,
        0.61,
        z + 0.46,
        0.02,
        0.36,
        0.018,
        0x343e41,
      );
    }
    mesh(group, box, side * 0.95, 1.02, 0.65, 0.21, 0.13, 0.23, c);
    for (const z of [-1.3, 1.3]) {
      const m = mesh(
        group,
        wheel,
        side * 0.9,
        0.32,
        z,
        0.66,
        0.19,
        0.66,
        0x252d2d,
      );
      m.rotation.z = Math.PI / 2;
      const hub = mesh(
        group,
        wheel,
        side * 1.005,
        0.32,
        z,
        0.37,
        0.02,
        0.37,
        0xb9b5a1,
      );
      hub.rotation.z = Math.PI / 2;
    }
    mesh(group, box, side * 0.59, 0.65, 2.07, 0.4, 0.16, 0.05, 0xf5ddb3);
    mesh(group, box, side * 0.59, 0.65, -2.07, 0.4, 0.16, 0.05, 0x9e3e2e);
  }
  mesh(group, box, 0, 0.48, 2.08, 1.6, 0.09, 0.07, 0x9da9a5);
  mesh(group, box, 0, 0.63, 2.09, 0.45, 0.17, 0.05, 0x354345);
  return {
    group,
    alive: true,
    progress: r.next(),
    speed: r.range(4, 8),
    axis: r.next() < 0.5 ? "x" : "z",
    dir: r.next() < 0.5 ? -1 : 1,
    lane: r.next(),
  };
}
export function createTram(seed: string): Vehicle {
  const group = new T.Group(),
    r = new Random(seed),
    c = r.pick([0x41776d, 0x446d87, 0xa75d47]);
  group.userData.vehicle = true;
  group.userData.tram = true;
  mesh(group, box, 0, 1.47, 0, 2.28, 1.94, 12.2, c);
  mesh(group, box, 0, 0.53, 0, 2.3, 0.35, 11.9, 0x344548);
  mesh(group, box, 0, 2.52, 0, 2.13, 0.18, 11.5, 0xd9d3bb);
  mesh(group, box, 0, 2.75, -1.8, 1.4, 0.36, 2.1, 0x7e8d8b);
  for (const sign of [-1, 1]) {
    mesh(
      group,
      box,
      0,
      1.97,
      sign * 5.95,
      1.94,
      0.91,
      0.08,
      0x29434a,
    ).rotation.x = sign * 0.12;
    mesh(group, box, 0, 0.95, sign * 6.08, 0.44, 0.15, 0.05, 0xf5ddb3);
    for (const side of [-1, 1]) {
      mesh(
        group,
        box,
        side * 0.85,
        0.96,
        sign * 6.06,
        0.26,
        0.15,
        0.06,
        0xf5ddb3,
      );
      mesh(group, box, side * 1.153, 1.22, 0, 0.035, 0.15, 11.6, 0xe1d8bd);
      for (let k = -4; k <= 4; k++)
        mesh(
          group,
          box,
          side * 1.152,
          1.98,
          k * 1.12,
          0.035,
          0.85,
          0.98,
          0x29434a,
        );
      for (const doorZ of [-3, 2.2]) {
        const door = mesh(
          group,
          box,
          side * 1.178,
          1.48,
          doorZ,
          0.045,
          1.91,
          0.94,
          0xc9c6b4,
        );
        door.userData.tramDoor = doorZ;
        mesh(
          group,
          box,
          side * 1.208,
          1.89,
          doorZ,
          0.028,
          0.84,
          0.69,
          0x29434a,
        ).userData.tramDoor = doorZ;
      }
    }
    for (const side of [-1, 1])
      for (const dz of [-0.42, 0.42]) {
        const m = mesh(
          group,
          wheel,
          side * 1,
          0.35,
          sign * 3.9 + dz,
          0.55,
          0.13,
          0.55,
          0x252d2d,
        );
        m.rotation.z = Math.PI / 2;
        m.userData.tramWheel = true;
      }
  }
  // Spring pantograph arms reach the original overhead contact wire.
  for (const side of [-1, 1]) {
    const a = mesh(
      group,
      tube,
      side * 0.42,
      3.67,
      0,
      0.035,
      1.8,
      0.035,
      0x354449,
    );
    a.rotation.x = 0.58;
    const b = mesh(
      group,
      tube,
      side * 0.42,
      4.9,
      0.45,
      0.035,
      1.8,
      0.035,
      0x354449,
    );
    b.rotation.x = -0.58;
  }
  mesh(group, box, 0, 5.43, 0, 1.3, 0.07, 0.17, 0x293638);
  return {
    group,
    alive: true,
    progress: 0,
    speed: 0,
    dir: 1,
    axis: "x",
    lane: 0,
    length: 12.3,
    width: 2.3,
    kind: "tram",
  };
}
const zero = new T.Matrix4().makeScale(0, 0, 0);
export class ActorRenderer {
  root = new T.Group();
  closeBudget = 16;
  private close = new Map<Person, HumanSurface>();
  private batches: {
    mesh: T.InstancedMesh;
    entries: { mesh: T.Mesh; actor: Actor }[];
  }[] = [];
  rebuild(actors: Actor[]) {
    this.clearBatches();
    for (const [p, s] of this.close)
      if (!actors.includes(p)) {
        s.dispose();
        this.close.delete(p);
      }
    const lists = new Map<string, { mesh: T.Mesh; actor: Actor }[]>();
    for (const actor of actors)
      actor.group.traverse((o) => {
        if (o instanceof T.Mesh) {
          const key =
            o.geometry.uuid +
            ":" +
            (o.material as T.Material).uuid +
            ":" +
            Boolean(o.userData.detail);
          if (!lists.has(key)) lists.set(key, []);
          lists.get(key)!.push({ mesh: o, actor });
        }
      });
    for (const entries of lists.values()) {
      const m = new T.InstancedMesh(
        entries[0].mesh.geometry,
        entries[0].mesh.material,
        entries.length,
      );
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = !entries[0].mesh.userData.detail;
      m.receiveShadow = true;
      this.root.add(m);
      this.batches.push({ mesh: m, entries });
    }
  }
  update(actors: Actor[], camera: T.Vector3) {
    for (const a of actors) if (a.alive) a.group.updateMatrixWorld(true);
    const nearest = actors
      .filter(
        (a): a is Person =>
          "hips" in a &&
          a.alive &&
          a.group.visible &&
          a.group.position.distanceTo(camera) <
            (this.close.has(a as Person) ? 24 : 20),
      )
      .sort(
        (a, b) =>
          a.group.position.distanceToSquared(camera) *
            (this.close.has(a) ? 0.85 : 1) -
          b.group.position.distanceToSquared(camera) *
            (this.close.has(b) ? 0.85 : 1),
      )
      .slice(0, this.closeBudget);
    for (const [p, s] of this.close)
      if (!nearest.includes(p)) {
        s.dispose();
        this.close.delete(p);
      }
    let generated = 0;
    for (const p of nearest) {
      let s = this.close.get(p);
      if (!s) {
        if (generated >= 1) continue;
        generated++;
        s = new HumanSurface(p);
        this.close.set(p, s);
        this.root.add(s.root);
      }
      s.update(p, performance.now() / 1000);
    }
    for (const batch of this.batches) {
      batch.entries.forEach((e, i) => {
        const distance = e.actor.group.position.distanceTo(camera);
        batch.mesh.setMatrixAt(
          i,
          e.actor.alive &&
            e.actor.group.visible &&
            (!this.close.has(e.actor as Person) || e.mesh.userData.accessory) &&
            distance < 180 &&
            (!e.mesh.userData.detail || distance < 14)
            ? e.mesh.matrixWorld
            : zero,
        );
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  private clearBatches() {
    for (const b of this.batches) b.mesh.dispose();
    for (const b of this.batches) b.mesh.removeFromParent();
    this.batches = [];
  }
  clear() {
    this.clearBatches();
    for (const s of this.close.values()) s.dispose();
    this.close.clear();
    this.root.clear();
  }
}
