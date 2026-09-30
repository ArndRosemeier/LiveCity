import * as T from "three";
import { Random } from "./random";
import type { Person } from "./inhabitants";

// Original parametric anatomy. These surfaces are built in the rig's bind pose,
// then blended across joints rather than rendered as rigid limb primitives.
type Weight = [number, number, number];
type Profile = [number, number, number, number?];
const materials: T.MeshStandardMaterial[] = [];
function humanMaterials() {
  if (materials.length) return materials;
  const size = 128,
    cloth = new Uint8Array(size * size * 4),
    skin = new Uint8Array(size * size * 4),
    r = new Random("woven-cloth-and-skin");
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        c = 185 + ((x + y) % 2) * 35 + r.int(-10, 10),
        s = 235 + r.int(-13, 13);
      cloth[i] = cloth[i + 1] = cloth[i + 2] = c;
      cloth[i + 3] = 255;
      skin[i] = skin[i + 1] = skin[i + 2] = s;
      skin[i + 3] = 255;
    }
  const map = (data: Uint8Array) => {
    const t = new T.DataTexture(data, size, size);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const fabric = map(cloth),
    pores = map(skin);
  materials.push(
    new T.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.48,
      bumpMap: pores,
      bumpScale: 0.00045,
      specularIntensity: 0.32,
      clearcoat: 0.08,
      clearcoatRoughness: 0.65,
    }),
    new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      bumpMap: fabric,
      bumpScale: 0.0008,
    }),
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.56 }),
    new T.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.17,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      specularIntensity: 0.65,
    }),
  );
  return materials;
}
class Surface {
  positions: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  joints: number[] = [];
  weights: number[] = [];
  uv: number[] = [];
  groups: { start: number; count: number; materialIndex: number }[] = [];
  blinkVertices: { i: number; center: number; amount: number }[] = [];
  vertex(p: T.Vector3, c: T.Color, w: Weight, u: number, v: number) {
    const i = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z);
    this.colors.push(c.r, c.g, c.b);
    this.joints.push(w[0], w[1], 0, 0);
    this.weights.push(1 - w[2], w[2], 0, 0);
    this.uv.push(u, v);
    return i;
  }
  patch(
    rows: number,
    columns: number,
    point: (u: number, v: number) => T.Vector3,
    color: (u: number, v: number) => T.Color,
    weight: (u: number, v: number) => Weight,
    material: number,
    blink?: { center: number; amount: number },
  ) {
    const first = this.positions.length / 3,
      start = this.indices.length;
    for (let y = 0; y <= rows; y++)
      for (let x = 0; x <= columns; x++) {
        const u = x / columns,
          v = y / rows,
          i = this.vertex(point(u, v), color(u, v), weight(u, v), u * 8, v * 8);
        if (blink)
          this.blinkVertices.push({
            i,
            center: blink.center,
            amount: blink.amount,
          });
      }
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const a = first + y * (columns + 1) + x,
          b = a + columns + 1;
        this.indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    this.groups.push({
      start,
      count: this.indices.length - start,
      materialIndex: material,
    });
  }
  ellipsoid(
    center: T.Vector3,
    size: T.Vector3,
    c: T.Color,
    bone: number,
    material: number,
    rows = 12,
    columns = 20,
    blink?: { center: number; amount: number },
  ) {
    this.patch(
      rows,
      columns,
      (u, v) => {
        const a = u * Math.PI * 2,
          p = v * Math.PI;
        return new T.Vector3(
          center.x + Math.sin(p) * Math.sin(a) * size.x,
          center.y + Math.cos(p) * size.y,
          center.z + Math.sin(p) * Math.cos(a) * size.z,
        );
      },
      () => c,
      () => [bone, bone, 0],
      material,
      blink,
    );
  }
  rings(
    cx: number,
    cz: number,
    profile: Profile[],
    color: T.Color,
    weight: (y: number) => Weight,
    material: number,
    folds = 0,
    columns = 28,
    bend: (y: number) => number = () => 0,
  ) {
    const rows = (profile.length - 1) * 5;
    const start = this.indices.length;
    const firstRing = this.positions.length / 3;
    this.patch(
      rows,
      columns,
      (u, v) => {
        const t = v * (profile.length - 1),
          i = Math.min(profile.length - 2, Math.floor(t)),
          f = t - i;
        const p = profile[i],
          q = profile[i + 1],
          smooth = f * f * (3 - 2 * f),
          y = T.MathUtils.lerp(p[0], q[0], f),
          a = u * Math.PI * 2;
        const rx = T.MathUtils.lerp(p[1], q[1], smooth),
          rz = T.MathUtils.lerp(p[2], q[2], smooth),
          z = T.MathUtils.lerp(p[3] || 0, q[3] || 0, smooth);
        const wrinkle =
          folds *
          (Math.sin(y * 66 + a * 3) * 0.5 + Math.sin(y * 104 - a * 5) * 0.25) *
          Math.sin(Math.PI * v);
        return new T.Vector3(
          cx + bend(y) + Math.sin(a) * (rx + wrinkle),
          y,
          cz + z + Math.cos(a) * (rz + wrinkle),
        );
      },
      (u, v) =>
        color.clone().multiplyScalar(1 + folds * 8 * Math.sin(u * 16 + v * 23)),
      (_, v) => {
        const t = v * (profile.length - 1),
          i = Math.min(profile.length - 2, Math.floor(t));
        return weight(
          T.MathUtils.lerp(profile[i][0], profile[i + 1][0], t - i),
        );
      },
      material,
    );
    for (let i = start; i < this.indices.length; i += 3) {
      const a = this.indices[i];
      this.indices[i] = this.indices[i + 1];
      this.indices[i + 1] = a;
    }
    for (const end of [0, profile.length - 1]) {
      const row = end === 0 ? 0 : rows,
        p = profile[end],
        center = this.vertex(
          new T.Vector3(cx + bend(p[0]), p[0], cz + (p[3] || 0)),
          color,
          weight(p[0]),
          0,
          0,
        ),
        capStart = this.indices.length;
      for (let k = 0; k < columns; k++) {
        const a = firstRing + row * (columns + 1) + k,
          b = a + 1;
        if (end === 0) this.indices.push(center, b, a);
        else this.indices.push(center, a, b);
      }
      this.groups.push({
        start: capStart,
        count: this.indices.length - capStart,
        materialIndex: material,
      });
    }
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(this.colors, 3));
    g.setAttribute("skinIndex", new T.Uint16BufferAttribute(this.joints, 4));
    g.setAttribute("skinWeight", new T.Float32BufferAttribute(this.weights, 4));
    g.setAttribute("uv", new T.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.indices);
    const ordered: number[] = [];
    for (let material = 0; material < 4; material++) {
      const start = ordered.length;
      for (const group of this.groups)
        if (group.materialIndex === material)
          for (let i = group.start; i < group.start + group.count; i++)
            ordered.push(this.indices[i]);
      if (ordered.length > start)
        g.addGroup(start, ordered.length - start, material);
    }
    g.setIndex(ordered);
    g.computeVertexNormals();
    const blink = this.positions.slice();
    for (const { i, center, amount } of this.blinkVertices)
      blink[i * 3 + 1] = center + (blink[i * 3 + 1] - center) * (1 - amount);
    g.morphAttributes.position = [new T.Float32BufferAttribute(blink, 3)];
    g.computeBoundingSphere();
    return g;
  }
}
export class HumanSurface {
  root = new T.Group();
  mesh: T.SkinnedMesh;
  private bindings: { source: T.Object3D; bone: T.Bone }[] = [];
  private phase: number;
  constructor(p: Person) {
    const r = new Random(p.group.userData.seed + "/surface"),
      surface = new Surface();
    this.phase = r.range(0, 10);
    const bones: T.Bone[] = [];
    const bone = (
      source: T.Object3D,
      parent: number | null,
      position: T.Vector3,
    ) => {
      const b = new T.Bone();
      b.position.copy(position);
      if (parent === null) this.root.add(b);
      else bones[parent].add(b);
      bones.push(b);
      this.bindings.push({ source, bone: b });
      return bones.length - 1;
    };
    // The root is a local-space identity; the visual root receives actor.matrixWorld.
    const identity = new T.Object3D(),
      root = bone(identity, null, new T.Vector3()),
      spine = bone(p.spine, root, new T.Vector3(0, 1.17, 0)),
      head = bone(p.head, spine, new T.Vector3(0, 0.335, 0));
    const leg: number[][] = [],
      arm: number[][] = [];
    for (let i = 0; i < 2; i++) {
      const h = bone(
          p.hips[i],
          root,
          new T.Vector3(p.hips[i].position.x, 0.89, 0),
        ),
        k = bone(p.knees[i], h, new T.Vector3(0, -0.43, 0)),
        a = bone(p.ankles[i], k, new T.Vector3(0, -0.41, 0));
      leg.push([h, k, a]);
      const s = bone(p.shoulders[i], spine, p.shoulders[i].position.clone()),
        e = bone(p.elbows[i], s, new T.Vector3(0, -0.28, 0)),
        w = bone(
          p.elbows[i].children.find((o) => o instanceof T.Group)!,
          e,
          new T.Vector3(0, -0.25, 0),
        );
      arm.push([s, e, w]);
    }
    const skin = new T.Color(p.group.userData.skin),
      shirt = new T.Color(p.group.userData.shirt),
      pants = new T.Color(p.group.userData.pants),
      hair = new T.Color(p.group.userData.hair),
      shoe = new T.Color(0x25292b);
    const width = p.group.userData.width as number,
      female = r.next() < 0.45,
      build = r.range(0.91, 1.1);
    const fixed =
        (b: number) =>
        (_: number): Weight => [b, b, 0],
      blend = (
        a: number,
        b: number,
        y: number,
        center: number,
        range: number,
      ): Weight => [
        a,
        b,
        T.MathUtils.smoothstep(y, center - range, center + range),
      ];
    surface.rings(
      0,
      0,
      [
        [0.945, 0.161 * width, 0.118],
        [0.975, 0.162 * width, 0.119],
        [1.04, 0.15 * width, 0.105],
        [1.13, 0.16 * width, 0.115],
        [1.24, (female ? 0.18 : 0.19) * width, 0.13],
        [1.33, 0.206 * width, 0.126],
        [1.385, 0.18 * width, 0.1],
        [1.415, 0.07, 0.046],
      ],
      shirt,
      (y) => blend(root, spine, y, 1, 0.11),
      1,
      0.0035,
    );
    surface.rings(
      0,
      0,
      [
        [0.805, 0.115 * width, 0.09],
        [0.865, 0.17 * width, 0.115],
        [0.94, 0.16 * width, 0.104],
        [0.995, 0.146 * width, 0.098],
      ],
      pants,
      fixed(root),
      1,
      0.002,
    );
    // Neck and clavicle volume, tucked under the garment collar.
    surface.rings(
      0,
      0,
      [
        [1.385, 0.074, 0.063],
        [1.42, 0.047, 0.044],
        [1.47, 0.043, 0.041, -0.012],
        [1.51, 0.037, 0.042, -0.025],
        [1.55, 0.038, 0.045, -0.025],
      ],
      skin,
      (y) => blend(spine, head, y, 1.49, 0.025),
      0,
    );
    surface.rings(
      0,
      0.001,
      [
        [1.395, 0.09, 0.064],
        [1.408, 0.088, 0.06],
        [1.424, 0.071, 0.049],
      ],
      shirt.clone().multiplyScalar(0.8),
      fixed(spine),
      1,
    );
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1,
        x = side * 0.093,
        [hip, knee, ankle] = leg[i],
        sx = p.shoulders[i].position.x,
        [shoulder, elbow, wrist] = arm[i];
      surface.rings(
        x,
        0,
        [
          [0.05, 0.046, 0.046],
          [0.13, 0.046, 0.052],
          [0.3, 0.057, 0.063],
          [0.44, 0.055, 0.063],
          [0.48, 0.063, 0.062],
          [0.65, 0.077 * build, 0.078],
          [0.83, 0.089 * build, 0.094],
          [0.915, 0.078, 0.073],
        ],
        pants,
        (y) =>
          y > 0.48
            ? blend(knee, hip, y, 0.5, 0.09)
            : blend(ankle, knee, y, 0.1, 0.065),
        1,
        0.0025,
      );
      // Shoe profile has a raised heel, narrow ankle and asymmetric toe box.
      surface.rings(
        x,
        0,
        [
          [0.005, 0.047, 0.112, 0.045],
          [0.027, 0.058, 0.128, 0.046],
          [0.065, 0.056, 0.117, 0.042],
          [0.095, 0.049, 0.085, 0.018],
          [0.135, 0.044, 0.052, 0],
        ],
        shoe,
        fixed(ankle),
        2,
        0.0004,
      );
      surface.rings(
        sx,
        0,
        [
          [0.845, 0.029, 0.03],
          [0.91, 0.039, 0.041],
          [1.03, 0.047, 0.049],
          [1.08, 0.044, 0.044],
          [1.2, 0.058, 0.063],
          [1.31, 0.067, 0.068],
          [1.35, 0.073, 0.074],
          [1.375, 0.068, 0.069],
          [1.395, 0.052, 0.055],
          [1.41, 0.025, 0.032],
          [1.415, 0.001, 0.001],
        ],
        shirt,
        (y) =>
          y > 1.3
            ? blend(shoulder, spine, y, 1.365, 0.06)
            : blend(elbow, shoulder, y, 1.07, 0.085),
        1,
        0.0025,
        28,
        (y) => -side * 0.044 * T.MathUtils.smoothstep(y, 1.31, 1.415),
      );
      // Exposed wrist and a shaped palm, articulated at the wrist bone.
      surface.rings(
        sx,
        0.005,
        [
          [0.743, 0.027, 0.014],
          [0.778, 0.034, 0.019],
          [0.825, 0.031, 0.022],
          [0.857, 0.025, 0.026],
          [0.878, 0.029, 0.029],
        ],
        skin,
        (y) => blend(wrist, elbow, y, 0.854, 0.018),
        0,
      );
      for (let f = 0; f < 4; f++) {
        const fx = sx + (f - 1.5) * 0.014,
          length = [0.064, 0.073, 0.069, 0.052][f],
          fy = 0.754 - length / 2;
        surface.ellipsoid(
          new T.Vector3(fx, fy, 0.012),
          new T.Vector3(0.007, length / 2, 0.008),
          skin,
          wrist,
          0,
          8,
          10,
        );
        surface.ellipsoid(
          new T.Vector3(fx, fy - length * 0.3, 0.019),
          new T.Vector3(0.0048, 0.008, 0.0015),
          skin.clone().lerp(new T.Color(0xe9d2bd), 0.25),
          wrist,
          0,
          4,
          8,
        );
      }
      surface.ellipsoid(
        new T.Vector3(sx - side * 0.035, 0.793, 0.015),
        new T.Vector3(0.013, 0.031, 0.012),
        skin,
        wrist,
        0,
        10,
        12,
      );
    }
    // Dense face surface: jaw, cheek planes, orbital cavities, brow ridge,
    // nasal bridge, philtrum and chin are sculpted into one continuous mesh.
    const headY = 1.485,
      jaw = r.range(0.89, 1.08),
      noseWidth = r.range(0.9, 1.12),
      eyeSpace = r.range(0.95, 1.08),
      age = r.range(0, 1),
      g = (
        x: number,
        y: number,
        cx: number,
        cy: number,
        rx: number,
        ry: number,
      ) => Math.exp(-(((x - cx) / rx) ** 2) - ((y - cy) / ry) ** 2);
    surface.patch(
      64,
      96,
      (u, v) => {
        const a = u * Math.PI * 2,
          t = v * Math.PI,
          y = 0.13 + Math.cos(t) * 0.132;
        let rx =
            0.088 *
            Math.sin(t) *
            (y < 0.11
              ? T.MathUtils.lerp(
                  0.91 * jaw,
                  1,
                  T.MathUtils.smoothstep(y, 0.005, 0.11),
                )
              : 1),
          x = Math.sin(a) * rx;
        let z = Math.cos(a) * 0.09 * Math.sin(t) - 0.012;
        const front = T.MathUtils.smoothstep(Math.cos(a), 0.25, 0.8);
        const features =
          0.017 * g(x, y, 0, 0.133, 0.018 * noseWidth, 0.037) +
          0.016 * g(x, y, 0, 0.109, 0.022 * noseWidth, 0.013) -
          0.005 *
            (g(x, y, -0.033 * eyeSpace, 0.145, 0.021, 0.014) +
              g(x, y, 0.033 * eyeSpace, 0.145, 0.021, 0.014)) +
          0.006 *
            (g(x, y, -0.044, 0.106, 0.042, 0.029) +
              g(x, y, 0.044, 0.106, 0.042, 0.029)) +
          0.004 *
            (g(x, y, -0.034, 0.169, 0.032, 0.012) +
              g(x, y, 0.034, 0.169, 0.032, 0.012)) +
          0.007 * g(x, y, 0, 0.034, 0.04, 0.025) +
          0.006 * g(x, y, 0, 0.075, 0.038, 0.014) -
          0.003 * g(x, y, 0, 0.091, 0.01, 0.016);
        z += front * features;
        return new T.Vector3(x, headY + y, z);
      },
      (u, v) => {
        const a = u * Math.PI * 2,
          y = 0.13 + Math.cos(v * Math.PI) * 0.132,
          x = Math.sin(a) * 0.088 * Math.sin(v * Math.PI),
          front = Math.max(0, Math.cos(a));
        const flush =
          (g(x, y, -0.06, 0.103, 0.034, 0.025) +
            g(x, y, 0.06, 0.103, 0.034, 0.025)) *
          0.13 *
          front;
        const c = skin
          .clone()
          .lerp(new T.Color(0xad5f57), flush)
          .multiplyScalar(1 - 0.045 * age * Math.sin(v * 75) ** 8 * front);
        return c;
      },
      () => [head, head, 0],
      0,
    );
    const iris = r.pick([0x506052, 0x697a86, 0x806747, 0x49392b]);
    for (const side of [-1, 1]) {
      const x = side * 0.033 * eyeSpace,
        ey = headY + 0.145,
        ez = 0.066;
      surface.ellipsoid(
        new T.Vector3(x, ey, ez),
        new T.Vector3(0.0145, 0.0058, 0.007),
        new T.Color(0xddd9cf),
        head,
        3,
        12,
        20,
        { center: ey, amount: 0.96 },
      );
      surface.ellipsoid(
        new T.Vector3(x, ey, ez + 0.0065),
        new T.Vector3(0.0048, 0.0048, 0.0018),
        new T.Color(iris),
        head,
        3,
        10,
        16,
        { center: ey, amount: 0.96 },
      );
      surface.ellipsoid(
        new T.Vector3(x, ey, ez + 0.008),
        new T.Vector3(0.0027, 0.0033, 0.001),
        new T.Color(0x15191a),
        head,
        3,
        8,
        12,
        { center: ey, amount: 0.96 },
      );
      // Upper and lower lid strips contour around the almond-shaped eye.
      for (const upper of [false, true])
        surface.patch(
          4,
          24,
          (u, v) => {
            const q = (u - 0.5) * 2,
              lift = Math.sin(Math.PI * u) * (upper ? 0.0058 : -0.0045),
              y = ey + lift + (upper ? 1 : -1) * v * 0.005;
            return new T.Vector3(
              x + q * 0.0158,
              y,
              ez + 0.007 - v * 0.004 - Math.abs(q) * 0.006,
            );
          },
          () => skin.clone().multiplyScalar(0.93),
          () => [head, head, 0],
          0,
        );
      surface.patch(
        3,
        24,
        (u, v) =>
          new T.Vector3(
            x + (u - 0.5) * 0.038,
            headY + 0.169 + Math.sin(u * Math.PI) * 0.004 - v * 0.003,
            0.068 - Math.abs(u - 0.5) * 0.011,
          ),
        () => hair,
        () => [head, head, 0],
        2,
      );
      surface.ellipsoid(
        new T.Vector3(side * 0.087, headY + 0.122, -0.014),
        new T.Vector3(0.014, 0.029, 0.016),
        skin,
        head,
        0,
        16,
        20,
      );
      surface.ellipsoid(
        new T.Vector3(side * 0.096, headY + 0.121, -0.006),
        new T.Vector3(0.004, 0.016, 0.008),
        skin.clone().multiplyScalar(0.73),
        head,
        0,
        10,
        12,
      );
      surface.ellipsoid(
        new T.Vector3(side * 0.011 * noseWidth, headY + 0.105, 0.094),
        new T.Vector3(0.0045, 0.002, 0.003),
        skin.clone().multiplyScalar(0.42),
        head,
        0,
        6,
        10,
      );
    }
    for (const upper of [false, true])
      surface.patch(
        6,
        32,
        (u, v) => {
          const x = (u - 0.5) * 0.052,
            curve = Math.sin(u * Math.PI),
            cupid = upper
              ? 0.003 + Math.abs(Math.sin(u * Math.PI * 2)) * 0.002
              : -0.005;
          return new T.Vector3(
            x,
            headY + 0.073 + curve * cupid * v,
            0.075 + curve * 0.0035 * Math.sin(v * Math.PI),
          );
        },
        () => skin.clone().lerp(new T.Color(0xa45e60), 0.38),
        () => [head, head, 0],
        0,
      );
    // Hair follows the skull with a shaped hairline and directional surface grooves.
    const originalStyle = p.group.userData.hairstyle as number;
    const style =
        originalStyle === 1
          ? 2
          : originalStyle === 2
            ? 1
            : originalStyle === 3
              ? 3
              : originalStyle === 4
                ? 4
                : 0,
      length = style === 2 ? 0.11 : style === 3 ? 0.065 : 0.008;
    surface.patch(
      24,
      48,
      (u, v) => {
        const a = u * Math.PI * 2,
          front = Math.max(0, Math.cos(a)),
          limit = 1.95 - front * 0.9,
          t = v * limit;
        const noise =
          Math.sin(a * 31 + t * 13) * 0.0006 +
          Math.sin(a * 61 - t * 18) * 0.0004;
        return new T.Vector3(
          Math.sin(t) * Math.sin(a) * (0.092 + noise),
          headY + 0.13 + Math.cos(t) * 0.137 - (1 - front) * v ** 6 * length,
          -0.013 + Math.sin(t) * Math.cos(a) * (0.094 + noise),
        );
      },
      (u, v) =>
        hair
          .clone()
          .multiplyScalar(0.85 + 0.15 * Math.sin(u * 190 + v * 23) ** 2),
      () => [head, head, 0],
      2,
    );
    if (style === 1)
      surface.ellipsoid(
        new T.Vector3(0, headY + 0.15, -0.122),
        new T.Vector3(0.041, 0.043, 0.039),
        hair,
        head,
        2,
        16,
        24,
      );
    if (style === 4) {
      surface.rings(
        0,
        -0.009,
        [
          [headY + 0.19, 0.096, 0.095],
          [headY + 0.235, 0.097, 0.096],
          [headY + 0.267, 0.065, 0.068],
          [headY + 0.277, 0.001, 0.001],
        ],
        shirt,
        fixed(head),
        1,
        0.001,
      );
      surface.ellipsoid(
        new T.Vector3(0, headY + 0.213, 0.072),
        new T.Vector3(0.109, 0.009, 0.066),
        shirt,
        head,
        1,
        8,
        24,
      );
    }
    if (female && style === 2)
      for (const side of [-1, 1])
        surface.rings(
          side * 0.094,
          -0.045,
          [
            [headY + 0.02, 0.028, 0.037],
            [headY + 0.09, 0.03, 0.044],
            [headY + 0.17, 0.024, 0.026],
          ],
          hair,
          fixed(head),
          2,
          0.001,
          20,
        );
    // Garment construction details are part of the deforming mesh.
    for (const side of [-1, 1])
      surface.patch(
        8,
        8,
        (u, v) =>
          new T.Vector3(
            side * (0.022 + u * 0.052),
            1.418 - v * 0.082,
            0.083 + v * 0.01,
          ),
        () => shirt.clone().multiplyScalar(0.8),
        () => [spine, spine, 0],
        1,
      );
    if (r.next() < 0.55)
      for (let i = 0; i < 4; i++)
        surface.ellipsoid(
          new T.Vector3(0, 1.34 - i * 0.064, 0.12),
          new T.Vector3(0.003, 0.003, 0.0018),
          shirt.clone().multiplyScalar(0.4),
          spine,
          2,
          4,
          8,
        );
    this.mesh = new T.SkinnedMesh(surface.geometry(), humanMaterials());
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.mesh.bind(new T.Skeleton(bones));
    this.mesh.userData.humanSurface = true;
  }
  update(actor: Person, time: number) {
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(actor.group.matrixWorld);
    this.root.visible = actor.alive && actor.group.visible;
    for (const { source, bone } of this.bindings) {
      bone.position.copy(source.position);
      bone.quaternion.copy(source.quaternion);
      bone.scale.copy(source.scale);
    }
    const cycle = (time + this.phase) % 4.7,
      blink = cycle < 0.16 ? Math.sin((cycle / 0.16) * Math.PI) : 0;
    this.mesh.morphTargetInfluences![0] = blink;
    this.root.updateMatrixWorld(true);
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
    this.root.removeFromParent();
  }
}
