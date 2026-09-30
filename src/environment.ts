import * as T from "three";
import { Sky } from "./sky";
import { Random } from "./random";
// Self-authored city/sky reflection environment, convolved for physically based
// roughness. No HDRI download or external image is involved.
export class CityEnvironment {
  private generator: T.PMREMGenerator;
  private scene = new T.Scene();
  private sky = new Sky();
  private sun = new T.DirectionalLight(0xffe2b9, 2.3);
  private fill = new T.HemisphereLight(0xc7dbe9, 0x5c5547, 1.8);
  private target: T.WebGLRenderTarget | null = null;
  private seed = "";
  private bucket = -1;
  private buildings = new T.Group();
  private geometry = new T.BoxGeometry(1, 1, 1);
  constructor(renderer: T.WebGLRenderer) {
    this.generator = new T.PMREMGenerator(renderer);
    this.scene.add(this.sky.mesh, this.sun, this.fill, this.buildings);
    const ground = new T.Mesh(
      new T.PlaneGeometry(300, 300),
      new T.MeshStandardMaterial({ color: 0x626b69, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    this.scene.add(ground);
  }
  update(seed: string, hour: number) {
    const bucket = Math.floor(hour * 2);
    if (seed === this.seed && bucket === this.bucket)
      return this.target!.texture;
    if (seed !== this.seed) {
      for (const b of this.buildings.children)
        (b as T.Mesh).material instanceof T.Material &&
          ((b as T.Mesh).material as T.Material).dispose();
      this.buildings.clear();
      const r = new Random(seed + "/reflection");
      for (let i = 0; i < 26; i++) {
        const angle = (i / 26) * Math.PI * 2,
          height = r.range(8, 36),
          b = new T.Mesh(
            this.geometry,
            new T.MeshStandardMaterial({
              color: r.pick([0x958879, 0x8e9ba0, 0x687e85, 0xa29a85]),
              roughness: 0.7,
            }),
          );
        b.position.set(
          Math.sin(angle) * 45,
          height / 2 - 3,
          Math.cos(angle) * 45,
        );
        b.scale.set(r.range(5, 10), height, r.range(5, 10));
        this.buildings.add(b);
      }
      this.seed = seed;
    }
    this.bucket = bucket;
    const night =
      hour < 7
        ? T.MathUtils.clamp((7 - hour) / 2, 0, 1)
        : T.MathUtils.clamp((hour - 18) / 3, 0, 1);
    this.sun.position.set(
      Math.cos(((hour - 7) / 14) * Math.PI) * 50,
      Math.max(4, Math.sin(((hour - 6) / 16) * Math.PI) * 50),
      25,
    );
    this.sun.intensity = 2.3 * (1 - night * 0.96);
    this.fill.intensity = 1.8 * (1 - night * 0.88);
    this.sky.update(hour, this.sun.position);
    this.target?.dispose();
    this.target = this.generator.fromScene(this.scene, 0.04, 0.1, 1000);
    return this.target.texture;
  }
}
