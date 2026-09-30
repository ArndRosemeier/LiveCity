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
  ],
  { stdio: "inherit" },
);
const outputs = fs.readdirSync(dir).filter((file) => file.endsWith(".js"));
for (const file of outputs) {
  const output = fs
    .readFileSync(path.join(dir, file), "utf8")
    .replace(/from ['"]\.\/(\w+)['"]/g, "from './$1.js'");
  fs.writeFileSync(path.join(dir, file), output);
}
const { City } = await import("../.qa/world.js");
const { Destruction } = await import("../.qa/destruction.js");
const { initializePhysics, CityPhysics } = await import("../.qa/physics.js");
await initializePhysics();
const { createPlan, options, STRIDE } = await import("../.qa/plan.js");
const { generateDistrict } = await import("../.qa/generation.js");
const { District } = await import("../.qa/streaming-city.js");
const { createPerson, animatePerson } = await import("../.qa/inhabitants.js");
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
console.log(
  "PASS: kilometer-scale plans, streamed geometry and damage persistence, procedural anatomy and IK, bounded physics, ragdolls, structural collapse, walking collision, restoration and disposal.",
);
// Only remove the known temporary compiler outputs created by this test.
for (const file of outputs) fs.unlinkSync(path.join(dir, file));
fs.rmdirSync(dir);
