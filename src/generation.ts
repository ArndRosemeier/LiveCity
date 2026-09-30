import { Random } from "./random";
import { massing, STRIDE, type DistrictPlan, type DistrictData } from "./plan";
export function generateDistrict(
  district: DistrictPlan,
  detail: number,
): DistrictData {
  const data: number[] = [];
  const add = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
    shape = 0,
    b = -1,
    role = 0,
    floor = -1,
    yaw = 0,
  ) => {
    if (w > 0 && h > 0 && d > 0)
      data.push(x, y, z, w, h, d, c, shape, b, role, floor, yaw);
  };
  const cx = (district.x0 + district.x1) / 2,
    cz = (district.z0 + district.z1) / 2,
    bw = district.x1 - district.x0,
    bd = district.z1 - district.z0;
  // Tiled, destructible sidewalks and asphalt are generated only in streamed districts.
  for (let x = district.x0 + 2; x < district.x1; x += 4)
    for (let z = district.z0 + 2; z < district.z1; z += 4) {
      const road =
        Math.min(
          x - district.x0,
          district.x1 - x,
          z - district.z0,
          district.z1 - z,
        ) < 7;
      add(
        x,
        road ? -0.07 : 0.08,
        z,
        3.98,
        road ? 0.2 : 0.3,
        3.98,
        road ? 0x41494a : 0x9a9e90,
      );
    }
  for (let k = 10; k < bw - 8; k += 6) {
    add(district.x0 + k, 0.04, district.z0, 0.14, 0.025, 2.8, 0xcfc9ad);
    add(district.x0, 0.04, district.z0 + k, 2.8, 0.025, 0.14, 0xcfc9ad);
  }
  for (let i = -3; i <= 3; i++) {
    add(district.x0 + i, 0.055, district.z0 + 8, 0.5, 0.025, 2.6, 0xe1dac3);
    add(district.x0 + 8, 0.055, district.z0 + i, 2.6, 0.025, 0.5, 0xe1dac3);
  }
  const tree = (x: number, z: number) => {
    add(x, 1.8, z, 0.28, 3.6, 0.28, 0x6d5240, 2);
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4;
      add(
        x + Math.sin(a) * 0.8,
        3.7 + (k % 3) * 0.38,
        z + Math.cos(a) * 0.8,
        2.8,
        3,
        2.6,
        k % 2 ? 0x5e764d : 0x78905b,
        1,
      );
    }
  };
  for (const x of [district.x0 + 8.2, district.x1 - 8.2]) {
    for (const z of [district.z0 + 15, district.z1 - 15]) tree(x, z);
    add(x, 2.8, cz, 0.12, 5.6, 0.12, 0x394b48, 2);
    add(x, 5.55, cz, 0.68, 0.12, 0.68, 0x33443f);
    add(x, 5.45, cz, 0.4, 0.16, 0.4, 0xf4d39b);
    add(x, 0.52, cz + 5, 1.8, 0.12, 0.6, 0x967657);
    add(x, 0.9, cz + 5 - 0.25, 1.8, 0.58, 0.1, 0x967657);
    for (const a of [-0.7, 0.7])
      add(x + a, 0.3, cz + 5, 0.08, 0.6, 0.48, 0x354845);
  }
  if (district.park) {
    add(cx, 0.26, cz, bw - 21, 0.06, bd - 21, 0x7a8f69);
    add(cx, 0.3, cz, 2.4, 0.05, bd - 20, 0xc3baa0);
    add(cx, 0.31, cz, bw - 20, 0.05, 2.4, 0xc3baa0);
    for (const a of [-1, 1])
      for (const b of [-1, 1]) tree(cx + a * bw * 0.28, cz + b * bd * 0.28);
    add(cx, 0.6, cz, 5, 0.6, 5, 0xadae9d, 2);
    add(cx, 0.93, cz, 4.4, 0.07, 4.4, 0x537f83, 2);
  }
  district.buildings.forEach((p, b) => {
    const r = new Random(p.seed),
      glass = ["glass", "setback"].includes(p.style),
      brick = ["tenement", "brownstone", "warehouse"].includes(p.style);
    const trim = p.accent;
    const bays = Math.min(
      detail > 0.7 ? 18 : 8,
      Math.max(3, Math.round(p.w / 3.6)),
    );
    const windowW = glass ? 2.2 : 1.35,
      windowH = glass ? 2.3 : 1.65;
    for (let f = 0; f < p.floors; f++) {
      const y = 0.3 + f * 3.1,
        { w, d } = massing(p, f);
      add(p.x, y, p.z, w, 0.22, d, 0xa6a99d, 0, b, 1, f);
      for (const dx of [-w / 2, w / 2])
        for (const dz of [-d / 2, d / 2])
          add(p.x + dx, y + 1.5, p.z + dz, 0.36, 3, 0.36, trim, 0, b, 2, f);
      for (let side = -1; side <= 1; side += 2) {
        for (let axis = 0; axis < 2; axis++) {
          const length = axis === 0 ? w : d,
            depth = axis === 0 ? d : w;
          const count =
              axis === 0 ? bays : Math.max(3, Math.round((bays * d) / w)),
            bay = length / count;
          for (let k = 0; k < count; k++) {
            const along = -length / 2 + (k + 0.5) * bay;
            const ww = Math.min(windowW, bay * 0.75);
            const centerX = p.x + (axis === 0 ? along : (side * depth) / 2),
              centerZ = p.z + (axis === 0 ? (side * depth) / 2 : along);
            const box = (
              yy: number,
              span: number,
              hh: number,
              thick: number,
              c: number,
              offset = 0,
            ) =>
              add(
                centerX + (axis === 0 ? 0 : side * offset),
                yy,
                centerZ + (axis === 0 ? side * offset : 0),
                axis === 0 ? span : thick,
                hh,
                axis === 0 ? thick : span,
                c,
                0,
                b,
                0,
                f,
              );
            box(y + 0.35, bay - 0.03, 0.7, 0.28, p.color);
            box(y + 2.62, bay - 0.03, 0.72, 0.28, p.color);
            const pier = (bay - ww) / 2;
            for (const edge of [-1, 1]) {
              const delta = edge * (ww / 2 + pier / 2);
              add(
                centerX + (axis === 0 ? delta : 0),
                y + 1.6,
                centerZ + (axis === 0 ? 0 : delta),
                axis === 0 ? pier : 0.28,
                1.8,
                axis === 0 ? 0.28 : pier,
                glass ? trim : p.color,
                0,
                b,
                0,
                f,
              );
            }
            box(y + 1.6, ww, windowH, 0.06, glass ? 0x355763 : 0x344c53, 0.16);
            box(y + 0.71, ww + 0.2, 0.12, 0.35, trim, 0.17);
            if (!glass || detail > 0.8)
              box(y + 1.6, 0.045, windowH, 0.09, trim, 0.21);
            if (r.next() < 0.24)
              box(y + 1.6, ww * 0.64, windowH * 0.84, 0.04, 0xc9af77, 0.2);
            if (detail > 0.65 && brick && f > 0 && k === 1 && f % 3 === 0) {
              box(y + 0.8, ww + 0.3, 0.18, 0.65, 0x697976, 0.36);
              box(y + 1.8, ww + 0.25, 0.07, 0.06, 0x394b48, 0.65);
              for (const edge of [-1, 1])
                add(
                  centerX + (axis === 0 ? (edge * ww) / 2 : side * 0.65),
                  y + 1.3,
                  centerZ + (axis === 0 ? side * 0.65 : (edge * ww) / 2),
                  0.05,
                  1,
                  0.05,
                  0x394b48,
                  0,
                  b,
                  0,
                  f,
                );
            }
          }
        }
        if (!glass && (detail > 0.5 || f % 3 === 0)) {
          add(
            p.x,
            y + 3,
            p.z + (side * d) / 2,
            w + 0.35,
            0.13,
            0.4,
            trim,
            0,
            b,
            0,
            f,
          );
          add(
            p.x + (side * w) / 2,
            y + 3,
            p.z,
            0.4,
            0.13,
            d + 0.35,
            trim,
            0,
            b,
            0,
            f,
          );
        }
      }
    }
    const h = p.floors * 3.1,
      { w, d } = massing(p, p.floors - 1);
    add(p.x, h + 0.4, p.z, w + 0.4, 0.35, d + 0.4, 0x626d69, 0, b);
    for (const side of [-1, 1]) {
      add(p.x + (side * w) / 2, h + 0.8, p.z, 0.16, 0.8, d, trim, 0, b);
      add(p.x, h + 0.8, p.z + (side * d) / 2, w, 0.8, 0.16, trim, 0, b);
    }
    if (p.style === "artdeco") {
      add(p.x, h + 2.2, p.z, w * 0.6, 3.5, d * 0.6, trim, 3, b);
      add(p.x, h + 5.4, p.z, 0.35, 4.5, 0.35, 0x738b8b, 2, b);
    } else if (p.style === "warehouse") {
      for (let i = 0; i < 3; i++) {
        add(
          p.x - w / 3 + (i * w) / 3,
          h + 1.05,
          p.z,
          w / 3 - 0.2,
          1.3,
          d * 0.86,
          0x778381,
          3,
          b,
        );
        add(
          p.x - w / 3 + (i * w) / 3,
          h + 1.2,
          p.z,
          w / 7,
          0.12,
          d * 0.72,
          0x4b6974,
          0,
          b,
        );
      }
    } else if (p.style === "brownstone") {
      for (const dx of [-w * 0.25, w * 0.25])
        add(p.x + dx, h + 1.2, p.z, 1.1, 1.8, 1.1, 0x936550, 0, b);
    } else {
      add(p.x + w * 0.15, h + 0.95, p.z, 2.3, 1.1, 1.6, 0x76837e, 0, b);
      if (detail > 0.65) {
        add(
          p.x - w * 0.22,
          h + 1.25,
          p.z - d * 0.15,
          0.14,
          2,
          0.14,
          0x657774,
          2,
          b,
        );
        for (let i = 0; i < 3; i++)
          add(
            p.x - w * 0.22,
            h + 1.7 + i * 0.3,
            p.z - d * 0.15,
            1.4,
            0.045,
            0.06,
            0x657774,
            0,
            b,
          );
      }
    }
    const front = p.z + (p.front * p.d) / 2;
    if (p.style === "tenement" && detail > 0.6) {
      const ex = p.x + p.w * 0.26,
        ez = front + p.front * 0.9;
      for (let f = 1; f < p.floors; f++) {
        const y = 0.3 + f * 3.1;
        add(ex, y + 0.75, ez, 2.3, 0.1, 1.5, 0x394b48, 0, b);
        add(ex, y + 1.75, ez + p.front * 0.65, 2.3, 0.08, 0.06, 0x394b48, 0, b);
        for (let k = -2; k <= 2; k++)
          add(
            ex + k * 0.5,
            y + 1.25,
            ez + p.front * 0.65,
            0.04,
            1,
            0.04,
            0x394b48,
            0,
            b,
          );
        for (const side of [-1, 1])
          add(ex + side * 0.35, y - 0.7, ez, 0.06, 3.1, 0.06, 0x394b48, 0, b);
        for (let k = 0; k < 9; k++)
          add(ex, y - 2.2 + k * 0.33, ez, 0.7, 0.045, 0.06, 0x394b48, 0, b);
      }
      for (const dx of [-0.8, 0.8])
        for (const dz of [-0.8, 0.8])
          add(p.x + dx, h + 1.4, p.z + dz, 0.12, 1.8, 0.12, 0x394b48, 0, b);
      add(p.x, h + 3.15, p.z, 2.5, 2, 2.5, 0x81654e, 2, b);
      add(p.x, h + 4.45, p.z, 2.75, 0.65, 2.75, 0x566762, 3, b);
    }
    add(p.x, 1.6, front + p.front * 0.2, 1.55, 2.6, 0.12, 0x263e43, 0, b);
    for (const side of [-1, 1])
      add(
        p.x + side * p.w * 0.3,
        1.6,
        front + p.front * 0.18,
        p.w * 0.28,
        2.35,
        0.1,
        0x344c53,
        0,
        b,
      );
    add(
      p.x,
      3.05,
      front + p.front * 0.26,
      p.w - 0.7,
      0.48,
      0.25,
      0x4b6c65,
      0,
      b,
    );
    if (brick) {
      for (let i = 0; i < 3; i++)
        add(
          p.x,
          0.18 + i * 0.14,
          front + p.front * (1.2 - i * 0.32),
          2.1,
          0.28,
          1.8 - i * 0.32,
          0xa6a99d,
          0,
          b,
        );
      if (detail > 0.7)
        for (const side of [-1, 1]) {
          add(
            p.x + side * 0.97,
            1.05,
            front + p.front * 0.8,
            0.045,
            1.3,
            0.045,
            0x394b48,
            0,
            b,
          );
          add(
            p.x + side * 0.97,
            1.7,
            front + p.front * 0.5,
            0.045,
            0.045,
            1.4,
            0x394b48,
            0,
            b,
          );
        }
    }
    if (detail > 0.5 && !glass) {
      add(
        p.x,
        2.75,
        front + p.front * 0.85,
        p.w - 0.8,
        0.12,
        1.6,
        0xbca77f,
        0,
        b,
      );
      for (let i = 0; i < 10; i++)
        add(
          p.x - p.w / 2 + 0.8 + (i * (p.w - 1.6)) / 10,
          2.63,
          front + p.front * 1.6,
          (p.w - 1.6) / 10,
          0.23,
          0.12,
          i % 2 ? 0xbca77f : 0x4b6c65,
          0,
          b,
        );
    }
  });
  return {
    district: district.id,
    parts: new Float32Array(data),
    count: data.length / STRIDE,
    detail,
  };
}
