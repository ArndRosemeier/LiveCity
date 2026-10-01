import * as T from "three";
import type { Person } from "./inhabitants";
type ArrayData = Float32Array | Uint16Array | Uint32Array;
export interface HumanProfile {
  seed: string;
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  width: number;
  hairstyle: number;
}
export interface HumanGeometry {
  attributes: Record<string, { data: ArrayData; size: number }>;
  index: Uint16Array | Uint32Array;
  groups: { start: number; count: number; materialIndex?: number }[];
  blink: Float32Array;
  blinkNormals: Float32Array;
}
export function packHuman(g: T.BufferGeometry): HumanGeometry {
  return {
    attributes: Object.fromEntries(
      Object.entries(g.attributes).map(([name, a]) => [
        name,
        { data: a.array as ArrayData, size: a.itemSize },
      ]),
    ),
    index: g.index!.array as Uint16Array | Uint32Array,
    groups: g.groups.map((g) => ({ ...g })),
    blink: g.morphAttributes.position![0].array as Float32Array,
    blinkNormals: g.morphAttributes.normal![0].array as Float32Array,
  };
}
export function unpackHuman(data: HumanGeometry) {
  const g = new T.BufferGeometry();
  for (const [name, a] of Object.entries(data.attributes))
    g.setAttribute(name, new T.BufferAttribute(a.data, a.size));
  g.setIndex(new T.BufferAttribute(data.index, 1));
  for (const group of data.groups)
    g.addGroup(group.start, group.count, group.materialIndex);
  g.morphAttributes.position = [new T.BufferAttribute(data.blink, 3)];
  g.morphAttributes.normal = [new T.BufferAttribute(data.blinkNormals, 3)];
  g.computeBoundingSphere();
  return g;
}
export function humanTransfers(data: HumanGeometry) {
  return [
    ...Object.values(data.attributes).map((a) => a.data.buffer),
    data.index.buffer,
    data.blink.buffer,
    data.blinkNormals.buffer,
  ] as ArrayBuffer[];
}
// Minimal rest rig for geometry construction in a worker. It deliberately has
// no renderer, DOM, actor batching or nested worker dependencies.
export function humanRestRig(profile: HumanProfile): Person {
  const group = new T.Group(),
    spine = new T.Group(),
    head = new T.Group();
  Object.assign(group.userData, profile);
  spine.position.y = 1.17;
  head.position.y = 0.335;
  group.add(spine);
  spine.add(head);
  const hips: T.Group[] = [],
    knees: T.Group[] = [],
    ankles: T.Group[] = [],
    shoulders: T.Group[] = [],
    elbows: T.Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new T.Group(),
      knee = new T.Group(),
      ankle = new T.Group(),
      shoulder = new T.Group(),
      elbow = new T.Group(),
      wrist = new T.Group();
    hip.position.set(side * 0.093, 0.89, 0);
    knee.position.y = -0.43;
    ankle.position.y = -0.41;
    shoulder.position.set(side * 0.205 * profile.width, 0.18, 0);
    elbow.position.y = -0.28;
    wrist.position.y = -0.25;
    group.add(hip);
    hip.add(knee);
    knee.add(ankle);
    spine.add(shoulder);
    shoulder.add(elbow);
    elbow.add(wrist);
    hips.push(hip);
    knees.push(knee);
    ankles.push(ankle);
    shoulders.push(shoulder);
    elbows.push(elbow);
  }
  return {
    group,
    spine,
    head,
    hips,
    knees,
    ankles,
    shoulders,
    elbows,
    alive: true,
    phase: 0,
    speed: 1,
    progress: 0,
    direction: 1,
    pauseUntil: 0,
    scale: 1,
  };
}
