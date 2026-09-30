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
  ],
  { stdio: "inherit" },
);
for (const file of ["random", "surfaces", "world", "physics", "destruction"]) {
  const output = fs
    .readFileSync(path.join(dir, file + ".js"), "utf8")
    .replace(/from ['"]\.\/(\w+)['"]/g, "from './$1.js'");
  fs.writeFileSync(path.join(dir, file + ".js"), output);
}
const { City } = await import("../.qa/world.js");
const { Destruction } = await import("../.qa/destruction.js");
const { initializePhysics, CityPhysics } = await import("../.qa/physics.js");
await initializePhysics();
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
  "PASS: deterministic models, seed-dependent streets, valid geometry, walking collision, support collapse, fragment budgets, finite physics, vehicle / pedestrian / road fracture, restoration and disposal.",
);
// Only remove the known temporary compiler outputs created by this test.
for (const file of ["random", "surfaces", "world", "physics", "destruction"])
  fs.unlinkSync(path.join(dir, file + ".js"));
fs.rmdirSync(dir);
