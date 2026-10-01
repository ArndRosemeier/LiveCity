import * as T from "three";
import { Random } from "./random";
import type { Person } from "./inhabitants";
import { sculptHead } from "./human-head";
import { humanMaterials } from "./human-materials";
import { tailoredShirt } from "./human-clothing";

// Original parametric anatomy. These surfaces are built in the rig's bind pose,
// then blended across joints rather than rendered as rigid limb primitives.
export type Weight = [number, number, number];
type Profile = [number, number, number, number?];
export class Surface {
  positions: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  joints: number[] = [];
  weights: number[] = [];
  uv: number[] = [];
  portrait: number[] = [];
  groups: { start: number; count: number; materialIndex: number }[] = [];
  blinkVertices: { i: number; center: number; amount: number }[] = [];
  blinkTargets: { i: number; target: T.Vector3 }[] = [];
  private normalSeams: [number, number][] = [];
  vertex(p: T.Vector3, c: T.Color, w: Weight, u: number, v: number) {
    const i = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z);
    this.colors.push(c.r, c.g, c.b);
    this.joints.push(w[0], w[1], 0, 0);
    this.weights.push(1 - w[2], w[2], 0, 0);
    this.uv.push(u, v);
    this.portrait.push(0, 0, 0, 0);
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
    visible?: (p: T.Vector3) => boolean,
    closed?: (p: T.Vector3, u: number, v: number) => T.Vector3,
  ) {
    const first = this.positions.length / 3,
      start = this.indices.length;
    for (let y = 0; y <= rows; y++)
      for (let x = 0; x <= columns; x++) {
        const u = x / columns,
          v = y / rows,
          p = point(u, v),
          i = this.vertex(p, color(u, v), weight(u, v), u * 8, v * 8);
        if (closed) this.blinkTargets.push({ i, target: closed(p, u, v) });
        if (blink)
          this.blinkVertices.push({
            i,
            center: blink.center,
            amount: blink.amount,
          });
      }
    for (let y = 0; y <= rows; y++) {
      const a = first + y * (columns + 1),
        b = a + columns;
      const pa = new T.Vector3().fromArray(this.positions, a * 3),
        pb = new T.Vector3().fromArray(this.positions, b * 3);
      if (pa.distanceToSquared(pb) < 1e-12) this.normalSeams.push([a, b]);
    }
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const a = first + y * (columns + 1) + x,
          b = a + columns + 1;
        if (!visible) {
          this.indices.push(a, b, a + 1, b, b + 1, a + 1);
          continue;
        }
        for (const triangle of [
          [a, b, a + 1],
          [b, b + 1, a + 1],
        ]) {
          const center = new T.Vector3();
          for (const index of triangle)
            center.add(new T.Vector3().fromArray(this.positions, index * 3));
          if (!visible || visible(center.multiplyScalar(1 / 3)))
            this.indices.push(...triangle);
        }
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
  frontPatch(...args: Parameters<Surface["patch"]>) {
    const start = this.indices.length;
    this.patch(...args);
    // Facial patches have varying parameter directions. Orient their winding
    // explicitly towards the front so eyes and upper lids never vanish.
    for (let i = start; i < this.indices.length; i += 3) {
      const a = this.indices[i] * 3,
        b = this.indices[i + 1] * 3,
        c = this.indices[i + 2] * 3;
      const cross =
        (this.positions[b] - this.positions[a]) *
          (this.positions[c + 1] - this.positions[a + 1]) -
        (this.positions[b + 1] - this.positions[a + 1]) *
          (this.positions[c] - this.positions[a]);
      if (cross < 0)
        [this.indices[i], this.indices[i + 1]] = [
          this.indices[i + 1],
          this.indices[i],
        ];
    }
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
          y = T.MathUtils.lerp(p[0], q[0], f),
          a = u * Math.PI * 2;
        const interpolate = (component: number) => {
          const a = profile[Math.max(0, i - 1)][component] || 0,
            b = p[component] || 0,
            c = q[component] || 0,
            d = profile[Math.min(profile.length - 1, i + 2)][component] || 0;
          return (
            0.5 *
            (2 * b +
              (-a + c) * f +
              (2 * a - 5 * b + 4 * c - d) * f * f +
              (-a + 3 * b - 3 * c + d) * f * f * f)
          );
        };
        const rx = Math.max(0.001, interpolate(1)),
          rz = Math.max(0.001, interpolate(2)),
          z = interpolate(3);
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
    g.setAttribute("portrait", new T.Float32BufferAttribute(this.portrait, 4));
    const tissue = this.positions
      .filter((_, i) => i % 3 === 1)
      .map((y, i) =>
        y > 1.47
          ? Math.abs(this.positions[i * 3]) > 0.08
            ? 0.8
            : 0.22
          : y < 0.9
            ? 0.3
            : 0.1,
      );
    g.setAttribute("tissue", new T.Float32BufferAttribute(tissue, 1));
    g.setIndex(this.indices);
    const ordered: number[] = [];
    for (let material = 0; material < 5; material++) {
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
    const weldNormals = (
      attribute: T.BufferAttribute | T.InterleavedBufferAttribute,
    ) => {
      for (const [a, b] of this.normalSeams) {
        const normal = new T.Vector3()
          .fromBufferAttribute(attribute, a)
          .add(new T.Vector3().fromBufferAttribute(attribute, b))
          .normalize();
        attribute.setXYZ(a, normal.x, normal.y, normal.z);
        attribute.setXYZ(b, normal.x, normal.y, normal.z);
      }
    };
    weldNormals(g.attributes.normal);
    const blink = this.positions.slice();
    for (const { i, center, amount } of this.blinkVertices)
      blink[i * 3 + 1] = center + (blink[i * 3 + 1] - center) * (1 - amount);
    for (const { i, target } of this.blinkTargets) target.toArray(blink, i * 3);
    g.morphAttributes.position = [new T.Float32BufferAttribute(blink, 3)];
    const closed = new T.BufferGeometry();
    closed.setIndex(g.index!);
    closed.setAttribute("position", g.morphAttributes.position[0]);
    closed.computeVertexNormals();
    weldNormals(closed.attributes.normal);
    g.morphAttributes.normal = [closed.attributes.normal];
    g.computeBoundingSphere();
    return g;
  }
}
export class HumanSurface {
  root = new T.Group();
  mesh: T.SkinnedMesh;
  private bindings: { source: T.Object3D; bone: T.Bone }[] = [];
  private phase: number;
  constructor(p: Person, geometry?: T.BufferGeometry, geometryOnly = false) {
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
    if (!geometry) {
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
      const shirtFront = tailoredShirt(
        surface,
        shirt,
        width,
        female,
        root,
        spine,
        arm,
      );
      surface.rings(
        0,
        0,
        [
          [0.825, 0.01 * width, 0.012],
          [0.855, 0.115 * width, 0.093],
          [0.895, 0.165 * width, 0.115],
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
          surface.rings(
            fx,
            0.008,
            [
              [0.754 - length, 0.001, 0.002, -0.006],
              [0.754 - length * 0.91, 0.0052, 0.006, -0.005],
              [0.754 - length * 0.73, 0.0062, 0.0067, -0.003],
              [0.754 - length * 0.55, 0.0068, 0.0072, 0],
              [0.754 - length * 0.33, 0.0071, 0.008, 0.002],
              [0.754 - length * 0.12, 0.007, 0.0082, 0.003],
              [0.754, 0.0065, 0.0077, 0.003],
            ],
            skin,
            fixed(wrist),
            0,
            0,
            16,
          );
          surface.ellipsoid(
            new T.Vector3(fx, fy - length * 0.3, 0.009),
            new T.Vector3(0.0048, 0.008, 0.0015),
            skin.clone().lerp(new T.Color(0xe9d2bd), 0.25),
            wrist,
            3,
            8,
            16,
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
      sculptHead(
        surface,
        p.group.userData.seed,
        skin,
        hair,
        shirt,
        head,
        p.group.userData.hairstyle,
        female,
      );
      // A fitted Henley placket follows the garment surface instead of floating.
      if (r.next() < 0.55) {
        surface.frontPatch(
          32,
          4,
          (u, v) => {
            const x = (u - 0.5) * 0.014,
              y = 1.2 + v * 0.17;
            return new T.Vector3(x, y, shirtFront(x, y) + 0.0009);
          },
          () => shirt.clone().multiplyScalar(0.9),
          () => [spine, spine, 0],
          1,
        );
        for (let i = 0; i < 4; i++) {
          const y = 1.345 - i * 0.04;
          surface.ellipsoid(
            new T.Vector3(0, y, shirtFront(0, y) + 0.0014),
            new T.Vector3(0.0035, 0.0035, 0.0014),
            shirt.clone().multiplyScalar(0.43),
            spine,
            2,
            8,
            16,
          );
        }
      }
      geometry = surface.geometry();
    }
    this.mesh = new T.SkinnedMesh(
      geometry,
      geometryOnly ? new T.MeshBasicMaterial() : humanMaterials(),
    );
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
