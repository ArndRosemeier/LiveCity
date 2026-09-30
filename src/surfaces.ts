import * as T from "three";
import { Random } from "./random";
export type Surface = "brick" | "plaster" | "asphalt" | "stone" | "wood";
const textures = new Map<Surface, T.CanvasTexture>();
function texture(kind: Surface) {
  const cached = textures.get(kind);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!,
    rng = new Random("surface-" + kind);
  ctx.fillStyle = "#c8c8c8";
  ctx.fillRect(0, 0, 256, 256);
  const data = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < data.data.length; i += 4) {
    const value = rng.int(kind === "asphalt" ? 145 : 190, 255);
    data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  if (kind === "brick") {
    ctx.fillStyle = "#999999";
    for (let y = 0; y < 256; y += 32) {
      ctx.fillRect(0, y, 256, 2);
      for (let x = ((y / 32) % 2) * 32; x < 256; x += 64) {
        ctx.fillRect(x, y, 2, 32);
        ctx.fillStyle = `rgb(${rng.int(165, 220)},${rng.int(165, 220)},${rng.int(165, 220)})`;
        ctx.globalAlpha = 0.17;
        ctx.fillRect(x + 3, y + 3, 60, 27);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#999999";
      }
    }
  }
  if (kind === "stone") {
    ctx.strokeStyle = "#a3a3a3";
    ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 128) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (let x = 0; x <= 256; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
  }
  if (kind === "wood") {
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(50,50,50,${rng.range(0.03, 0.18)})`;
      ctx.beginPath();
      const y = rng.range(0, 256);
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        70,
        y + rng.range(-3, 3),
        180,
        y + rng.range(-5, 5),
        256,
        y,
      );
      ctx.stroke();
    }
  }
  if (kind === "asphalt") {
    ctx.strokeStyle = "#7e7e7e";
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = rng.range(0, 256),
        y = rng.range(0, 256);
      ctx.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += rng.range(-15, 15);
        y += rng.range(8, 20);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const map = new T.CanvasTexture(canvas);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  textures.set(kind, map);
  return map;
}
// World-space mapping keeps bricks and grain at a consistent scale on instanced geometry.
export function finish(material: T.MeshStandardMaterial, kind: Surface) {
  const tex = texture(kind),
    scale =
      kind === "brick"
        ? 1
        : kind === "wood"
          ? 0.6
          : kind === "asphalt"
            ? 0.25
            : 0.5;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.surfaceMap = { value: tex };
    shader.uniforms.surfaceScale = { value: scale };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vSurfacePosition; varying vec3 vSurfaceNormal;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
vec4 surfacePosition = vec4(transformed,1.0); vec3 surfaceNormal = normal;
#ifdef USE_INSTANCING
surfacePosition = instanceMatrix * surfacePosition; surfaceNormal = mat3(instanceMatrix) * surfaceNormal;
#endif
vSurfacePosition = (modelMatrix * surfacePosition).xyz; vSurfaceNormal = normalize(mat3(modelMatrix) * surfaceNormal);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vSurfacePosition; varying vec3 vSurfaceNormal; uniform sampler2D surfaceMap; uniform float surfaceScale;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
vec3 sn=abs(normalize(vSurfaceNormal)); vec3 sw=pow(sn,vec3(8.0)); sw/=max(sw.x+sw.y+sw.z,0.001);
vec3 tx=texture2D(surfaceMap,vSurfacePosition.zy*surfaceScale).rgb;
vec3 ty=texture2D(surfaceMap,vSurfacePosition.xz*surfaceScale).rgb;
vec3 tz=texture2D(surfaceMap,vSurfacePosition.xy*surfaceScale).rgb;
diffuseColor.rgb *= mix(vec3(1.0),tx*sw.x+ty*sw.y+tz*sw.z,0.55);`,
    );
  };
  material.customProgramCacheKey = () => kind;
}
