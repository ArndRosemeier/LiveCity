import * as T from "three";
import type { Surface } from "./human-surface";
import { Random } from "./random";

// Original landmark sculpt in meters, chin to crown. Cross sections describe
// jaw planes, cheek bones, temples and cranium rather than an ellipsoid.
const sections = [
  [0, 0.02, 0.057, -0.038],
  [0.012, 0.043, 0.067, -0.055],
  [0.032, 0.063, 0.067, -0.076],
  [0.055, 0.073, 0.069, -0.089],
  [0.079, 0.075, 0.065, -0.1],
  [0.101, 0.081, 0.059, -0.107],
  [0.128, 0.081, 0.062, -0.111],
  [0.153, 0.079, 0.071, -0.11],
  [0.182, 0.075, 0.072, -0.105],
  [0.211, 0.063, 0.061, -0.091],
  [0.235, 0.045, 0.034, -0.073],
  [0.249, 0.021, -0.005, -0.047],
  [0.254, 0.001, -0.025, -0.025],
];
const gaussian = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
const hash = (x: number, y: number, seed: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
};
export function sculptHead(
  surface: Surface,
  seed: string,
  skin: T.Color,
  hair: T.Color,
  shirt: T.Color,
  head: number,
  style: number,
  female = false,
) {
  const portraitStart = surface.positions.length / 3;
  const groupStart = surface.groups.length;
  const identity =
    (female ? 0 : 2) + (new Random(seed + "/face-plate").next() < 0.5 ? 0 : 1);
  const r = new Random(seed + "/portrait"),
    base = 1.475,
    broad = r.range(0.94, 1.05),
    jaw = r.range(0.93, 1.06) * (female ? 0.96 : 1.02),
    eyeSpace = r.range(0.97, 1.04),
    noseWidth = r.range(0.91, 1.07) * (female ? 0.94 : 1.02),
    age = r.range(0.12, 0.9),
    phase = r.range(0, 90),
    eyeX = 0.031 * eyeSpace,
    eyeY = 0.128,
    eyeZ = 0.0415,
    lipWidth = r.range(0.024, 0.027),
    nose = r.range(0.027, 0.033),
    fixed = () => [head, head, 0] as [number, number, number],
    stubble = !female && r.next() < 0.45;
  function section(y: number) {
    let index = 0;
    while (index < sections.length - 2 && y > sections[index + 1][0]) index++;
    const a = sections[Math.max(0, index - 1)],
      b = sections[index],
      c = sections[index + 1],
      d = sections[Math.min(sections.length - 1, index + 2)],
      t = T.MathUtils.clamp((y - b[0]) / (c[0] - b[0]), 0, 1);
    const value = (k: number) =>
      0.5 *
      (2 * b[k] +
        (-a[k] + c[k]) * t +
        (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
        (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t);
    return [
      Math.max(0.001, value(1)) *
        broad *
        T.MathUtils.lerp(jaw, 1, T.MathUtils.smoothstep(y, 0.02, 0.11)),
      value(2),
      value(3),
    ];
  }
  function faceZ(x: number, y: number) {
    const [width, front, back] = section(y),
      q = Math.min(1, Math.abs(x) / width),
      plane = Math.sqrt(Math.max(0, 1 - q * q)),
      center = (front + back) / 2;
    const baseline = center + (front - center) * plane;
    let z = baseline;
    // Glabella, bridge, narrow alar wings, tip and philtrum form a joined nose.
    z += 0.009 * gaussian(x, y, 0, 0.15, 0.012, 0.019);
    z += nose * 0.78 * gaussian(x, y, 0, 0.121, 0.01 * noseWidth, 0.027);
    z += nose * gaussian(x, y, 0, 0.097, 0.013 * noseWidth, 0.011);
    z +=
      0.014 *
      (gaussian(x, y, -0.013 * noseWidth, 0.09, 0.007, 0.008) +
        gaussian(x, y, 0.013 * noseWidth, 0.09, 0.007, 0.008));
    z -= 0.0035 * gaussian(x, y, 0, 0.077, 0.004, 0.01);
    for (const side of [-1, 1]) {
      z -= 0.008 * gaussian(x, y, side * eyeX, eyeY, 0.019, 0.012);
      z -= 0.004 * gaussian(x, y, side * eyeX, 0.112, 0.02, 0.007);
      z += 0.007 * gaussian(x, y, side * 0.044, 0.099, 0.024, 0.017);
      z += 0.006 * gaussian(x, y, side * eyeX, 0.15, 0.025, 0.009);
      z -= 0.003 * age * gaussian(x, y, side * 0.026, 0.073, 0.004, 0.022);
    }
    z += 0.007 * gaussian(x, y, 0, 0.056, 0.03, 0.013);
    z += 0.005 * gaussian(x, y, 0, 0.019, 0.027, 0.013);
    // Fine forehead, lower eyelid and nasolabial relief stays sub-millimeter.
    z -=
      age *
      0.00065 *
      Math.exp(-((x / 0.056) ** 6)) *
      (gaussian(x, y, 0, 0.174, 0.09, 0.0009) +
        gaussian(x, y, 0, 0.184, 0.09, 0.001) +
        gaussian(x, y, 0, 0.195, 0.09, 0.001));
    return T.MathUtils.lerp(
      baseline,
      z,
      T.MathUtils.smoothstep(1 - q, 0, 0.12),
    );
  }
  function faceColor(x: number, y: number, z: number) {
    const front = T.MathUtils.smoothstep(z, -0.005, 0.04),
      c = skin.clone();
    const cheek =
      (gaussian(x, y, -0.05, 0.091, 0.024, 0.025) +
        gaussian(x, y, 0.05, 0.091, 0.024, 0.025)) *
      0.15;
    const noseFlush = gaussian(x, y, 0, 0.094, 0.025, 0.026) * 0.11;
    c.lerp(new T.Color(0xb26860), front * (cheek + noseFlush));
    const socket =
      gaussian(x, y, -eyeX, 0.114, 0.022, 0.008) +
      gaussian(x, y, eyeX, 0.114, 0.022, 0.008);
    c.multiplyScalar(1 - socket * (0.045 + age * 0.035));
    const mottling =
      Math.sin(x * 680 + phase) * Math.sin(y * 523 - phase) +
      Math.sin(x * 190 + y * 340);
    c.multiplyScalar(1 + mottling * 0.012);
    const freckle = hash(Math.floor(x * 1850), Math.floor(y * 1850), phase);
    if (freckle > 0.995 && y > 0.075 && y < 0.165 && front > 0.5)
      c.multiplyScalar(0.85);
    if (
      stubble &&
      y < 0.078 &&
      (Math.abs(x) > 0.032 || y < 0.045 || y > 0.07)
    ) {
      const beard = front * T.MathUtils.smoothstep(0.082 - y, 0, 0.026);
      c.lerp(
        hair,
        beard *
          (0.12 +
            0.13 * hash(Math.floor(x * 3000), Math.floor(y * 3000), phase)),
      );
    }
    return c;
  }
  function aperture(x: number, y: number) {
    for (const side of [-1, 1]) {
      const q = (x - side * eyeX) / 0.0145,
        center = eyeY + side * q * 0.0015;
      if (
        Math.abs(q) < 1 &&
        Math.abs(y - center) < Math.sin(((q + 1) * Math.PI) / 2) * 0.0046
      )
        return true;
    }
    return false;
  }
  function cranialPoint(a: number, y: number) {
    const [rx, front, back] = section(y),
      x = Math.sin(a) * rx,
      f = Math.cos(a);
    return new T.Vector3(
      x,
      base + y,
      f >= 0 ? faceZ(x, y) : (front + back) / 2 + ((front - back) * f) / 2,
    );
  }
  surface.patch(
    150,
    192,
    (u, v) => {
      const y = 0.254 * (1 - v),
        a = u * Math.PI * 2,
        [rx, front, back] = section(y),
        x = Math.sin(a) * rx,
        f = Math.cos(a);
      const z =
        f >= 0 ? faceZ(x, y) : 0.5 * (front + back) + 0.5 * (front - back) * f;
      return new T.Vector3(x, base + y, z);
    },
    (u, v) => {
      const y = 0.254 * (1 - v),
        a = u * Math.PI * 2,
        x = Math.sin(a) * section(y)[0];
      return faceColor(x, y, Math.cos(a) > 0.1 ? 0.05 : -0.05);
    },
    fixed,
    0,
    undefined,
    (p) => p.z < 0.025 || !aperture(p.x, p.y - base),
  );
  const iris = new T.Color(
    [0x625738, 0x392b20, 0x493124, 0x526a76][identity],
  ).multiplyScalar(r.range(0.85, 1.1));
  for (const side of [-1, 1]) {
    const cx = side * eyeX,
      cy = base + eyeY;
    const eyePoint = (u: number, v: number) => {
      const q = 2 * u - 1,
        x = q * 0.0146,
        y = (2 * v - 1) * Math.sin(Math.PI * u) * 0.0047 + side * q * 0.0015;
      return new T.Vector3(
        cx + x,
        cy + y,
        eyeZ + Math.sqrt(Math.max(0.000005, 0.0154 ** 2 - x * x - y * y)),
      );
    };
    surface.frontPatch(
      18,
      40,
      eyePoint,
      (u, v) => {
        const edge = Math.abs(2 * u - 1) ** 6;
        return new T.Color(0xc0bbaf).lerp(new T.Color(0xb47d77), edge * 0.42);
      },
      fixed,
      3,
      { center: cy, amount: 0.995 },
    );
    // Radial iris detail is geometry color, under a smooth wet corneal surface.
    surface.frontPatch(
      18,
      80,
      (u, v) => {
        const angle = u * Math.PI * 2,
          radius = 0.0062 * v,
          x = Math.cos(angle) * radius,
          y = Math.sin(angle) * radius;
        return new T.Vector3(
          cx + x,
          cy + y,
          eyeZ + Math.sqrt(0.0154 ** 2 - x * x - y * y) + 0.00012,
        );
      },
      (u, v) => {
        const ray =
            0.5 +
            0.5 *
              Math.sin(
                u * 2 * Math.PI * 67 + Math.sin(u * 2 * Math.PI * 19) * 3,
              ),
          ring = T.MathUtils.smoothstep(v, 0.72, 1),
          pupil = 1 - T.MathUtils.smoothstep(v, 0.39, 0.46);
        return iris
          .clone()
          .multiplyScalar(0.65 + ray * 0.65)
          .lerp(new T.Color(0x1a1713), ring * 0.75 + pupil * (1 - ring * 0.75));
      },
      fixed,
      3,
      { center: cy, amount: 0.995 },
    );
    for (const upper of [false, true]) {
      const lidPoint = (u: number, v: number) => {
        const q = 2 * u - 1,
          x = cx + q * 0.0148,
          edge =
            cy +
            side * q * 0.0015 +
            Math.sin(Math.PI * u) * (upper ? 0.0048 : -0.0048),
          outer =
            edge +
            (upper ? 1 : -1) * (0.008 * Math.sin(Math.PI * u) + 0.002) * v,
          innerZ = eyePoint(u, upper ? 1 : 0).z + 0.0004,
          z = T.MathUtils.lerp(innerZ, faceZ(x, outer - base) + 0.0002, v);
        return new T.Vector3(x, outer, z);
      };
      surface.frontPatch(
        10,
        48,
        lidPoint,
        (u, v) => skin.clone().lerp(new T.Color(0xb3756b), 0.09 * (1 - v)),
        fixed,
        0,
        undefined,
        undefined,
        (p, u, v) => {
          const closed = cy + side * (2 * u - 1) * 0.0015;
          return new T.Vector3(
            p.x,
            T.MathUtils.lerp(closed, p.y, v),
            p.z + (1 - v) * 0.0012,
          );
        },
      );
      // Tear line follows the aperture and moves with the eyelid, never floats.
      surface.frontPatch(
        2,
        48,
        (u, v) => {
          const p = lidPoint(u, 0);
          p.y += (upper ? -1 : 1) * v * 0.0005;
          p.z += 0.00035;
          return p;
        },
        () => skin.clone().lerp(new T.Color(0xb57167), 0.28),
        fixed,
        3,
        undefined,
        undefined,
        (p, u) =>
          new T.Vector3(p.x, cy + side * (2 * u - 1) * 0.0015, p.z + 0.0012),
      );
      for (let n = 0; n < (upper ? 28 : 16); n++) {
        const u = (n + 0.5) / (upper ? 28 : 16),
          start = lidPoint(u, 0),
          length = (upper ? 0.0045 : 0.0025) * Math.sin(Math.PI * u);
        surface.frontPatch(
          4,
          1,
          (s, t) =>
            new T.Vector3(
              start.x + (t - 0.5) * 0.00024 + side * s * 0.001,
              start.y + (upper ? 1 : -1) * s * length,
              start.z + 0.001 * s,
            ),
          () => hair.clone().multiplyScalar(0.7),
          fixed,
          4,
          undefined,
          undefined,
          (p) => new T.Vector3(p.x, p.y + (cy - start.y), p.z),
        );
      }
    }
    // Individual brow strokes avoid opaque strips across the face.
    for (let n = 0; n < 70; n++) {
      const t = n / 69,
        x = cx + side * (t - 0.48) * 0.034,
        y =
          base +
          0.15 +
          Math.sin(t * Math.PI) * 0.004 +
          r.range(-0.0014, 0.0014),
        z = faceZ(x, y - base) + 0.0005;
      surface.frontPatch(
        3,
        1,
        (u, v) =>
          new T.Vector3(
            x + (v - 0.5) * 0.00032 + side * u * 0.0015,
            y + u * 0.0026,
            z + 0.0005 * Math.sin(u * Math.PI),
          ),
        () => hair.clone().multiplyScalar(r.range(0.7, 1.08)),
        fixed,
        4,
      );
    }
    // Ear helix, concha and tragus are sculpted as a single folded surface.
    const earStart = surface.indices.length;
    surface.patch(
      36,
      48,
      (u, v) => {
        const angle = u * Math.PI * 2,
          radius = v,
          fold =
            0.006 * Math.exp(-(((v - 0.8) / 0.14) ** 2)) -
            0.003 * Math.exp(-(((v - 0.42) / 0.18) ** 2)),
          x = side * (0.086 * broad + 0.01 * radius + fold),
          y = base + 0.117 + Math.cos(angle) * 0.028 * radius,
          z = -0.019 + Math.sin(angle) * 0.013 * radius;
        return new T.Vector3(x, y, z);
      },
      (u, v) =>
        skin
          .clone()
          .lerp(new T.Color(0xb9665c), 0.17)
          .multiplyScalar(0.85 + 0.15 * v),
      fixed,
      0,
    );
    if (side < 0)
      for (let i = earStart; i < surface.indices.length; i += 3) {
        const a = surface.indices[i];
        surface.indices[i] = surface.indices[i + 1];
        surface.indices[i + 1] = a;
      }
    surface.ellipsoid(
      new T.Vector3(side * 0.093 * broad, base + 0.109, -0.007),
      new T.Vector3(0.004, 0.006, 0.004),
      skin,
      head,
      0,
      12,
      16,
    );
    surface.ellipsoid(
      new T.Vector3(
        side * 0.0105 * noseWidth,
        base + 0.087,
        faceZ(side * 0.0105 * noseWidth, 0.087) + 0.0004,
      ),
      new T.Vector3(0.0034, 0.0017, 0.0009),
      skin.clone().multiplyScalar(0.24),
      head,
      0,
      8,
      16,
    );
  }
  // A joined vermilion border, cupid's bow, philtrum and recessed oral slit.
  const mouthY = base + 0.057;
  for (const upper of [false, true]) {
    surface.frontPatch(
      12,
      64,
      (u, v) => {
        const x = (2 * u - 1) * lipWidth,
          curve = Math.sin(Math.PI * u),
          bow = upper
            ? 0.0026 + 0.0018 * Math.abs(Math.sin(u * Math.PI * 2))
            : -0.005,
          y = mouthY + curve * bow * v,
          z = faceZ(x, y - base) + 0.0018 * curve * Math.sin(v * Math.PI);
        return new T.Vector3(x, y, z);
      },
      (u, v) =>
        skin
          .clone()
          .lerp(new T.Color(0x995e5a), 0.3)
          .multiplyScalar(0.94 + 0.06 * Math.sin(v * Math.PI)),
      fixed,
      0,
    );
  }
  surface.frontPatch(
    2,
    64,
    (u, v) => {
      const x = (2 * u - 1) * lipWidth * 0.99,
        y = mouthY + (v - 0.5) * 0.0007 * Math.sin(u * Math.PI);
      return new T.Vector3(x, y, faceZ(x, y - base) + 0.0005);
    },
    () => skin.clone().multiplyScalar(0.28),
    fixed,
    0,
  );
  // Scalp follows the same skull, with a receding/nonuniform hairline and roots.
  const long = style === 1,
    limitAt = (a: number) =>
      1.97 - Math.max(0, Math.cos(a)) * 0.88 + age * 0.07 * Math.sin(a) ** 2,
    scalp = (a: number, v: number, offset = 0) => {
      const t = v * limitAt(a),
        y = T.MathUtils.clamp(0.13 + Math.cos(t) * 0.127, 0.001, 0.253),
        p = cranialPoint(a, y),
        across = cranialPoint(a + 0.003, y).sub(cranialPoint(a - 0.003, y)),
        vertical = cranialPoint(a, Math.min(0.253, y + 0.0003)).sub(
          cranialPoint(a, Math.max(0.001, y - 0.0003)),
        ),
        normal = across.cross(vertical).normalize();
      p.addScaledVector(normal, 0.003 + offset);
      if (long) p.y -= Math.max(0, -Math.cos(a)) * v ** 7 * 0.09;
      return p;
    };
  surface.patch(
    96,
    192,
    (u, v) => scalp(u * Math.PI * 2, v),
    (u, v) =>
      hair.clone().multiplyScalar(0.52 + 0.1 * Math.sin(u * 925 + v * 97) ** 2),
    fixed,
    4,
  );
  // Directional tapering locks: opaque ribbons share one draw call and no alpha sorting.
  const strands = style === 3 ? 2600 : 2200;
  for (let n = 0; n < strands; n++) {
    const a = r.range(0, Math.PI * 2),
      start = r.range(0.07, 0.93),
      curl = style === 3 ? r.range(0.01, 0.035) : r.range(-0.004, 0.004),
      length = r.range(0.08, 0.24),
      color = hair.clone().multiplyScalar(r.range(0.65, 1.12));
    surface.frontPatch(
      1,
      8,
      (u, v) => {
        const t = Math.min(1, start + u * length),
          flow = a + u * 0.17 + Math.sin(u * Math.PI * 3) * curl,
          p = scalp(flow, t, 0.0014 + Math.sin(u * Math.PI) * 0.0025),
          width = (1 - u) * 0.00019;
        p.x += (v - 0.5) * width * Math.cos(flow);
        p.z -= (v - 0.5) * width * Math.sin(flow);
        return p;
      },
      () => color,
      fixed,
      4,
    );
  }
  if (style === 4) {
    surface.rings(
      0,
      -0.018,
      [
        [base + 0.219, 0.084, 0.082],
        [base + 0.263, 0.08, 0.083],
        [base + 0.285, 0.051, 0.049],
        [base + 0.29, 0.001, 0.001],
      ],
      shirt,
      fixed,
      1,
      0.0008,
      40,
    );
    surface.ellipsoid(
      new T.Vector3(0, base + 0.225, 0.07),
      new T.Vector3(0.091, 0.005, 0.059),
      shirt,
      head,
      1,
      10,
      32,
    );
  }
  if (style === 2)
    surface.ellipsoid(
      new T.Vector3(0, base + 0.164, -0.133),
      new T.Vector3(0.037, 0.04, 0.033),
      hair,
      head,
      4,
      24,
      32,
    );
  surface.vertex(new T.Vector3(0, base + 0.254, -0.025), skin, fixed(), 0, 0);
  // Landmark-warped original photographic pigment on the anatomical sculpt.
  // Texture coordinates stay in the bind pose when the face turns or blinks.
  // Eyes and hair retain their own geometry/material, never a painted eyeball.
  const eyeLine = [0.43, 0.424, 0.403, 0.415][identity];
  const mouthLine = [0.698, 0.695, 0.685, 0.68][identity];
  const anchors = [
    [0, 0.861],
    [0.056, mouthLine],
    [0.09, 0.59],
    [0.128, eyeLine],
    [0.153, eyeLine - 0.08],
    [0.2, 0.18],
    [0.254, 0.01],
  ];
  const pigmentVertices = new Set<number>();
  for (const group of surface.groups.slice(groupStart)) {
    if (group.materialIndex !== 0) continue;
    for (let i = group.start; i < group.start + group.count; i++)
      pigmentVertices.add(surface.indices[i]);
  }
  for (const i of pigmentVertices) {
    if (i < portraitStart) continue;
    const x = surface.positions[i * 3],
      y = surface.positions[i * 3 + 1] - base,
      z = surface.positions[i * 3 + 2];
    let n = 0;
    while (n < anchors.length - 2 && y > anchors[n + 1][0]) n++;
    const a = anchors[n],
      b = anchors[n + 1];
    const imageY = T.MathUtils.lerp(
      a[1],
      b[1],
      T.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1),
    );
    // Compress the outer projection: a planar photograph has a narrower jaw
    // silhouette than the wrapped surface. Never sample its white background.
    let imageX =
      0.5 +
      (Math.tanh(x / (eyeX * 1.7)) / Math.tanh(1 / 1.7)) *
        0.12 *
        T.MathUtils.lerp(0.65, 1, T.MathUtils.smoothstep(y, 0.012, 0.07));
    let blend =
      T.MathUtils.smoothstep(z, 0.018, 0.048) *
      (1 - T.MathUtils.smoothstep(Math.abs(x), 0.058, 0.073)) *
      T.MathUtils.smoothstep(y, 0.004, 0.022) *
      (1 - T.MathUtils.smoothstep(y, 0.181, 0.205));
    let mappedY = imageY;
    if (Math.abs(x) > 0.075 * broad && z < 0.01 && y > 0.083 && y < 0.151) {
      imageX = 0.5 + Math.sign(x) * (0.27 - ((z + 0.019) / 0.013) * 0.017);
      mappedY = eyeLine + 0.08 - ((y - 0.117) / 0.028) * 0.105;
      blend = 0.9;
    }
    surface.portrait.splice(i * 4, 4, imageX, mappedY, blend, identity);
  }
  return { age, eyeSpace, jaw, broad, base };
}
