import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { createPerson, posePerson, type Person } from "./inhabitants";
import { HumanSurface } from "./human-surface";
export class ResidentStudio {
  dialog: HTMLDialogElement;
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(38, 1, 0.02, 30);
  private orbit: OrbitControls;
  private person: Person | null = null;
  private surface: HumanSurface | null = null;
  private id = 0;
  private moving = false;
  private portrait = false;
  constructor(
    private resident: (id: number) => {
      seed: string;
      name: string;
      occupation: string;
      activity: string;
      home: number;
      energy: number;
      hunger: number;
      count: number;
    },
    private environment: () => T.Texture | null,
  ) {
    this.dialog = document.createElement("dialog");
    this.dialog.className = "resident-studio";
    this.dialog.setAttribute("aria-label", "Resident studio");
    this.dialog.innerHTML =
      '<div class="studio-head"><span>THE PEOPLE OF COMMON GROUND</span><button id="studio-close" aria-label="Close resident studio">×</button></div><div class="studio-content"><div id="studio-view"></div><aside><div class="eyebrow">A LIFE IN THE CITY</div><h2 id="studio-name"></h2><p id="studio-life"></p><p class="studio-caption">Drag to turn. Scroll to look closer.<br>Every face, garment and body is grown from the city seed.</p><div class="studio-buttons"><button id="studio-portrait">Face / full body</button><button id="studio-motion">Walk / stand</button><button id="studio-next">Meet someone else ↗</button></div><small>City simulation pauses while this portrait is open.</small></aside></div>';
    document.body.append(this.dialog);
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.dialog.querySelector("#studio-view")!.append(this.renderer.domElement);
    this.scene.background = new T.Color(0x9eaca8);
    RectAreaLightUniformsLib.init();
    const keyBox = new T.RectAreaLight(0xffede0, 9, 2.4, 3.2),
      fillBox = new T.RectAreaLight(0xe0eaff, 3.5, 2, 2.6);
    keyBox.position.set(-2.4, 2.7, 3.5);
    keyBox.lookAt(0, 1.4, 0);
    fillBox.position.set(2.5, 1.9, 2.8);
    fillBox.lookAt(0, 1.5, 0);
    const sun = new T.DirectionalLight(0xffeee0, 0.65);
    sun.position.set(-3, 3, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -1.4;
    sun.shadow.camera.right = sun.shadow.camera.top = 1.4;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 12;
    sun.shadow.normalBias = 0.0008;
    const rim = new T.DirectionalLight(0xb7d9e9, 1.1);
    rim.position.set(2, 2, -3);
    const fill = new T.DirectionalLight(0xe4ecff, 0.3);
    fill.position.set(3, 1.8, 5);
    this.scene.add(
      sun,
      fill,
      rim,
      keyBox,
      fillBox,
      new T.HemisphereLight(0xd3e5eb, 0x85745e, 0.65),
    );
    const ground = new T.Mesh(
      new T.PlaneGeometry(20, 20),
      new T.MeshStandardMaterial({ color: 0x8c9b94, roughness: 0.86 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.012;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.minDistance = 0.3;
    this.orbit.maxDistance = 5;
    this.orbit.maxPolarAngle = Math.PI * 0.85;
    this.dialog
      .querySelector("#studio-close")!
      .addEventListener("click", () => this.dialog.close());
    this.dialog
      .querySelector("#studio-next")!
      .addEventListener("click", () => this.show(this.id + 17));
    this.dialog
      .querySelector("#studio-motion")!
      .addEventListener("click", () => (this.moving = !this.moving));
    this.dialog
      .querySelector("#studio-portrait")!
      .addEventListener("click", () => {
        this.portrait = !this.portrait;
        this.frame();
      });
  }
  get open() {
    return this.dialog.open;
  }
  show(id = 0) {
    const info = this.resident(id);
    this.id =
      ((id % Math.max(1, info.count)) + Math.max(1, info.count)) %
      Math.max(1, info.count);
    const data = this.resident(this.id);
    this.surface?.dispose();
    this.person = createPerson(data.seed);
    this.person.group.traverse((o) => {
      if (o instanceof T.Mesh) o.visible = Boolean(o.userData.accessory);
    });
    for (const o of this.scene.children.filter((o) => o.userData.studioRig))
      this.scene.remove(o);
    this.person.group.userData.studioRig = true;
    this.scene.add(this.person.group);
    this.surface = new HumanSurface(this.person);
    this.scene.add(this.surface.root);
    this.dialog.querySelector("#studio-name")!.textContent = data.name;
    this.dialog.querySelector("#studio-life")!.textContent =
      data.occupation +
      " · " +
      data.activity +
      "\nHome #" +
      data.home +
      " · Energy " +
      data.energy +
      "% · Hunger " +
      data.hunger +
      "%";
    if (!this.open) this.dialog.showModal();
    this.frame();
  }
  private frame() {
    const s = this.person?.scale || 1;
    this.orbit.target.set(0, (this.portrait ? 1.61 : 0.98) * s, 0);
    this.camera.position.set(
      (this.portrait ? 0.1 : 1.1) * s,
      (this.portrait ? 1.64 : 1.18) * s,
      (this.portrait ? 0.68 : 3.05) * s,
    );
    this.orbit.update();
  }
  update(dt: number, time: number) {
    if (!this.open || !this.person || !this.surface) return;
    const view = this.dialog.querySelector("#studio-view")!,
      w = view.clientWidth,
      h = view.clientHeight;
    if (
      this.renderer.domElement.width !==
        Math.round(w * this.renderer.getPixelRatio()) ||
      this.renderer.domElement.height !==
        Math.round(h * this.renderer.getPixelRatio())
    ) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    posePerson(this.person, dt, time, this.moving ? 1.3 : 0, 0);
    this.person.group.updateMatrixWorld(true);
    this.surface.update(this.person, time);
    this.scene.environment = this.environment();
    this.scene.environmentIntensity = 0.35;
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  }
}
