import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as T from "three";

// Model tests run without a GPU. A minimal canvas supplies the procedural texture API.
const context = {
  fillRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
  bezierCurveTo() {},
  fillText() {},
  putImageData() {},
  getImageData() {
    return { data: new Uint8ClampedArray(256 * 256 * 4) };
  },
};
globalThis.document = {
  createElement() {
    return { width: 256, height: 256, getContext: () => ({ ...context }) };
  },
};
const dir = path.resolve(".qa");
fs.mkdirSync(dir, { recursive: true });
execFileSync(
  process.execPath,
  [
    "node_modules/typescript/bin/tsc",
    "--ignoreConfig",
    "--noEmit",
    "false",
    "--outDir",
    ".qa",
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "bundler",
    "--skipLibCheck",
    "src/world.ts",
    "src/destruction.ts",
    "src/streaming-city.ts",
    "src/player.ts",
    "src/interiors.ts",
  ],
  { stdio: "inherit" },
);
const outputs = fs.readdirSync(dir).filter((file) => file.endsWith(".js"));
for (const file of outputs) {
  const output = fs
    .readFileSync(path.join(dir, file), "utf8")
    .replace(/from ['"]\.\/([\w-]+)['"]/g, "from './$1.js'");
  fs.writeFileSync(path.join(dir, file), output);
}
const { City } = await import("../.qa/world.js");
const { Destruction } = await import("../.qa/destruction.js");
const { initializePhysics, CityPhysics } = await import("../.qa/physics.js");
await initializePhysics();
const { createPlan, options, STRIDE } = await import("../.qa/plan.js");
const { generateDistrict } = await import("../.qa/generation.js");
const { District, StreamingCity } = await import("../.qa/streaming-city.js");
const { createPerson, animatePerson } = await import("../.qa/inhabitants.js");
const { Player } = await import("../.qa/player.js");
const { CityLife } = await import("../.qa/life.js");
const { interiorLayout, Interiors } = await import("../.qa/interiors.js");
const plan = createPlan("METROPOLIS-QA");
assert.deepEqual(
  plan,
  createPlan("METROPOLIS-QA"),
  "Master plan must be deterministic",
);
assert.notDeepEqual(plan.roads, createPlan("SECOND-SEED").roads);
assert.equal(plan.districts.length, 1024);
assert.ok(
  plan.buildings.length > 3000,
  "Metropolis must have thousands of buildings",
);
assert.equal(new Set(plan.buildings.map((b) => b.style)).size, 7);
const lifePlan = createPlan("LIFE-QA", { blocks: 8, crowds: 12 });
const life = new CityLife(lifePlan),
  sameLife = new CityLife(lifePlan);
assert.equal(life.count, 768);
assert.deepEqual(life.homes, sameLife.homes);
assert.deepEqual(life.jobs, sameLife.jobs);
const identity = life.describe(5).name;
life.setHour(2);
assert.equal(life.sample(5).activity, "sleeping");
assert.ok(life.sample(5).inside);
life.setHour(12);
assert.equal(life.sample(5).activity, "working");
assert.equal(life.describe(5).name, identity);
life.setHour(7.1);
for (let id = 0; id < life.count; id++) {
  const s = life.sample(id);
  assert.ok([s.x, s.z, s.heading, s.speed].every(Number.isFinite));
}
const home = life.homes[5];
life.displaced.add(home);
assert.equal(life.sample(5).activity, "evacuating");
assert.equal(life.sample(5).inside, false);
life.dead.add(5);
assert.equal(life.population, 767);
assert.ok(!life.nearby(lifePlan.districts.map((d) => d.id)).includes(5));
const savedIdentity = life.describe(17);
for (let i = 0; i < 120; i++) life.tick(1 / 60);
assert.equal(life.describe(17).name, savedIdentity.name);
life.setHour(12);
const wage = life.savings[17];
const energy = life.energy[17];
for (let i = 0; i < 120; i++) life.tick(1);
assert.ok(
  life.savings[17] > wage && life.energy[17] < energy,
  "Work must earn actual money and consume energy",
);
const vacant = new CityLife(createPlan("EMPTY-LIFE", { blocks: 4, crowds: 0 }));
vacant.tick(1);
assert.equal(vacant.population, 0);
for (const b of plan.buildings) {
  const layout = interiorLayout(b, 1);
  assert.ok(layout.clearHeight >= 2.8);
  assert.equal(layout.rooms.length, 4);
  assert.ok(layout.rooms.every((r) => r.w >= 3 && r.d >= 3));
}
const narrow = createPlan("SMALLEST-BLOCKS", {
  blocks: 4,
  blockSize: 48,
  height: 110,
});
for (const b of narrow.buildings) {
  const l = interiorLayout(b, b.floors - 1);
  assert.ok(
    l.rooms.every((r) => r.w >= 3 && r.d >= 3),
    "Even top setbacks and small blocks must retain usable rooms",
  );
}
const player = new Player();
player.teleport(0, 0, 0);
const contacts = [];
const environment = {
  blocked: () => false,
  floor: () => 0,
  contact: (p, r, energy, landing) => contacts.push({ energy, landing }),
};
assert.equal(player.mass, 80);
assert.ok(player.resize(2, environment));
for (let i = 0; i < 120; i++)
  player.update(1 / 60, i / 60, new Set(), true, environment);
assert.ok(Math.abs(player.mass - 640) < 0.1, "Mass must scale cubically");
assert.ok(Math.abs(player.radius - 0.58) < 0.001);
assert.equal(
  player.resize(2, { ...environment, blocked: (x, y, z, r, h) => h > 4 }),
  false,
  "Low ceilings must prevent growth",
);
player.jump();
let peak = 0;
for (let i = 0; i < 180; i++) {
  player.update(1 / 60, i / 60, new Set(), true, environment);
  peak = Math.max(peak, player.position.y);
}
assert.ok(
  peak > 1.8 && peak < 2.3,
  "Jump height scales while gravitational acceleration stays unchanged",
);
assert.ok(
  contacts.some((c) => c.landing && c.energy > 10000),
  "Scaled landing must transfer physical energy",
);
player.flying = true;
for (let i = 0; i < 120; i++)
  player.update(1 / 60, i / 60, new Set(["Space"]), true, environment);
assert.ok(player.position.y > 10);
assert.ok(player.avatar.group.visible);
assert.ok(player.avatar.shoulders.every((s) => Math.abs(s.rotation.z) > 0.4));
const followCamera = new T.PerspectiveCamera();
player.flying = false;
player.teleport(0, 0, 0);
player.yaw = 0;
player.pitch = 0;
for (let i = 0; i < 100; i++)
  player.camera(followCamera, (p) => p.z > 2, 1 / 60);
assert.ok(
  followCamera.position.z < 2,
  "Third-person camera must stop before a wall",
);
const interiorPhysics = new CityPhysics();
const testCity = new StreamingCity(
  "INTERIOR-QA",
  { blocks: 4, height: 8, crowds: 4, traffic: 1, budget: 2 },
  interiorPhysics,
);
const testCamera = new T.PerspectiveCamera(65, 1, 0.1, 1000);
testCamera.position.set(8, 2, 20);
testCamera.lookAt(8, 2, 0);
testCamera.updateMatrixWorld();
for (let i = 0; i < 120; i++)
  testCity.update(1 / 60, i / 60, null, testCamera, new T.Vector3(8, 0, 20));
assert.equal(testCity.activeDistricts, 2);
const enteredPlan = testCity.plan.buildings.find((p) =>
  testCity.buildings.some((b) => b.x === p.x && b.z === p.z),
);
const interior = new Interiors(() => testCity);
assert.equal(
  interior.enter(enteredPlan, 2),
  "You do not fit through this doorway. Shrink with numpad −.",
);
assert.equal(interior.enter(enteredPlan, 1), "");
for (const room of interiorLayout(enteredPlan, 0).rooms)
  assert.ok(
    interior.parts.some(
      (p) =>
        Math.abs(p.p.x - room.x) < room.w / 2 &&
        Math.abs(p.p.z - room.z) < room.d / 2 &&
        p.s.y > 0.2,
    ),
    "Every room must contain usable furniture",
  );
const floorStart = interior.floorY();
assert.ok(
  interior.blocked(enteredPlan.x, floorStart, enteredPlan.z, 0.3, 3.1),
  "Interior ceilings must enforce head clearance",
);
const interiorDoor = interior.doors[0],
  doorPoint = interiorDoor.closed.clone();
doorPoint.y = floorStart;
assert.ok(interior.blocked(doorPoint.x, floorStart, doorPoint.z, 0.05, 1.78));
assert.ok(interior.interact(doorPoint));
assert.equal(
  interior.blocked(doorPoint.x, floorStart, doorPoint.z, 0.05, 1.78),
  false,
  "Opening an interior door must release its actual collision aperture",
);
const removedIndex = interior.parts.findIndex((p) => p !== interiorDoor.part);
testCity.remove(interior.parts[removedIndex]);
interior.exit();
assert.equal(interior.enter(enteredPlan, 1), "");
assert.equal(
  interior.parts[removedIndex].alive,
  false,
  "Interior damage must survive leaving and re-entering",
);
assert.ok(interior.changeFloor(1));
assert.equal(interior.floorY(), floorStart + 3.1);
assert.equal(
  interior.support(enteredPlan.x + enteredPlan.w + 20, enteredPlan.z),
  null,
  "Leaving the real floor footprint must remove elevated support",
);
const falling = new Player();
falling.teleport(
  enteredPlan.x + enteredPlan.w + 20,
  interior.floorY(),
  enteredPlan.z,
);
const fallEnvironment = {
  ...environment,
  floor: (x, z, y) => Math.max(0, interior.support(x, z, y) ?? -Infinity),
};
for (let i = 0; i < 240; i++)
  falling.update(1 / 60, i / 60, new Set(), true, fallEnvironment);
assert.ok(
  falling.position.y < 0.05,
  "A player leaving an elevated interior must fall to ground",
);
falling.surface.dispose();
interior.exit();
testCity.dispose();
interiorPhysics.world.free();
const big = createPlan("MAX-SCALE", {
  blocks: 64,
  blockSize: 100,
  coverage: 1,
});
assert.ok(big.extent > 6000 && big.buildings.length > 14000);
assert.equal(options({ budget: 999, crowds: NaN }).budget, 12);
assert.equal(options({ crowds: NaN }).crowds, 34);
const districtPlan = plan.districts.find((d) =>
  d.buildings.some((b) => b.floors > 8),
);
const generated = generateDistrict(districtPlan, 1);
assert.deepEqual(generated, generateDistrict(districtPlan, 1));
assert.ok(
  generated.count > generateDistrict(districtPlan, 0.2).count,
  "Detail must change geometry density",
);
assert.equal(generated.parts.length, generated.count * STRIDE);
for (let i = 0; i < generated.parts.length; i += STRIDE) {
  assert.ok(
    Array.from(generated.parts.slice(i, i + STRIDE)).every(Number.isFinite),
  );
  assert.ok(
    generated.parts[i + 3] > 0 &&
      generated.parts[i + 4] > 0 &&
      generated.parts[i + 5] > 0,
  );
}
const material = (c) => new T.MeshStandardMaterial({ color: c });
const district = new District(
  districtPlan,
  generated,
  material,
  options({ crowds: 5, traffic: 2 }),
);
while (!district.pump()) {}
assert.ok(
  district.buildings.every((b) =>
    b.floors.every((f) => f.slab && f.columns.length === 4),
  ),
);
const streamedDamage = new Destruction();
const streamedWorld = {
  root: district.root,
  parts: district.parts,
  buildings: district.buildings,
  citizens: district.citizens,
  cars: district.cars,
  population: district.citizens.length,
  remove(p) {
    p.alive = false;
    p.mesh.setMatrixAt(p.index, new T.Matrix4().makeScale(0, 0, 0));
  },
};
streamedDamage.bindCity(streamedWorld);
const attached = district.parts.find((p) => p.support && p.building < 0);
assert.ok(attached, "Street detail must contain supported attachments");
streamedWorld.remove(attached.support);
streamedDamage.hit(streamedWorld, attached.support.p, 0.01);
assert.equal(
  attached.alive,
  false,
  "Removing a street post must release its attached geometry",
);
const target = district.buildings[0];
streamedDamage.hit(streamedWorld, new T.Vector3(target.x, 1, target.z), 8, 2);
for (let i = 0; i < 900; i++) streamedDamage.update(1 / 60, streamedWorld);
assert.ok(
  target.collapsed && target.parts.every((p) => !p.alive),
  "Streamed support collapse must finish including float-encoded slabs",
);
district.citizens[0].alive = false;
district.cars[0].alive = false;
const snapshot = district.capture();
const restored = new District(
  districtPlan,
  generateDistrict(districtPlan, 1),
  material,
  options({ crowds: 5, traffic: 2 }),
  snapshot,
);
while (!restored.pump()) {}
assert.deepEqual(
  restored.capture(),
  snapshot,
  "Unloading and regenerating must preserve geometry damage and inhabitants",
);
assert.ok(
  restored.parts.every(
    (p) => p.building < 0 || p.owner === restored.buildings[p.building],
  ),
  "Structural owners must survive reconstruction",
);
const person = createPerson("ANATOMY-QA");
const twin = createPerson("ANATOMY-QA");
const anatomy = (p) => {
  const result = [];
  p.group.traverse((o) => {
    if (o instanceof T.Mesh)
      result.push([
        o.geometry.type,
        ...o.position,
        ...o.scale,
        o.material.color.getHex(),
      ]);
  });
  return result;
};
assert.deepEqual(
  anatomy(person),
  anatomy(twin),
  "Procedural anatomy and clothing must reproduce from seed",
);
assert.notDeepEqual(anatomy(person), anatomy(createPerson("DIFFERENT-PERSON")));
for (let i = 0; i < 360; i++) {
  animatePerson(person, 1 / 60, i / 60, districtPlan, null);
  person.group.updateMatrixWorld(true);
  person.group.traverse((o) =>
    assert.ok(o.matrixWorld.elements.every(Number.isFinite)),
  );
  for (const ankle of person.ankles) {
    const foot = ankle.getWorldPosition(new T.Vector3());
    assert.ok(
      foot.y > 0.26 && foot.y < 0.52,
      "IK feet must stay near the sidewalk",
    );
  }
}
assert.equal(person.knees.length, 2);
assert.equal(person.elbows.length, 2);
// Exercise the new anatomy through the actual ragdoll path, including geometry-
// centered colliders for heads whose mesh origins lie at the neck.
const anatomyDamage = new Destruction();
const anatomyWorld = {
  ...streamedWorld,
  parts: [],
  buildings: [],
  citizens: [person],
  cars: [],
  population: 1,
  root: new T.Group(),
};
anatomyDamage.hit(anatomyWorld, person.group.position.clone(), 1, 1);
assert.equal(person.alive, false);
const skullPiece = anatomyDamage.pieces.find(
  (p) =>
    p.geometry?.boundingBox &&
    Math.abs(p.geometry.boundingBox.max.y - 0.255) < 1e-6,
);
assert.ok(
  skullPiece && skullPiece.body.collider(0).halfExtents().y < 0.16,
  "Ragdoll head collider must match geometry bounds rather than a unit cube",
);
for (let i = 0; i < 300; i++) anatomyDamage.update(1 / 60, anatomyWorld);
assert.ok(
  anatomyDamage.pieces.every((p) => [...p.p, ...p.v].every(Number.isFinite)),
);
anatomyDamage.clear();
district.dispose();
restored.dispose();
streamedDamage.clear();
const fingerprint = (city) =>
  JSON.stringify({
    roads: city.roads,
    parts: city.parts.map((p) => [p.shape, ...p.p, ...p.s, p.color]),
    people: city.citizens.map((p) => [...p.group.position, p.speed]),
    cars: city.cars.map((p) => [...p.group.position, p.speed]),
  });
const first = new City("QA-CITY"),
  repeat = new City("QA-CITY"),
  other = new City("ANOTHER-CITY");
assert.equal(
  fingerprint(first),
  fingerprint(repeat),
  "Same seed must reproduce all model geometry and inhabitants",
);
assert.notEqual(
  fingerprint(first),
  fingerprint(other),
  "Different seeds must change the generated city",
);
assert.notDeepEqual(
  first.roads,
  other.roads,
  "Seed must change street spacing",
);
for (const city of [first, repeat, other])
  for (const p of city.parts) {
    assert.ok(
      [...p.p, ...p.s, ...p.q].every(Number.isFinite),
      "All model transforms must be finite",
    );
    assert.ok(
      p.s.x > 0 && p.s.y > 0 && p.s.z > 0,
      "All geometry dimensions must be positive",
    );
  }
assert.equal(first.citizens.length, 90);
assert.equal(first.cars.length, 26);
assert.equal(first.blocked(first.buildings[0].x, first.buildings[0].z), true);
const damage = new Destruction(),
  b = first.buildings[0];
damage.bindCity(first);
// A glass-only direct removal cannot trigger a structural collapse.
const glass = b.parts.find((p) => p.color === 0x344c53);
first.remove(glass);
damage.hit(first, glass.p, 0.01);
assert.equal(b.collapsed, false);
damage.hit(first, new T.Vector3(b.x, 1, b.z), 8, 2);
assert.ok(damage.destroyed > 0, "Impact must remove static geometry");
assert.ok(b.collapsed, "Missing floor support must propagate collapse");
for (let i = 0; i < 600; i++) damage.update(1 / 60, first);
assert.ok(
  b.parts.every((p) => !p.alive),
  "Full collapse must eventually remove all building parts",
);
assert.equal(
  first.blocked(b.x, b.z),
  false,
  "Collapsed building must release its walking footprint",
);
assert.ok(damage.pieces.length <= 650, "Debris budget must be enforced");
assert.ok(
  damage.physics.dynamicBodies <= 650,
  "Rigid-body count must obey the same pool limit",
);
assert.ok(damage.clouds.length <= 100, "Dust budget must be enforced");
assert.ok(
  damage.pieces.every((p) => [...p.p, ...p.v].every(Number.isFinite)),
  "Debris integration must remain finite",
);
const upper = repeat.buildings[0],
  partial = new Destruction();
partial.bindCity(repeat);
partial.hit(repeat, new T.Vector3(upper.x, upper.h - 0.2, upper.z), 2.7, 1);
assert.ok(
  upper.collapseFrom > 1,
  "Upper support loss should only compromise upper floors",
);
assert.equal(upper.collapsed, false);
for (let i = 0; i < 600; i++) partial.update(1 / 60, repeat);
assert.ok(
  upper.parts.some((p) => p.alive),
  "Partial collapse must preserve lower floors",
);
assert.ok(
  repeat.blocked(upper.x, upper.z),
  "Surviving lower floors must remain solid",
);
const vehicle = first.cars.find((c) => c.alive);
damage.hit(first, vehicle.group.position.clone(), 2, 2);
assert.equal(vehicle.alive, false, "Vehicles must fracture");
const citizen = first.citizens.find((c) => c.alive);
const population = first.population;
damage.hit(first, citizen.group.position.clone(), 1, 1);
assert.equal(citizen.alive, false);
assert.ok(first.population < population);
for (let i = 0; i < 180; i++) damage.update(1 / 60, first);
assert.ok(
  damage.pieces.every((p) => [...p.p, ...p.v].every(Number.isFinite)),
  "Ragdoll joints and vehicle bodies must remain finite",
);
const contact = new CityPhysics(),
  still = new T.Vector3(),
  size = new T.Vector3(1, 1, 1),
  q = new T.Quaternion();
const lower = contact.body(new T.Vector3(0, 0.4, 0), size, still, still, q),
  upperBox = contact.body(new T.Vector3(0, 2, 0), size, still, still, q);
for (let i = 0; i < 360; i++) contact.step(1 / 60);
assert.ok(lower.translation().y > 0.25, "A fragment must rest on the ground");
assert.ok(
  upperBox.translation().y > 1.1,
  "A second fragment must stack above the first",
);
assert.ok(
  contact.floorHeight(0, 0) > 1.1,
  "Walking query must detect stacked rubble",
);
contact.world.free();
const road = first.parts.find((p) => p.alive && p.color === 0x41494a);
damage.hit(first, road.p, 0.3);
assert.equal(road.alive, false, "Road segments must be destructible");
for (const c of [first, repeat, other]) {
  c.update(0.016, 100, null);
  c.dispose();
}
damage.clear();
assert.equal(damage.destroyed, 0);
assert.equal(damage.pieces.length, 0);
const { HumanSurface } = await import("../.qa/human-surface.js");
const { signalPhase, nearestRoad, advanceCrowd } =
  await import("../.qa/traffic.js");
const { tramLines, tramPosition } = await import("../.qa/transit.js");
const surfaceActor = createPerson("SURFACE-QA"),
  surface = new HumanSurface(surfaceActor);
const skinGeometry = surface.mesh.geometry,
  weights = skinGeometry.attributes.skinWeight,
  indices = skinGeometry.attributes.skinIndex,
  vertices = skinGeometry.attributes.position;
assert.ok(vertices.count > 10000, "Close people must have anatomical surfaces");
assert.equal(skinGeometry.groups.length, 5);
const portrait = skinGeometry.attributes.portrait;
let faceVertices = 0;
for (let i = 0; i < portrait.count; i++) {
  assert.ok(
    [
      portrait.getX(i),
      portrait.getY(i),
      portrait.getZ(i),
      portrait.getW(i),
    ].every(Number.isFinite),
  );
  assert.ok(portrait.getZ(i) >= 0 && portrait.getZ(i) <= 1);
  if (portrait.getZ(i) > 0) {
    faceVertices++;
    assert.ok(
      vertices.getY(i) > 1.47,
      "Portrait pigment must stay on the head",
    );
    assert.ok(portrait.getX(i) >= 0 && portrait.getX(i) <= 1);
    assert.ok(portrait.getY(i) >= 0 && portrait.getY(i) <= 1);
  }
}
assert.ok(
  faceVertices > 1000,
  "Facial detail must cover an anatomical surface",
);
for (let i = 0; i < weights.count; i++) {
  let sum = 0;
  for (let j = 0; j < 4; j++) {
    const w = weights.array[i * 4 + j];
    sum += w;
    assert.ok(w >= 0 && w <= 1);
    assert.ok(indices.array[i * 4 + j] < surface.mesh.skeleton.bones.length);
  }
  assert.ok(Math.abs(sum - 1) < 1e-6);
}
for (let f = 0; f < 120; f++) {
  animatePerson(surfaceActor, 1 / 60, f / 60, districtPlan, null);
  surfaceActor.group.updateMatrixWorld(true);
  surface.update(surfaceActor, f / 60);
  surface.mesh.skeleton.update();
  for (let v = 0; v < vertices.count; v += 137) {
    const point = new T.Vector3().fromBufferAttribute(vertices, v);
    surface.mesh.applyBoneTransform(v, point);
    assert.ok(
      point.toArray().every(Number.isFinite),
      "Skinned gait must remain finite",
    );
  }
}
const surfaceTwin = new HumanSurface(createPerson("SURFACE-QA"));
assert.deepEqual(
  surfaceTwin.mesh.geometry.attributes.position.array,
  vertices.array,
);
const { packHuman, unpackHuman, humanTransfers, humanRestRig } =
  await import("../.qa/human-geometry.js");
const packed = packHuman(surfaceTwin.mesh.geometry),
  buffers = humanTransfers(packed);
assert.equal(
  new Set(buffers).size,
  buffers.length,
  "Worker packets must transfer each buffer once",
);
const transferred = structuredClone(packed, { transfer: buffers }),
  roundTrip = unpackHuman(transferred);
assert.deepEqual(roundTrip.attributes.position.array, vertices.array);
assert.deepEqual(roundTrip.attributes.portrait.array, portrait.array);
assert.deepEqual(roundTrip.groups, skinGeometry.groups);
assert.ok(
  roundTrip.morphAttributes.normal[0].array.every(Number.isFinite),
  "Blink normals must survive worker transfer",
);
const fromWorker = new HumanSurface(createPerson("SURFACE-QA"), roundTrip);
assert.equal(
  fromWorker.mesh.geometry.attributes.skinWeight.count,
  vertices.count,
);
fromWorker.dispose();
const restSurface = new HumanSurface(
  humanRestRig({ ...surfaceActor.group.userData }),
  undefined,
  true,
);
assert.deepEqual(
  restSurface.mesh.geometry.attributes.position.array,
  vertices.array,
  "Worker rest-rig construction must match the rendered actor's identity",
);
restSurface.dispose();
const { Surface } = await import("../.qa/human-surface.js"),
  { tailoredShirt } = await import("../.qa/human-clothing.js");
const garment = new Surface();
tailoredShirt(garment, new T.Color(0x777777), 1, false, 0, 1, [
  [6, 7],
  [12, 13],
]);
const edges = new Map(),
  connected = Array.from({ length: garment.positions.length / 3 }, () => []);
for (let i = 0; i < garment.indices.length; i += 3) {
  const tri = garment.indices.slice(i, i + 3);
  for (let j = 0; j < 3; j++) {
    const a = tri[j],
      b = tri[(j + 1) % 3],
      key = Math.min(a, b) + "," + Math.max(a, b);
    edges.set(key, (edges.get(key) || 0) + 1);
    connected[a].push(b);
    connected[b].push(a);
  }
}
assert.ok(
  [...edges.values()].every((n) => n === 2),
  "The joined shirt must have no open shoulder edges",
);
const reached = new Set([0]),
  queue = [0];
for (let i = 0; i < queue.length; i++)
  for (const v of connected[queue[i]])
    if (!reached.has(v)) {
      reached.add(v);
      queue.push(v);
    }
assert.equal(
  reached.size,
  connected.length,
  "Both sleeves and torso must be one connected surface",
);
surface.dispose();
surfaceTwin.dispose();
for (let t = -35; t < 70; t += 0.25) {
  const signal = signalPhase(t, 4, 7);
  assert.ok(!(signal.x === "green" && signal.z === "green"));
  if (signal.walk) assert.ok(signal.x === "red" && signal.z === "red");
}
assert.equal(nearestRoad({ roads: [-100, -41, 12, 98] }, 0), 2);
const walkers = [
  { id: 1, x: -2, z: 0, vx: 1, vz: 0, tx: 3, tz: 0, radius: 0.3, speed: 1.2 },
  { id: 2, x: 2, z: 0, vx: -1, vz: 0, tx: -3, tz: 0, radius: 0.3, speed: 1.2 },
];
for (let f = 0; f < 480; f++) {
  const result = advanceCrowd(walkers, 1 / 60, () => false);
  result.forEach((next, i) => Object.assign(walkers[i], next));
  assert.ok(
    Math.hypot(walkers[0].x - walkers[1].x, walkers[0].z - walkers[1].z) >=
      0.59,
    "Head-on pedestrians must stay separated",
  );
}
assert.ok(
  walkers[0].x > 2 && walkers[1].x < -2,
  "Pedestrians must pass without deadlock",
);
const wallBody = [
  { id: 1, x: 0, z: 0, vx: 0, vz: 0, tx: 3, tz: 0, radius: 0.3, speed: 1 },
];
for (let f = 0; f < 240; f++)
  Object.assign(
    wallBody[0],
    advanceCrowd(wallBody, 1 / 60, (x, z, r) => x + r > 1)[0],
  );
assert.ok(
  wallBody[0].x <= 0.701,
  "Crowd steering must respect solid obstacles",
);
for (const line of tramLines(big)) {
  for (const leg of line.legs) {
    for (const boundary of [
      leg.start,
      leg.start + leg.dwell,
      leg.start + leg.duration,
    ]) {
      const a = tramPosition(line, boundary - 0.0001),
        b = tramPosition(line, boundary + 0.0001);
      assert.ok(
        Math.hypot(a.x - b.x, a.z - b.z) < 0.01,
        "Tram timetables must be continuous",
      );
      assert.ok([a.x, a.z, a.speed, b.x, b.z, b.speed].every(Number.isFinite));
    }
  }
}
const attachmentData = generateDistrict(districtPlan, 1);
for (let i = 0; i < attachmentData.count; i++) {
  const parent = attachmentData.parts[i * STRIDE + 13];
  assert.ok(
    parent === -1 || (parent >= 0 && parent < i),
    "Attachments must reference earlier support parts",
  );
}
console.log(
  "PASS: persistent lives, scaled physics, elevated falls, interiors, streaming destruction, skinned anatomy, facial pigment bounds, worker transfers, connected garments, crowd separation, signal safety, continuous tram timetables, ragdolls and structural physics.",
);
// Only remove the known temporary compiler outputs created by this test.
for (const file of outputs) fs.unlinkSync(path.join(dir, file));
fs.rmdirSync(dir);
