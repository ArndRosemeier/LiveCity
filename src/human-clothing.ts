import * as T from "three";
import type { Surface, Weight } from "./human-surface";

// An original joined garment: implicit tailoring merges sleeves into the
// torso before meshing, so the shoulder is no longer a stack of intersecting
// solids. Shared edge vertices produce continuous deformation and normals.
export function tailoredShirt(
  surface: Surface,
  color: T.Color,
  width: number,
  female: boolean,
  root: number,
  spine: number,
  arms: number[][],
) {
  const smoothMin = (a: number, b: number, k: number) => {
    const h = Math.max(0, k - Math.abs(a - b)) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };
  const profile = [
    [0.94, 0.157, 0.113],
    [0.99, 0.157, 0.114],
    [1.07, 0.148, 0.104],
    [1.17, 0.169, 0.115],
    [1.27, 0.188, 0.123],
    [1.36, 0.197, 0.099],
    [1.42, 0.17, 0.065],
  ];
  function radius(y: number) {
    let i = 0;
    while (i < profile.length - 2 && y > profile[i + 1][0]) i++;
    const a = profile[i],
      b = profile[i + 1],
      t = T.MathUtils.smoothstep(y, a[0], b[0]);
    return [
      T.MathUtils.lerp(a[1], b[1], t) * width,
      T.MathUtils.lerp(a[2], b[2], t),
    ];
  }
  function fields(x: number, y: number, z: number) {
    const [rx, rz] = radius(y),
      chest = female ? 0.007 * Math.exp(-(((y - 1.26) / 0.065) ** 2)) : 0,
      sideFold =
        0.0013 *
        Math.sin(y * 97 + x * 33) *
        Math.exp(-(((y - 0.98) / 0.042) ** 2)),
      torso = Math.max(
        (Math.hypot(x / rx, (z - chest) / rz) - 1) * Math.min(rx, rz) -
          sideFold,
        0.945 - y,
        y - (1.419 - 0.1 * (Math.abs(x) / (0.22 * width)) ** 2),
      );
    const armFields = [-1, 1].map((side) => {
      const sx = side * 0.205 * width,
        yr = T.MathUtils.clamp((y - 0.85) / 0.5, 0, 1),
        dome = Math.sqrt(Math.max(0, 1 - (Math.max(0, y - 1.31) / 0.086) ** 2)),
        ar = Math.max(
          0.001,
          (0.029 + 0.043 * Math.sin(yr * Math.PI * 0.5)) * dome,
        ),
        center =
          sx +
          side * 0.01 * Math.sin(yr * Math.PI) -
          side * 0.024 * T.MathUtils.smoothstep(y, 1.3, 1.397),
        folds =
          0.0018 *
          Math.sin(y * 110 + z * 42) *
          Math.exp(-(((y - 1.075) / 0.05) ** 2));
      return Math.max(
        (Math.hypot((x - center) / ar, z / (ar * 1.07)) - 1) * ar - folds,
        0.85 - y,
        y - 1.397,
      );
    });
    return { torso, armFields };
  }
  const field = (x: number, y: number, z: number) => {
    const { torso, armFields } = fields(x, y, z);
    let d = smoothMin(
      torso,
      smoothMin(armFields[0], armFields[1], 0.014),
      0.028,
    );
    // Actual neck aperture, with a softly rolled cloth edge.
    const neck = Math.max(Math.hypot(x, z) - 0.06, 1.385 - y);
    d = Math.max(d, -neck);
    return d;
  };
  const step = 0.009,
    nx = 75,
    ny = 72,
    nz = 41,
    origin = new T.Vector3(-0.333, 0.825, -0.18),
    values = new Float32Array(nx * ny * nz),
    index = (x: number, y: number, z: number) => (z * ny + y) * nx + x,
    position = (id: number) => {
      const x = id % nx,
        y = Math.floor(id / nx) % ny,
        z = Math.floor(id / (nx * ny));
      return new T.Vector3(
        origin.x + x * step,
        origin.y + y * step,
        origin.z + z * step,
      );
    };
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++)
        values[index(x, y, z)] = field(
          origin.x + x * step,
          origin.y + y * step,
          origin.z + z * step,
        );
  const firstVertex = surface.positions.length / 3;
  const cache = new Map<number, number>(),
    start = surface.indices.length,
    count = nx * ny * nz;
  function vertex(a: number, b: number) {
    const lo = Math.min(a, b),
      hi = Math.max(a, b),
      key = lo * count + hi;
    const held = cache.get(key);
    if (held !== undefined) return held;
    const p = position(a).lerp(
        position(b),
        values[a] / (values[a] - values[b]),
      ),
      { torso, armFields } = fields(p.x, p.y, p.z),
      side = p.x < 0 ? 0 : 1,
      [shoulder, elbow] = arms[side];
    let weight: Weight;
    if (armFields[side] < torso + 0.012 && Math.abs(p.x) > 0.142 * width) {
      if (p.y < 1.28)
        weight = [elbow, shoulder, T.MathUtils.smoothstep(p.y, 1.0, 1.15)];
      else
        weight = [
          shoulder,
          spine,
          1 - T.MathUtils.smoothstep(torso - armFields[side], -0.025, 0.005),
        ];
    } else weight = [root, spine, T.MathUtils.smoothstep(p.y, 0.94, 1.08)];
    const seam =
        Math.exp(-(((Math.abs(p.x) - 0.155 * width) / 0.002) ** 2)) *
        Math.exp(-(((p.y - 1.12) / 0.17) ** 2)),
      tint = color.clone().multiplyScalar(1 - seam * 0.07),
      id = surface.vertex(
        p,
        tint,
        weight,
        (Math.atan2(p.x, p.z) / (Math.PI * 2)) * 8,
        p.y * 12,
      );
    cache.set(key, id);
    return id;
  }
  const corners = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    tetrahedra = [
      [0, 5, 1, 6],
      [0, 1, 2, 6],
      [0, 2, 3, 6],
      [0, 3, 7, 6],
      [0, 7, 4, 6],
      [0, 4, 5, 6],
    ];
  function triangle(a: number, b: number, c: number, out: T.Vector3) {
    const pa = new T.Vector3().fromArray(surface.positions, a * 3),
      pb = new T.Vector3().fromArray(surface.positions, b * 3),
      pc = new T.Vector3().fromArray(surface.positions, c * 3);
    if (pb.sub(pa).cross(pc.sub(pa)).dot(out) < 0)
      surface.indices.push(a, c, b);
    else surface.indices.push(a, b, c);
  }
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        const ids = corners.map((c) => index(x + c[0], y + c[1], z + c[2]));
        if (ids.every((i) => values[i] >= 0) || ids.every((i) => values[i] < 0))
          continue;
        for (const tet of tetrahedra) {
          const inside = tet.map((i) => ids[i]).filter((i) => values[i] < 0),
            outside = tet.map((i) => ids[i]).filter((i) => values[i] >= 0);
          if (!inside.length || !outside.length) continue;
          const out = outside
            .reduce((p, i) => p.add(position(i)), new T.Vector3())
            .multiplyScalar(1 / outside.length)
            .sub(
              inside
                .reduce((p, i) => p.add(position(i)), new T.Vector3())
                .multiplyScalar(1 / inside.length),
            );
          if (inside.length === 1)
            triangle(
              vertex(inside[0], outside[0]),
              vertex(inside[0], outside[1]),
              vertex(inside[0], outside[2]),
              out,
            );
          else if (inside.length === 3)
            triangle(
              vertex(outside[0], inside[0]),
              vertex(outside[0], inside[1]),
              vertex(outside[0], inside[2]),
              out,
            );
          else {
            const a = vertex(inside[0], outside[0]),
              b = vertex(inside[0], outside[1]),
              c = vertex(inside[1], outside[0]),
              d = vertex(inside[1], outside[1]);
            triangle(a, b, c, out);
            triangle(b, d, c, out);
          }
        }
      }
  const adjacency = Array.from(
    { length: surface.positions.length / 3 - firstVertex },
    () => new Set<number>(),
  );
  for (let i = start; i < surface.indices.length; i += 3) {
    const tri = surface.indices.slice(i, i + 3);
    for (const a of tri)
      for (const b of tri) if (a !== b) adjacency[a - firstVertex].add(b);
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = surface.positions.slice();
    adjacency.forEach((neighbors, local) => {
      const id = firstVertex + local;
      if (!neighbors.size) return;
      for (let axis = 0; axis < 3; axis++) {
        let sum = 0;
        for (const n of neighbors) sum += surface.positions[n * 3 + axis];
        next[id * 3 + axis] = T.MathUtils.lerp(
          surface.positions[id * 3 + axis],
          sum / neighbors.size,
          0.32,
        );
      }
    });
    for (let i = firstVertex * 3; i < next.length; i++)
      surface.positions[i] = next[i];
  }
  surface.groups.push({
    start,
    count: surface.indices.length - start,
    materialIndex: 1,
  });
  return (x: number, y: number) => {
    let outside = 0.18,
      inside = 0.18;
    while (inside > 0 && field(x, y, inside) >= 0) inside -= 0.004;
    if (inside <= 0) return 0.03;
    outside = inside + 0.004;
    for (let i = 0; i < 12; i++) {
      const mid = (inside + outside) / 2;
      if (field(x, y, mid) < 0) inside = mid;
      else outside = mid;
    }
    return (inside + outside) / 2;
  };
}
