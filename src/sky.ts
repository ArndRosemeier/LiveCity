import * as T from "three";
export class Sky {
  mesh: T.Mesh;
  private uniforms = {
    top: { value: new T.Color(0x779eaf) },
    horizon: { value: new T.Color(0xd3d2b4) },
    sun: { value: new T.Vector3(-0.7, 0.4, 0.3) },
    night: { value: 0 },
  };
  constructor() {
    const material = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: `varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 vDirection;uniform vec3 top;uniform vec3 horizon;uniform vec3 sun;uniform float night;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){vec3 d=normalize(vDirection);float y=max(d.y,0.);vec3 col=mix(horizon,top,pow(y,.55));float s=max(dot(d,normalize(sun)),0.);col+=vec3(1.,.7,.36)*pow(s,40.)*.22*(1.-night);col+=vec3(1.,.88,.65)*smoothstep(.99965,.99985,s)*(1.-night);vec2 uv=d.xz/max(.15,d.y+.15)*2.5;float n=noise(uv)*.6+noise(uv*2.1)*.25+noise(uv*4.1)*.15;float cloud=smoothstep(.59,.74,n)*smoothstep(.04,.25,y)*.34;col=mix(col,vec3(.95,.91,.81),cloud*(1.-night));gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
    });
    this.mesh = new T.Mesh(new T.SphereGeometry(490, 32, 16), material);
    this.mesh.renderOrder = -1;
  }
  update(hour: number, direction: T.Vector3) {
    const night = T.MathUtils.clamp((hour - 18) / 3, 0, 1);
    this.uniforms.night.value = night;
    this.uniforms.sun.value.copy(direction).normalize();
    this.uniforms.top.value.lerpColors(
      new T.Color(0x779eaf),
      new T.Color(0x14283e),
      night,
    );
    this.uniforms.horizon.value.lerpColors(
      new T.Color(0xd3d2b4),
      new T.Color(0x7a788a),
      night,
    );
  }
}
