import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { StreamingCity } from "./streaming-city";
import {
  mountControls,
  readControls,
  writeControls,
  updateLabels,
  presets,
  optionsFromUrl,
  writeUrl,
} from "./city-controls";
import { Destruction } from "./destruction";
import { CityAudio } from "./audio";
import "./style.css";
import { Sky } from "./sky";
import { initializePhysics } from "./physics";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div class="loading" id="loading"><strong>Common Ground</strong>GROWING YOUR CITY</div><div class="hud"><div class="top"><div class="brand"><div class="mark" aria-hidden="true">${"<i></i>".repeat(9)}</div><div><strong>COMMON GROUND</strong><small>A PROCEDURAL CITY EXPERIMENT</small></div></div><div class="status"><span class="dot"></span><span id="clock">17:40</span> · <span id="weather">GOLDEN HOUR</span></div></div><div><div class="bottom"><div class="intro"><div class="eyebrow">NO TWO STREETS THE SAME</div><h1>A city with<br>a life of its own.</h1><p>Take the long way home. A living neighborhood, grown from a seed. Every window, wheel, and wandering soul made from scratch.</p><div class="actions"><button class="primary" id="walk">Walk the streets <span>↗</span></button><button class="secondary" id="view">Change perspective</button><button class="secondary" id="settings">City settings</button><button class="secondary" id="help" aria-label="Show controls">?</button></div></div><aside class="panel" aria-label="City settings"><div class="panel-head"><span>CITY DNA</span><span>01 / ∞</span></div><label for="seed">GENERATION SEED</label><div class="seed-row"><input id="seed" value="COMMON-GROUND" maxlength="48" aria-label="City seed"><button id="generate" title="Generate city from seed" aria-label="Generate city">↵</button><button id="random" title="Random city" aria-label="Random seed">⤨</button></div><div class="setting"><label for="hour">Time of day</label><input id="hour" type="range" min="7" max="21" step="0.1" value="17.7"></div><div class="setting"><span>City sound</span><button class="switch" id="sound" aria-pressed="false">OFF</button></div><div class="setting"><span>Destruction tools</span><button class="switch" id="destroy" aria-pressed="false">OFF</button></div><div class="stats"><div><strong id="buildings">—</strong>BUILDINGS</div><div><strong id="people">—</strong>RESIDENTS</div><div><strong id="fps">—</strong>FPS</div></div><button class="secondary" id="restore" style="width:100%;margin-top:17px;padding:9px">Restore this city ↺</button></aside></div><div class="foot"><span>BUILT FROM NOTHING. OPEN TO EVERYTHING.</span><span id="coordinate">DISTRICT 01 · 48° N</span></div></div></div><div class="instructions" id="instructions">DRAG TO ORBIT &nbsp; · &nbsp; SCROLL TO EXPLORE &nbsp; · &nbsp; ENTER THE STREETS TO WALK</div><div class="crosshair"></div><div class="toast" id="toast" role="status"></div>`;
const $ = <E extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as E;
mountControls(document.querySelector(".panel")!, optionsFromUrl());
let renderer: T.WebGLRenderer;
try {
  renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
} catch {
  $("loading").innerHTML =
    "<strong>WebGL is unavailable</strong><span>Please open this city in a browser with hardware acceleration.</span>";
  throw new Error("WebGL unavailable");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.prepend(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.info.autoReset = false;
const scene = new T.Scene();
scene.background = new T.Color(0xb8c7bd);
scene.fog = new T.FogExp2(0xb8c7bd, 0.0019);
const camera = new T.PerspectiveCamera(
  48,
  innerWidth / innerHeight,
  0.1,
  20000,
);
camera.position.set(112, 100, 124);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 6, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.minDistance = 12;
orbit.maxDistance = 250;
orbit.maxPolarAngle = Math.PI * 0.485;
orbit.minPolarAngle = 0.1;
orbit.update();
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new T.Vector2(innerWidth, innerHeight),
  0.16,
  0.5,
  1.1,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const sky = new Sky();
scene.add(sky.mesh);
const hemisphere = new T.HemisphereLight(0xc4dae5, 0x8e8062, 2.3);
scene.add(hemisphere);
const sun = new T.DirectionalLight(0xffdfac, 3.5);
sun.position.set(-55, 55, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -110,
  right: 110,
  top: 110,
  bottom: -110,
  near: 1,
  far: 260,
});
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.12;
scene.add(sun);
scene.add(sun.target);
sun.shadow.camera.left = -220;
sun.shadow.camera.right = 220;
sun.shadow.camera.top = 220;
sun.shadow.camera.bottom = -220;
sun.shadow.camera.far = 1600;
sun.shadow.camera.updateProjectionMatrix();
// A distant landscape provides a horizon without importing any artwork.
const landscape = new T.Group();
scene.add(landscape);
const landMat = new T.MeshStandardMaterial({ color: 0x7d8d7c, roughness: 1 });
const ground = new T.Mesh(new T.CircleGeometry(450, 96), landMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -2.25;
ground.receiveShadow = true;
landscape.add(ground);
const terrainGeometry = new T.PlaneGeometry(850, 850, 80, 80);
terrainGeometry.rotateX(-Math.PI / 2);
const vertices = terrainGeometry.attributes.position;
for (let i = 0; i < vertices.count; i++) {
  const x = vertices.getX(i),
    z = vertices.getZ(i),
    radius = Math.hypot(x, z);
  const envelope = T.MathUtils.smoothstep(radius, 155, 300);
  const hills =
    (Math.sin(x * 0.023 + z * 0.014) * 13 +
      Math.cos(z * 0.027 - x * 0.008) * 17 +
      Math.sin(x * 0.007 - z * 0.013) * 20 +
      24) *
    envelope;
  vertices.setY(i, -2.3 + hills);
}
terrainGeometry.computeVertexNormals();
const terrain = new T.Mesh(
  terrainGeometry,
  new T.MeshStandardMaterial({ color: 0x82927a, roughness: 1 }),
);
landscape.add(terrain);
await initializePhysics().catch((error) => {
  $("loading").innerHTML =
    "<strong>Physics could not start</strong><span>This city needs a browser with WebAssembly enabled. Reload to try again.</span>";
  throw error;
});
const destruction = new Destruction();
scene.add(destruction.root);
const sound = new CityAudio();
let city: StreamingCity;
let time = 0,
  walking = false,
  armed = false,
  yaw = 0,
  pitch = 0,
  vy = 0;
const keys = new Set<string>();
let toastTimer = 0;
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("toast").classList.remove("show"),
    3200,
  );
}
function generate(seed: string) {
  if (city) {
    scene.remove(city.root);
    city.dispose();
  }
  destruction.clear();
  city = new StreamingCity(seed, readControls(), destruction.physics);
  scene.add(city.root);
  for (const axis of ["x", "z"]) {
    const input = $<HTMLInputElement>("visit-" + axis);
    input.max = String(city.options.blocks);
    input.value = String(Math.floor(city.options.blocks / 2) + 1);
  }
  $("buildings").textContent = String(city.totalBuildings);
  $("people").textContent = String(city.population);
  $("coordinate").textContent =
    `SEED ${seed.toUpperCase()} · ${(city.extent / 1000).toFixed(1)} KM CITY · ${city.totalBuildings.toLocaleString()} BUILDINGS`;
  writeUrl(seed, city.options);
  orbit.maxDistance = city.extent * 1.5;
  landscape.scale.setScalar(city.extent / 180);
  sky.mesh.scale.setScalar(30);
  (scene.fog as T.FogExp2).density = 0.00032;
  if (!walking) {
    camera.position.set(
      city.extent * 0.32,
      city.extent * 0.23,
      city.extent * 0.36,
    );
    orbit.target.set(0, 35, 0);
    orbit.update();
  }
  if (walking) {
    camera.position.set(8.3, 1.85, 24);
    yaw = 0;
    pitch = 0;
    vy = 0;
    camera.rotation.set(0, 0, 0, "YXZ");
  }
  $("loading").classList.add("hidden");
}
const initialSeed =
  new URLSearchParams(location.search).get("seed") || "COMMON-GROUND";
$("seed").setAttribute("value", initialSeed);
generate(initialSeed);
function setTime(hour: number) {
  const dusk = Math.max(0, Math.min(1, (hour - 17) / 4));
  const noon = Math.sin(((hour - 6) / 16) * Math.PI);
  sun.position.set(
    Math.cos(((hour - 7) / 14) * Math.PI) * 90,
    Math.max(5, noon * 85),
    38,
  );
  sky.update(hour, sun.position);
  sun.color.set(dusk > 0.4 ? 0xffb977 : 0xffe0ad);
  sun.intensity = 3.2 * (1 - dusk * 0.88);
  hemisphere.intensity = 2.1 * (1 - dusk * 0.72);
  renderer.toneMappingExposure = 1.1 + dusk * 0.25;
  const skyColor = new T.Color().lerpColors(
    new T.Color(0xb8c9c7),
    new T.Color(0x354c65),
    dusk,
  );
  scene.background = skyColor;
  (scene.fog as T.FogExp2).color.copy(skyColor);
  $("clock").textContent =
    `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;
  $("weather").textContent =
    hour < 16 ? "CLEAR SKIES" : hour < 19 ? "GOLDEN HOUR" : "BLUE HOUR";
  city.setNight(dusk);
  city.root.traverse((o) => {
    if (o instanceof T.Mesh && o.material instanceof T.MeshStandardMaterial) {
      const c = o.material.color.getHex();
      if (c === 0xf4d39b || c === 0xc9af77) {
        o.material.emissive.setHex(c);
        o.material.emissiveIntensity = 0.12 + dusk * 1.8;
      }
    }
  });
}
setTime(17.7);
function enterWalk() {
  walking = true;
  document.body.classList.add("walk");
  orbit.enabled = false;
  camera.position.set(8.3, 1.85, 24);
  camera.fov = 68;
  camera.updateProjectionMatrix();
  sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
  sun.shadow.camera.right = sun.shadow.camera.top = 80;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.025;
  yaw = 0;
  pitch = 0;
  vy = 0;
  camera.rotation.set(0, 0, 0, "YXZ");
  $("walk").innerHTML = "Resume walking <span>↗</span>";
  $("view").textContent = "Aerial view";
  updateInstructions();
  lock();
}
let captureFailed = false,
  dragging = false;
function lock() {
  renderer.domElement.focus();
  try {
    const promise = renderer.domElement.requestPointerLock?.();
    if (promise)
      promise.catch(() => {
        captureFailed = true;
        toast("Mouse capture unavailable. Drag to look; WASD still moves.");
      });
  } catch {
    captureFailed = true;
    toast("Drag to look; WASD moves.");
  }
}
function aerial() {
  walking = false;
  document.body.classList.remove("walk");
  if (document.pointerLockElement) document.exitPointerLock();
  orbit.enabled = true;
  camera.fov = 48;
  camera.updateProjectionMatrix();
  sun.shadow.camera.left = sun.shadow.camera.bottom = -220;
  sun.shadow.camera.right = sun.shadow.camera.top = 220;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.12;
  camera.position.set(
    city.extent * 0.32,
    city.extent * 0.23,
    city.extent * 0.36,
  );
  orbit.target.set(0, 35, 0);
  orbit.update();
  $("walk").innerHTML = "Walk the streets <span>↗</span>";
  $("view").textContent = "Change perspective";
  updateInstructions();
}
function updateInstructions() {
  $("instructions").textContent = walking
    ? armed
      ? "WASD MOVE · SHIFT RUN · SPACE JUMP · CLICK IMPACT · E BLAST · M SETTINGS · ESC RELEASE"
      : "WASD MOVE · SHIFT RUN · SPACE JUMP · ESC RELEASE · M SETTINGS · TAB AERIAL"
    : armed
      ? "DRAG TO ORBIT · SCROLL TO ZOOM · CLICK IMPACT · E BLAST"
      : "DRAG TO ORBIT · SCROLL TO EXPLORE · ENTER THE STREETS TO WALK";
}
function settings() {
  document.querySelector(".panel")!.classList.toggle("expanded");
  if (document.pointerLockElement) document.exitPointerLock();
  if (!document.querySelector(".panel")!.classList.contains("expanded"))
    renderer.domElement.focus();
}
$("settings").onclick = settings;
$("visit").onclick = () => {
  const districtIndex = (axis: string) =>
    T.MathUtils.clamp(
      Math.round(Number($<HTMLInputElement>("visit-" + axis).value) || 1) - 1,
      0,
      city.options.blocks - 1,
    );
  const d =
    city.plan.districts[
      districtIndex("x") * city.options.blocks + districtIndex("z")
    ];
  const x = d.x0 + 8.3,
    z = d.z0 + 24;
  if (walking) {
    camera.position.set(x, 1.85, z);
    vy = 0;
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  } else {
    orbit.target.set(x + 20, 20, z + 15);
    camera.position.set(x + 130, 155, z + 165);
    orbit.update();
  }
  city.requestDistrict(d.id, true);
  toast(
    "Exploring district " +
      (d.ix + 1) +
      " / " +
      (d.iz + 1) +
      " · street detail is streaming",
  );
};
$("walk").onclick = () => (walking ? lock() : enterWalk());
$("view").onclick = () => {
  if (walking) aerial();
  else {
    camera.position.set(
      -city.extent * 0.28,
      city.extent * 0.2,
      city.extent * 0.32,
    );
    orbit.target.set(0, 30, 0);
    orbit.update();
  }
};
$("help").onclick = () =>
  toast(
    "Walk: WASD / arrows, Shift sprint, Space jump. Tab switches view. Enable tools to click-impact; E blasts. R restores.",
  );
$("generate").onclick = () => {
  const seed = $<HTMLInputElement>("seed").value.trim() || "COMMON-GROUND";
  generate(seed);
  setTime(Number($<HTMLInputElement>("hour").value));
  toast("A new neighborhood. The same possibility.");
};
$("apply").onclick = () => $("generate").click();
for (const input of document.querySelectorAll<HTMLInputElement>(
  '[id^="city-"]',
))
  input.oninput = () => {
    updateLabels();
    const o = readControls();
    city.options.radius = o.radius;
    city.options.budget = o.budget;
    writeUrl(city.seed, city.options);
    $("apply").textContent = "Apply city settings ↗";
  };
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]"))
  b.onclick = () => {
    writeControls(presets[b.dataset.preset!]);
    $("generate").click();
  };
$("seed").onkeydown = (e) => {
  if (e.key === "Enter") $("generate").click();
};
$("random").onclick = () => {
  $<HTMLInputElement>("seed").value =
    `CITY-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`;
  $("generate").click();
};
$("hour").oninput = () => setTime(Number($<HTMLInputElement>("hour").value));
$("sound").onclick = async () => {
  try {
    const enabled = await sound.toggle();
    $("sound").textContent = enabled ? "ON" : "OFF";
    $("sound").classList.toggle("on", enabled);
    $("sound").setAttribute("aria-pressed", String(enabled));
  } catch {
    toast("Audio could not start in this browser.");
  }
};
$("destroy").onclick = () => {
  armed = !armed;
  $("destroy").classList.toggle("on", armed);
  $("destroy").textContent = armed ? "ON" : "OFF";
  $("destroy").setAttribute("aria-pressed", String(armed));
  updateInstructions();
  toast(
    armed
      ? "Tools active. Click for a local impact. E for a blast."
      : "Tools stowed.",
  );
};
$("restore").onclick = () => {
  generate(city.seed);
  setTime(Number($<HTMLInputElement>("hour").value));
  toast("City restored to its original seed.");
};
const pointer = new T.Vector2(),
  ray = new T.Raycaster();
let lastAttack = 0;
function attack(blast: boolean, event?: MouseEvent) {
  if (!armed || performance.now() - lastAttack < 200) return;
  lastAttack = performance.now();
  if (walking) pointer.set(0, 0);
  else if (event)
    pointer.set(
      (event.clientX / innerWidth) * 2 - 1,
      (-event.clientY / innerHeight) * 2 + 1,
    );
  ray.setFromCamera(pointer, camera);
  const targets: T.Object3D[] = [
    ...city.batches,
    ...city.proxies,
    ...city.cars.filter((c) => c.alive).map((c) => c.group),
    ...city.citizens.filter((c) => c.alive).map((c) => c.group),
  ];
  const hits = ray.intersectObjects(targets, true);
  const hit = hits.find((h) => {
    const list = h.object.userData.parts as
      import("./world").Part[] | undefined;
    return !list || (h.instanceId !== undefined && list[h.instanceId].alive);
  });
  if (hit?.object.userData.proxy && hit.instanceId !== undefined) {
    const plan = hit.object.userData.proxy[hit.instanceId];
    city.requestDistrict(plan.district, true);
    toast("Growing structural detail at your target. Click again when ready.");
    return;
  }
  if (!hit) {
    toast("Aim at a building, street object, or vehicle.");
    return;
  }
  if (walking && hit.distance > 45) {
    toast("Move closer — tool range is 45 meters.");
    return;
  }
  city.ensurePhysicsAt(hit.point);
  destruction.hit(city, hit.point, blast ? 8 : 2.7, blast ? 2 : 1);
  sound.impact(blast ? 2 : 1);
  $("people").textContent = String(city.population);
}
let downX = 0,
  downY = 0;
renderer.domElement.addEventListener("pointerdown", (e) => {
  downX = e.clientX;
  downY = e.clientY;
  dragging = true;
  if (walking && !document.pointerLockElement) lock();
});
document.addEventListener("pointerup", () => (dragging = false));
renderer.domElement.addEventListener("click", (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) < 5) attack(false, e);
});
document.addEventListener("mousemove", (e) => {
  if (
    walking &&
    (document.pointerLockElement === renderer.domElement ||
      (captureFailed && dragging))
  ) {
    yaw -= e.movementX * 0.002;
    pitch = T.MathUtils.clamp(pitch - e.movementY * 0.002, -1.45, 1.45);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  }
});
document.addEventListener("pointerlockchange", () => {
  keys.clear();
  if (walking)
    toast(
      document.pointerLockElement
        ? "You’re on foot. Take your time."
        : "Mouse released. Click the street to resume.",
    );
});
document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (
    e.target instanceof HTMLButtonElement &&
    ["Space", "Enter"].includes(e.code)
  )
    return;
  if (
    [
      "Tab",
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ].includes(e.code)
  )
    e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "KeyM" && walking) settings();
  if (e.code === "Escape" && walking && captureFailed) {
    keys.clear();
    renderer.domElement.blur();
    toast("Mouse released. Click the street to resume.");
  }
  if (e.code === "Tab") walking ? aerial() : enterWalk();
  if (e.code === "KeyE") attack(true);
  if (e.code === "KeyR") $("restore").click();
  if (
    e.code === "Space" &&
    walking &&
    camera.position.y <
      destruction.floorHeight(camera.position.x, camera.position.z) + 1.9
  )
    vy = 4.5;
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
let previous = performance.now(),
  frameCount = 0,
  fpsTime = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  renderer.info.reset();
  const elapsed = (now - previous) / 1000,
    dt = Math.min(0.05, elapsed);
  previous = now;
  time += dt;
  const focus = walking ? camera.position : orbit.target;
  city.update(dt, time, destruction.lastImpact, camera, focus);
  const sunDirection = new T.Vector3()
    .set(
      Math.cos(
        ((Number($<HTMLInputElement>("hour").value) - 7) / 14) * Math.PI,
      ) * 90,
      Math.max(
        5,
        Math.sin(
          ((Number($<HTMLInputElement>("hour").value) - 6) / 16) * Math.PI,
        ) * 85,
      ),
      38,
    )
    .normalize();
  sun.target.position.set(focus.x, 0, focus.z);
  sun.position.copy(sun.target.position).addScaledVector(sunDirection, 600);
  destruction.update(dt, city);
  if (walking) {
    if (
      document.pointerLockElement ||
      (captureFailed && document.activeElement === renderer.domElement)
    ) {
      let x =
        Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"));
      let z =
        Number(keys.has("KeyS") || keys.has("ArrowDown")) -
        Number(keys.has("KeyW") || keys.has("ArrowUp"));
      const norm = Math.hypot(x, z) || 1,
        speed = keys.has("ShiftLeft") ? 7 : 3.2;
      x /= norm;
      z /= norm;
      const dx = (x * Math.cos(yaw) + z * Math.sin(yaw)) * dt * speed,
        dz = (-x * Math.sin(yaw) + z * Math.cos(yaw)) * dt * speed;
      const nx = T.MathUtils.clamp(
          camera.position.x + dx,
          city.plan.min + 8,
          city.plan.max - 8,
        ),
        nz = T.MathUtils.clamp(
          camera.position.z + dz,
          city.plan.min + 8,
          city.plan.max - 8,
        );
      if (
        !city.blocked(nx, camera.position.z) &&
        destruction.floorHeight(nx, camera.position.z) < camera.position.y - 1.2
      )
        camera.position.x = nx;
      if (
        !city.blocked(camera.position.x, nz) &&
        destruction.floorHeight(camera.position.x, nz) < camera.position.y - 1.2
      )
        camera.position.z = nz;
      if (x || z) sound.step(time);
      const floor =
        1.85 + destruction.floorHeight(camera.position.x, camera.position.z);
      vy -= 9.81 * dt;
      camera.position.y = Math.max(floor, camera.position.y + vy * dt);
      if (camera.position.y === floor) vy = 0;
    }
  } else orbit.update();
  composer.render();
  frameCount++;
  fpsTime += elapsed;
  if (fpsTime > 0.7) {
    $("fps").textContent = String(Math.round(frameCount / fpsTime));
    renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
    renderer.domElement.dataset.destroyed = String(destruction.destroyed);
    renderer.domElement.dataset.camera = camera.position.toArray().join(",");
    renderer.domElement.dataset.physicsBodies = String(
      destruction.physics.dynamicBodies,
    );
    renderer.domElement.dataset.colliders = String(
      destruction.physics.colliders,
    );
    $("people").textContent = String(city.population);
    $("stream-status").textContent =
      city.error ||
      city.activeDistricts +
        " detailed districts · " +
        city.pending +
        " growing · " +
        city.parts.length.toLocaleString() +
        " parts";
    renderer.domElement.dataset.districts = String(city.activeDistricts);
    renderer.domElement.dataset.pending = String(city.pending);
    renderer.domElement.dataset.plannedBuildings = String(city.totalBuildings);
    frameCount = 0;
    fpsTime = 0;
  }
}
requestAnimationFrame(frame);
// Small read-only diagnostics for reproducibility and browser QA.
Object.assign(window, {
  cityDiagnostics: () => ({
    seed: city.seed,
    buildings: city.buildings.length,
    parts: city.parts.length,
    roads: city.roads,
    population: city.population,
    cars: city.cars.filter((c) => c.alive).length,
    collapsed: city.buildings.filter((b) => b.collapsed).length,
    destroyed: destruction.destroyed,
    debris: destruction.pieces.length,
    drawCalls: renderer.info.render.calls,
    walking,
    armed,
    camera: camera.position.toArray(),
  }),
});
