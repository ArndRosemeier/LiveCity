import * as T from "three";
import { Random } from "./random";
let shared: T.Material[] | undefined;
// Original procedural maps and freshly generated photographic pigment plates.
// Shared across residents so
// identity variation costs geometry/color data, not a texture set per NPC.
export function humanMaterials() {
  if (shared) return shared;
  const size = 512,
    r = new Random("epidermis-weave-fibres-v2"),
    skin = new Uint8Array(size * size * 4),
    rough = new Uint8Array(size * size * 4),
    albedo = new Uint8Array(size * size * 4),
    fabric = new Uint8Array(size * size * 4),
    strands = new Uint8Array(size * size * 4);
  const pores = Array.from({ length: 1300 }, () => ({
    x: r.range(0, size),
    y: r.range(0, size),
    radius: r.range(0.7, 2.1),
  }));
  const height = new Float32Array(size * size);
  height.fill(0.55);
  for (const pore of pores)
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5; dx <= 5; dx++) {
        const x = (Math.floor(pore.x) + dx + size) % size,
          y = (Math.floor(pore.y) + dy + size) % size,
          distance = ((dx + 0.5) ** 2 + (dy + 0.5) ** 2) / pore.radius ** 2;
        height[y * size + x] -= 0.13 * Math.exp(-distance);
      }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        n = r.range(-1, 1),
        grain =
          Math.sin(x * 0.17) * Math.sin(y * 0.19) * 0.018 +
          Math.sin(x * 0.047 + y * 0.038) * 0.017,
        h =
          T.MathUtils.clamp(height[y * size + x] + grain + n * 0.018, 0, 1) *
          255,
        pigment = 247 + 5 * Math.sin(x * 0.039) * Math.sin(y * 0.031) + n * 2,
        weave = Math.sin((x * Math.PI) / 4) * Math.sin((y * Math.PI) / 4),
        threads = 177 + weave * 29 + n * 5,
        fibre = 190 + Math.sin(x * 0.44 + Math.sin(y * 0.022) * 2) * 38 + n * 7;
      skin[i] = skin[i + 1] = skin[i + 2] = h;
      skin[i + 3] = 255;
      rough[i] =
        rough[i + 1] =
        rough[i + 2] =
          170 + n * 12 + (height[y * size + x] - 0.55) * 60;
      rough[i + 3] = 255;
      albedo[i] = pigment;
      albedo[i + 1] = pigment - 1;
      albedo[i + 2] = pigment - 2;
      albedo[i + 3] = 255;
      fabric[i] = fabric[i + 1] = fabric[i + 2] = threads;
      fabric[i + 3] = 255;
      strands[i] = strands[i + 1] = strands[i + 2] = fibre;
      strands[i + 3] = 255;
    }
  const texture = (data: Uint8Array, color = false) => {
    const t = new T.DataTexture(data, size, size);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const poresMap = texture(skin),
    skinColor = texture(albedo, true),
    roughness = texture(rough),
    weave = texture(fabric),
    fiber = texture(strands);
  const flesh = new T.MeshPhysicalMaterial({
    vertexColors: true,
    map: skinColor,
    roughness: 0.68,
    roughnessMap: roughness,
    bumpMap: poresMap,
    bumpScale: 0.00024,
    specularIntensity: 0.45,
    ior: 1.4,
    clearcoat: 0,
  });
  const photoDetail = { value: 0 };
  const portraitAtlas = { value: skinColor as T.Texture };
  const portraitReady = { value: 0 };
  if (typeof window !== "undefined") {
    new T.TextureLoader().load(
      new URL("../public/textures/face-atlas.png", import.meta.url).href,
      (texture) => {
        texture.colorSpace = T.SRGBColorSpace;
        texture.anisotropy = 8;
        portraitAtlas.value = texture;
        portraitReady.value = 1;
      },
    );
    new T.TextureLoader().load(
      new URL("../public/textures/skin-detail.png", import.meta.url).href,
      (texture) => {
        texture.colorSpace = T.SRGBColorSpace;
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.anisotropy = 4;
        flesh.map = texture;
        photoDetail.value = 1;
        flesh.needsUpdate = true;
      },
    );
  }
  // Low-cost diffusion and thin-tissue backscatter, with the shadowed incident
  // light. This is an approximation, not path-traced random-walk SSS.
  flesh.onBeforeCompile = (shader) => {
    shader.uniforms.skinPhotoDetail = photoDetail;
    shader.uniforms.portraitAtlas = portraitAtlas;
    shader.uniforms.portraitReady = portraitReady;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float tissue; varying float vTissue; attribute vec4 portrait; varying vec4 vPortrait;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvTissue=tissue; vPortrait=portrait;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vTissue; uniform float skinPhotoDetail; varying vec4 vPortrait; uniform sampler2D portraitAtlas; uniform float portraitReady;",
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
        vec4 skinTexel=texture2D(map,vMapUv);
        vec3 pigment=clamp(skinTexel.rgb/vec3(0.694,0.420,0.304),vec3(0.65),vec3(1.35));
        diffuseColor.rgb*=mix(skinTexel.rgb,pigment,skinPhotoDetail);
      #endif
      float id=floor(vPortrait.w+0.5);
      vec2 atlasUv=vec2((mod(id,2.0)+vPortrait.x)*.5,1.0-(floor(id/2.0)+vPortrait.y)*.5);
      vec3 plate=texture2D(portraitAtlas,atlasUv).rgb;
      vec3 reference=id<.5?vec3(.55,.33,.20):id<1.5?vec3(.21,.10,.05):id<2.5?vec3(.56,.34,.20):vec3(.48,.27,.19);
      vec3 facialPigment=clamp(plate/reference,vec3(.06),vec3(1.9));
      float photographMask=1.0-smoothstep(.90,.98,min(plate.r,min(plate.g,plate.b)));
      diffuseColor.rgb=mix(diffuseColor.rgb,facialPigment,vPortrait.z*portraitReady*photographMask);`,
      )
      .replace(
        "#include <lights_physical_pars_fragment>",
        `#include <lights_physical_pars_fragment>
void RE_Direct_Skin(const in IncidentLight incident, const in vec3 position, const in vec3 n,
  const in vec3 view, const in vec3 coat, const in PhysicalMaterial material, inout ReflectedLight reflected) {
  RE_Direct_Physical(incident,position,n,view,coat,material,reflected);
  float ndl=dot(n,incident.direction);
  float wrap=max(0.0,(ndl+0.45)/1.45)-max(0.0,ndl);
  float transmission=pow(max(0.0,dot(-incident.direction,view)),5.0);
  reflected.directDiffuse+=incident.color*material.diffuseColor*vec3(1.0,0.38,0.17)*
    (wrap*0.18+transmission*0.08)*vTissue;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin`,
      );
  };
  flesh.customProgramCacheKey = () => "epidermis-portrait-v3";
  shared = [
    flesh,
    new T.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.89,
      bumpMap: weave,
      bumpScale: 0.00032,
      sheen: 0.35,
      sheenColor: new T.Color(0.35, 0.35, 0.35),
      sheenRoughness: 0.83,
    }),
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.52 }),
    new T.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.09,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      specularIntensity: 1,
      ior: 1.376,
    }),
    new T.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.46,
      bumpMap: fiber,
      bumpScale: 0.00013,
      anisotropy: 0.68,
      anisotropyRotation: Math.PI / 2,
      sheen: 0.22,
      sheenRoughness: 0.5,
      sheenColor: new T.Color(0.2, 0.2, 0.2),
      side: T.DoubleSide,
    }),
  ];
  return shared;
}
