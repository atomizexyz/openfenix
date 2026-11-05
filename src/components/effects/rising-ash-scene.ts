/**
 * Rising-ash particle system for the hero.
 *
 * One instanced draw call. Every particle is a pure function of time on the
 * GPU -- spawn, buoyant rise, turbulence, cooling, tumble -- so the CPU does no
 * per-particle work: each frame it only advances one uniform. Three kinds of
 * particle share the geometry and branch on `type`:
 *
 *  - embers: hot fragments that cool along a blackbody ramp as they rise,
 *    flicker as oxygen reaches them, streak with shutter-speed motion blur,
 *    and leave a faint grey speck once they go dark;
 *  - sparks: short-lived, fast, hotter fragments that arc and streak hard;
 *  - flakes: larger irregular ash flakes that tumble (a flip reads as a width
 *    squash plus a glint as the face catches the firelight), some carrying a
 *    burning edge that dies back as they climb.
 *
 * Depth of field is a thin-lens circle of confusion per particle, so embers
 * nearer than the focal plane open into soft bokeh discs. Instances are sorted
 * far-to-near once at build time; depth is fixed per instance, so
 * premultiplied "over" blending stays correctly ordered without a per-frame
 * sort.
 *
 * This module is imported dynamically by rising-ash.tsx, which keeps three.js
 * out of the initial bundle.
 */
import {
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  BufferAttribute,
  CustomBlending,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  AddEquation,
} from "three";

export interface AshScene {
  setLight(light: boolean): void;
  setRunning(running: boolean): void;
  dispose(): void;
}

interface AshSceneOptions {
  light: boolean;
  /** Render a single settled frame and never animate. */
  still: boolean;
  /** Called once after the first frame is on screen. */
  onFirstFrame?: () => void;
}

const FOV = 40;
const CAMERA_Z = 10;
const MAX_PIXEL_RATIO = 1.75;
const FRAME_BUDGET_MS = 1000 / 60 - 1; // cap 120Hz displays at 60fps
/** Viewport area (CSS px) at which the field runs at full density. */
const FULL_DENSITY_AREA = 1440 * 900;
const MIN_DENSITY = 0.4;

const TYPE_EMBER = 0;
const TYPE_SPARK = 1;
const TYPE_FLAKE = 2;

const COUNTS: Record<number, number> = {
  [TYPE_EMBER]: 340,
  [TYPE_SPARK]: 44,
  [TYPE_FLAKE]: 150,
};

/* -------------------------------------------------------------------------- */
/* GLSL                                                                       */
/* -------------------------------------------------------------------------- */

// Ashima Arts / Stefan Gustavson 3D simplex noise (MIT).
const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

// Tanner Helland's blackbody fit, valid ~1000K-6600K, in linear-ish RGB.
const BLACKBODY = /* glsl */ `
vec3 blackbody(float kelvin){
  float t=kelvin/100.0;
  float g=clamp((99.4708025861*log(t)-161.1195681661)/255.0,0.0,1.0);
  float b=t<=19.0?0.0:clamp((138.5177312231*log(t-10.0)-305.0447927307)/255.0,0.0,1.0);
  return vec3(1.0,g,b);
}
`;

const VERTEX = /* glsl */ `
precision highp float;

attribute vec4 aSeed;    // four uniform randoms
attribute vec4 aParams;  // type, lifetime (s), phase offset (s), radius (world)
attribute float aDepth;  // world z, fixed per instance (enables a one-time sort)

uniform float uTime;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uCameraZ;
uniform float uViewportH;   // drawing-buffer height in px
uniform float uFocus;       // focal distance from the camera
uniform float uAperture;    // thin-lens coc scale
uniform float uDensity;     // 0..1 share of instances to draw
uniform float uLight;       // 0 dark theme, 1 light theme

varying vec2 vUv;
varying float vHalfSeg;
varying float vType;
varying float vT;
varying float vBlur;
varying float vEnergy;
varying vec3 vEmit;
varying vec4 vSeed;
varying float vFlip;
varying float vHeight;

${SIMPLEX}
${BLACKBODY}

float hash11(float p){
  p=fract(p*0.1031);
  p*=p+33.33;
  p*=p+p;
  return fract(p);
}

// World-space position of a particle 'age' seconds into its current life.
vec3 simulate(float age, float lifeT, float cycle, float type){
  float h1=hash11(cycle*17.13+aSeed.x*91.7);
  float h2=hash11(cycle*5.71+aSeed.y*47.3);
  float z=aDepth;
  float halfH=uTanHalfFov*(uCameraZ-z);
  float halfW=halfH*uAspect;

  vec3 p;
  p.z=z;
  p.x=(fract(aSeed.w+h1)*2.0-1.0)*halfW*1.08;
  p.y=-halfH-0.15-h2*0.5;

  // Noise space is per particle *and* per cycle, so a respawn never retraces
  // the path it took last time.
  vec3 n0=vec3(aSeed.xy*37.0+h1*13.0,0.0);

  if(type<0.5){
    // Ember: buoyant plume that slows as the fragment cools.
    float v0=0.95+aSeed.z*1.15;
    p.y+=v0*age-0.045*age*age;
    float tf=age*0.5;
    float amp=mix(0.12,0.95,lifeT);
    p.x+=snoise(n0+vec3(0.0,0.0,tf))*amp;
    p.z+=snoise(n0+vec3(19.1,7.3,tf))*amp*0.6;
    p.y+=snoise(n0+vec3(3.7,41.9,tf*1.7))*0.18;
    p.x+=sin(age*(3.0+aSeed.y*4.0)+aSeed.x*6.28)*0.025;
  }else if(type<1.5){
    // Spark: launched hard from low in the frame, arcing under drag.
    p.y+=h2*halfH*0.6;
    float v0=3.2+aSeed.z*2.6;
    float vx=(h1-0.5)*2.2;
    float drag=1.0-exp(-1.6*age);
    p.y+=v0*drag/1.6-0.35*age*age;
    p.x+=vx*drag/1.6;
    p.x+=snoise(n0+vec3(0.0,0.0,age*1.5))*0.12*age;
  }else{
    // Flake: slow rise with broad lateral flutter, like paper ash.
    float v0=0.38+aSeed.z*0.45;
    p.y+=v0*age;
    float tf=age*0.32;
    float amp=mix(0.35,1.5,lifeT);
    p.x+=snoise(n0+vec3(0.0,0.0,tf))*amp;
    p.z+=snoise(n0+vec3(11.3,5.1,tf))*amp*0.5;
    p.y+=snoise(n0+vec3(2.9,23.1,tf*1.3))*0.35;
    p.x+=sin(age*(1.1+aSeed.y*1.3)+aSeed.x*6.28)*0.12;
  }

  // Slow shared crosswind; cumulative with age so older particles lean.
  float wind=sin(uTime*0.071)*0.16+sin(uTime*0.023+1.7)*0.1;
  p.x+=wind*age;
  return p;
}

void main(){
  float type=aParams.x;
  float life=aParams.y;
  float radius=aParams.w;
  vType=type;
  vSeed=aSeed;

  // Thin the field on small screens without rebuilding buffers.
  if(fract(aSeed.x*7.13+aSeed.z*3.71)>uDensity){
    gl_Position=vec4(2.0,2.0,2.0,1.0);
    return;
  }

  float clock=uTime+aParams.z;
  float cycle=floor(clock/life);
  float age=clock-cycle*life;
  float lifeT=age/life;
  vT=lifeT;

  vec3 p1=simulate(age,lifeT,cycle,type);
  float dt=0.04;
  vec3 p0=simulate(max(age-dt,0.0),max(lifeT-dt/life,0.0),cycle,type);
  vec4 c1=modelViewMatrix*vec4(p1,1.0);
  vec4 c0=modelViewMatrix*vec4(p0,1.0);
  vec2 vel=(c1.xy-c0.xy)/dt;

  float dist=-c1.z;
  float pxPerUnit=uViewportH/(2.0*uTanHalfFov*dist);
  vHeight=clamp(c1.y/(uTanHalfFov*dist)*0.5+0.5,0.0,1.0);

  // Thin-lens defocus, as a world-space radius at this depth.
  // Capped so the deepest particles soften rather than balloon into blobs.
  float coc=min(uAperture*abs(dist-uFocus),radius*5.0);
  float r=sqrt(radius*radius+coc*coc);
  // Spread-out light is dimmer per pixel, but an ember is far brighter than
  // the display can show, so a defocused one keeps more apparent brightness
  // than strict r^2 conservation would leave it.
  float energy=pow(radius/r,1.35);

  // Never let a particle fall below ~0.7px: sub-pixel sprites shimmer.
  float minR=0.7/pxPerUnit;
  if(r<minR){
    energy*=(r*r)/(minR*minR);
    r=minR;
  }
  vBlur=clamp(coc/r,0.0,1.0);

  vec2 dir;
  float halfLen;
  float halfWid;
  float seg=0.0;
  float flip=1.0;

  if(type<1.5){
    // Shutter-speed motion blur: sparks get a slower "shutter" so they streak.
    float shutter=type<0.5?1.0/45.0:1.0/14.0;
    float speed=length(vel);
    // A defocused streak is mostly disc; keep the smear to the sharp ones.
    seg=speed*shutter*0.5*(1.0-0.75*vBlur);
    dir=speed>1e-4?vel/speed:vec2(0.0,1.0);
    float ext=type<0.5?mix(7.0,1.35,vBlur):5.0;
    halfLen=seg+r*ext;
    halfWid=r*ext;
    energy*=r/(r+seg);
    vUv=vec2(position.x*halfLen,position.y*halfWid)/r;
    vHalfSeg=seg/r;

    // Cooling: sparks start hotter and die faster than embers.
    float hot=type<0.5?mix(1450.0,1950.0,aSeed.y):mix(2100.0,2600.0,aSeed.y);
    float cool=pow(lifeT,mix(0.55,1.1,aSeed.z));
    float kelvin=mix(hot,620.0,cool);
    // Oxygen flicker: fast, irregular, never fully out.
    float flicker=0.72+0.28*snoise(vec3(aSeed.x*53.0,aSeed.y*17.0,uTime*(5.0+aSeed.w*6.0)));
    kelvin*=mix(0.93,1.04,flicker);
    // HDR: a live ember is several times brighter than display white, which
    // is what lets its core roll off to yellow-white under the film curve.
    float radiance=pow(kelvin/1500.0,4.0)*(type<0.5?5.0:7.0);
    vEmit=blackbody(kelvin)*radiance*energy*flicker;
  }else{
    // Tumble: in-plane spin plus an out-of-plane flip read as a width squash.
    float spin=(aSeed.y-0.5)*2.4;
    float ang=aSeed.x*6.2831+age*spin;
    dir=vec2(cos(ang),sin(ang));
    flip=cos(age*(0.9+aSeed.w*1.8)+aSeed.z*6.2831);
    float ext=1.25+vBlur*0.6;
    halfLen=r*ext;
    halfWid=r*ext*max(abs(flip),0.14);
    vUv=vec2(position.x,position.y)*ext;
    vHalfSeg=0.0;
    vEmit=vec3(0.0);
  }
  vFlip=flip;
  vEnergy=energy;

  vec2 perp=vec2(-dir.y,dir.x);
  vec3 viewPos=c1.xyz+vec3(dir*position.x*halfLen+perp*position.y*halfWid,0.0);
  gl_Position=projectionMatrix*vec4(viewPos,1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform float uLight;

varying vec2 vUv;
varying float vHalfSeg;
varying float vType;
varying float vT;
varying float vBlur;
varying float vEnergy;
varying vec3 vEmit;
varying vec4 vSeed;
varying float vFlip;
varying float vHeight;

${BLACKBODY}

float hash12(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*0.1031);
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
float vnoise(vec2 p){
  vec2 i=floor(p);
  vec2 f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1.0,0.0)),u.x),
             mix(hash12(i+vec2(0.0,1.0)),hash12(i+vec2(1.0,1.0)),u.x),u.y)*2.0-1.0;
}
float fbm(vec2 p){
  float s=0.0;
  float a=0.5;
  for(int i=0;i<4;i++){
    s+=a*vnoise(p);
    p=p*2.03+vec2(17.1,9.7);
    a*=0.5;
  }
  return s;
}

// Exponential film response: hot cores roll to white instead of clipping.
vec3 film(vec3 c,float exposure){
  return 1.0-exp(-c*exposure);
}

void main(){
  float fadeIn=smoothstep(0.0,0.05,vT);
  float fadeOut=1.0-smoothstep(0.8,1.0,vT);
  float fade=fadeIn*fadeOut;

  vec3 rgb;
  float alpha;

  if(vType<1.5){
    // Capsule distance (in radii) to the motion-blurred streak.
    float d=length(vec2(max(abs(vUv.x)-vHalfSeg,0.0),vUv.y));

    // Sharp: gaussian core. Defocused: a flat disc with a faint bright rim,
    // which is what an out-of-focus point light looks like through a lens.
    float sharp=exp(-d*d*2.2);
    float disc=smoothstep(1.0,0.82,d)*(0.78+0.22*smoothstep(0.5,0.95,d));
    float core=mix(sharp,disc,smoothstep(0.15,0.85,vBlur));
    // Bloom stand-in, weaker on a light page where glow reads as smudge.
    float halo=exp(-d*1.3)*mix(0.09,0.03,uLight)*(1.0-vBlur*0.8);

    float exposure=mix(1.8,1.05,uLight);
    vec3 emit=film(vEmit*(core+halo),exposure)*fade;

    // A cooled ember is a speck of grey ash. On a dark page it vanishes; on a
    // light page it is what you actually see once the glow has gone.
    float speck=smoothstep(1.25,0.55,d)*smoothstep(0.35,0.95,vT)*(1.0-vBlur)*fade;
    float speckCov=speck*mix(0.0,0.55,uLight)*step(vType,0.5);
    vec3 ash=vec3(0.16,0.14,0.13);

    rgb=emit+ash*speckCov;
    // Premultiplied over. Alpha tracks emission so glow stays valid on any
    // background; a light page also gets a touch more body behind the core.
    float glowAlpha=max(max(emit.r,emit.g),emit.b);
    alpha=clamp(glowAlpha*mix(0.92,1.0,uLight)+speckCov,0.0,1.0);
  }else{
    // Irregular flake silhouette from radial noise, softened by defocus.
    vec2 p=vUv;
    float r=length(p);
    float ang=atan(p.y,p.x);
    float edge=fbm(vec2(cos(ang),sin(ang))*1.6+vSeed.xy*31.0);
    float rad=0.68+0.3*edge;
    float sd=r-rad;
    float aa=fwidth(sd)*1.2+vBlur*0.45;
    float mask=1.0-smoothstep(-aa,aa,sd);

    // Mottled, occasionally holed paper ash.
    float tex=fbm(p*2.6+vSeed.zw*23.0);
    mask*=smoothstep(-0.62,-0.42,tex+vBlur*0.4);
    if(mask<0.002)discard;

    float whiteness=vSeed.x*vSeed.x;
    vec3 charcoal=vec3(0.07,0.065,0.06);
    vec3 paleAsh=vec3(0.62,0.6,0.57);
    vec3 albedo=mix(charcoal,paleAsh,whiteness)*(0.82+0.36*tex);

    // Lit from the fire below: warm and strong near the bottom of the frame,
    // cooler higher up. The flip turns the face into and out of the light, so
    // a tumbling flake glints rather than sitting at one brightness.
    float face=abs(vFlip);
    float fireFall=pow(1.0-vHeight,1.6);
    vec3 fire=vec3(1.0,0.48,0.16)*(0.25+1.6*fireFall);
    vec3 ambient=mix(vec3(0.42,0.4,0.39),vec3(0.9,0.86,0.82),uLight);
    float glint=pow(face,6.0)*0.6*fireFall;
    vec3 lit=albedo*(ambient+fire*(0.35+0.65*face))+vec3(1.0,0.62,0.3)*glint*albedo;

    // A burning rim on some flakes, patchy along its length, dying back as
    // the flake climbs away from the heat.
    float burns=step(0.5,vSeed.w);
    float band=smoothstep(-0.2,-0.02,sd)*mask;
    float patchy=smoothstep(-0.1,0.35,fbm(vec2(ang*2.2,vSeed.z*9.0)));
    float life=1.0-smoothstep(0.08,0.55,vT);
    float kelvin=mix(950.0,1350.0,patchy);
    vec3 rim=blackbody(kelvin)*pow(kelvin/1500.0,4.0)*band*patchy*life*burns*vEnergy*3.0;
    vec3 emit=film(rim,1.6);

    float cov=mask*fade*mix(0.82,0.9,uLight)*mix(1.0,0.55,vBlur);
    rgb=lit*cov+emit*fade;
    alpha=clamp(cov+max(max(emit.r,emit.g),emit.b)*fade,0.0,1.0);
  }

  if(alpha<0.002)discard;
  gl_FragColor=vec4(rgb,alpha);
}
`;

// Warm light thrown up from the unseen fire below the frame.
const GLOW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv=uv;
  gl_Position=vec4(position.xy,0.0,1.0);
}
`;

const GLOW_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uFlicker;
uniform float uStrength;
varying vec2 vUv;
void main(){
  float x=vUv.x*2.0-1.0;
  float g=pow(1.0-vUv.y,3.2)*(1.0-0.35*x*x);
  vec3 c=vec3(1.0,0.36,0.08)*g*uStrength*uFlicker;
  float a=clamp(g*uStrength*uFlicker*0.9,0.0,1.0);
  gl_FragColor=vec4(c,a);
}
`;

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

// Small deterministic PRNG so the field is identical across reloads.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Instance {
  seed: [number, number, number, number];
  params: [number, number, number, number];
  depth: number;
}

function buildInstances(): Instance[] {
  const rand = mulberry32(0xf3e1);
  const out: Instance[] = [];

  for (const [typeKey, count] of Object.entries(COUNTS)) {
    const type = Number(typeKey);
    for (let i = 0; i < count; i++) {
      const seed: Instance["seed"] = [rand(), rand(), rand(), rand()];
      let life: number;
      let radius: number;
      let depth: number;

      if (type === TYPE_EMBER) {
        life = 4.5 + rand() * 4.5;
        // Mostly fine fragments with a long tail of larger ones.
        radius = 0.009 + Math.pow(rand(), 2.2) * 0.03;
        depth = -7 + rand() * 10.5;
      } else if (type === TYPE_SPARK) {
        life = 0.9 + rand() * 1.1;
        radius = 0.006 + rand() * 0.008;
        depth = -3 + rand() * 5;
      } else {
        life = 11 + rand() * 9;
        radius = 0.035 + Math.pow(rand(), 1.6) * 0.09;
        depth = -6 + rand() * 9;
      }

      out.push({ seed, params: [type, life, rand() * life, radius], depth });
    }
  }

  // Far to near: depth is constant per instance, so this order stays correct.
  out.sort((a, b) => a.depth - b.depth);
  return out;
}

function createParticleGeometry() {
  const instances = buildInstances();
  const geometry = new InstancedBufferGeometry();

  // A unit quad as two triangles; corners in [-1, 1].
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
      3
    )
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const seeds = new Float32Array(instances.length * 4);
  const params = new Float32Array(instances.length * 4);
  const depths = new Float32Array(instances.length);
  instances.forEach((instance, i) => {
    seeds.set(instance.seed, i * 4);
    params.set(instance.params, i * 4);
    depths[i] = instance.depth;
  });

  geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute("aParams", new InstancedBufferAttribute(params, 4));
  geometry.setAttribute("aDepth", new InstancedBufferAttribute(depths, 1));
  geometry.instanceCount = instances.length;
  return geometry;
}

const premultipliedOver = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  premultipliedAlpha: true,
} as const;

export function createAshScene(
  canvas: HTMLCanvasElement,
  { light, still, onFirstFrame }: AshSceneOptions
): AshScene | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
  } catch {
    return null; // No WebGL: the hero still has its CSS glow.
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  const glowMaterial = new ShaderMaterial({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: {
      uFlicker: { value: 1 },
      uStrength: { value: light ? 0 : 0.3 },
    },
    ...premultipliedOver,
  });
  const glowGeometry = new PlaneGeometry(2, 2);
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.frustumCulled = false;
  glow.renderOrder = 0;
  scene.add(glow);

  const uniforms = {
    uTime: { value: still ? 24 : 0 },
    uTanHalfFov: { value: Math.tan(((FOV / 2) * Math.PI) / 180) },
    uAspect: { value: 1 },
    uCameraZ: { value: CAMERA_Z },
    uViewportH: { value: 1 },
    uFocus: { value: CAMERA_Z },
    uAperture: { value: 0.012 },
    uDensity: { value: 1 },
    uLight: { value: light ? 1 : 0 },
  };
  const particleGeometry = createParticleGeometry();
  const particleMaterial = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    ...premultipliedOver,
  });
  const particles = new Mesh(particleGeometry, particleMaterial);
  particles.frustumCulled = false; // positions are computed on the GPU
  particles.renderOrder = 1;
  scene.add(particles);

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    uniforms.uAspect.value = camera.aspect;
    uniforms.uViewportH.value = height * pixelRatio;
    uniforms.uDensity.value = Math.min(
      1,
      Math.max(MIN_DENSITY, (width * height) / FULL_DENSITY_AREA)
    );
  };

  let firstFrameSent = false;
  const render = () => {
    renderer.render(scene, camera);
    if (!firstFrameSent) {
      firstFrameSent = true;
      onFirstFrame?.();
    }
  };

  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (still || !running) render();
  });
  resizeObserver.observe(canvas);
  resize();

  let running = false;
  let frame = 0;
  let last = 0;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const elapsed = now - last;
    if (elapsed < FRAME_BUDGET_MS) return;
    // Clamp so a long pause resumes smoothly instead of jumping the field.
    uniforms.uTime.value += Math.min(elapsed, 100) / 1000;
    last = now;
    const time = uniforms.uTime.value;
    glowMaterial.uniforms.uFlicker.value =
      0.86 +
      0.08 * Math.sin(time * 7.3) +
      0.05 * Math.sin(time * 13.1 + 1.3) +
      0.04 * Math.sin(time * 2.1);
    render();
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    running = false;
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  render();

  return {
    setLight(next) {
      uniforms.uLight.value = next ? 1 : 0;
      glowMaterial.uniforms.uStrength.value = next ? 0 : 0.3;
      if (still || !running) render();
    },
    setRunning(next) {
      if (still || next === running) return;
      running = next;
      if (running) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(frame);
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      particleGeometry.dispose();
      particleMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      renderer.dispose();
    },
  };
}
