/**
 * Rising-ash scene for the hero, modelled on a long-exposure photograph of a
 * fire rather than on a particle demo.
 *
 * Three layers, four draw calls, no per-particle CPU work -- every particle
 * is a pure function of time evaluated on the GPU. The CPU advances the clock
 * and flickers the two shared fire lights each frame:
 *
 *  1. Smoke: a quarter-resolution ray march through a rising 3D density field.
 *     Light scatters from the same flickering fire sources that light the ash.
 *  2. Fragments: folded 3D surfaces with a standard PBR material, mineral grain,
 *     and glowing charcoal fissures. Two point lights and a cool sky fill light
 *     the faces as they tumble and cool.
 *  3. Embers and sparks: thin ribbons following their actual trajectory, with
 *     a bright leading tip, a flickering orange streak, and a widening smoke
 *     wake. The wake curls and dissipates behind the hot fragment in the same
 *     instanced draw. HDR cores bleach toward white under a film curve; a
 *     narrow pixel-space glow stands in for lens bloom.
 *
 * Embers cool along a blackbody ramp as they rise and leave a faint grey speck
 * once dark. Ember defocus is restrained to preserve the fine glowing lines.
 * Instances are sorted far-to-near once (depth is fixed per instance), so
 * premultiplied "over" blending stays ordered without a per-frame sort.
 *
 * Imported dynamically by rising-ash.tsx, which keeps three.js out of the
 * initial bundle.
 */
import {
  ACESFilmicToneMapping,
  AddEquation,
  BufferAttribute,
  CustomBlending,
  DoubleSide,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NoBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { createAshMaterialAtlas } from "./ash-material-atlas";
import { createAshNoiseVolume } from "./ash-noise-volume";

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
/** Smoke render-target scale relative to the drawing buffer. */
const SMOKE_SCALE = 0.25;
/** Segments along each ember trail. */
const TRAIL_SEGMENTS = 10;

const TYPE_EMBER = 0;
const TYPE_SPARK = 1;
const TYPE_FLAKE = 2;

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

// Tanner Helland's blackbody color fit, converted from sRGB to linear light.
const BLACKBODY = /* glsl */ `
vec3 blackbody(float kelvin){
  float t=kelvin/100.0;
  float g=clamp((99.4708025861*log(t)-161.1195681661)/255.0,0.0,1.0);
  float b=t<=19.0?0.0:clamp((138.5177312231*log(t-10.0)-305.0447927307)/255.0,0.0,1.0);
  return pow(vec3(1.0,g,b),vec3(2.2));
}
`;

// Exponential film response on the peak channel, so hue survives (per-channel
// rolloff drifts orange toward olive); only the hottest cores bleach to white.
const FILM = /* glsl */ `
vec3 film(vec3 c,float exposure){
  float peak=max(max(c.r,c.g),c.b);
  if(peak<0.00001)return vec3(0.0);
  float mapped=1.0-exp(-peak*exposure);
  vec3 hue=c/peak;
  vec3 linear=mix(hue,vec3(1.0,0.87,0.64),smoothstep(2.0,16.0,peak*exposure)*0.72)*mapped;
  return pow(max(linear,vec3(0.0)),vec3(1.0/2.2));
}

`;

const SURFACE = /* glsl */ `
vec2 rotate(vec2 p,float angle){
  float c=cos(angle),s=sin(angle);
  return mat2(c,-s,s,c)*p;
}

// Data atlas: mottling, hot fissures, folded surface height, signed distance.
vec4 surface(vec2 p){
  float tile=floor(vSeed.w*15.99);
  vec2 cell=vec2(mod(tile,4.0),floor(tile/4.0));
  vec2 uv=clamp(p*0.5+0.5,vec2(0.004),vec2(0.996));
  return texture2D(uSurface,(cell+uv)*0.25);
}

float silhouette(vec2 p,vec4 tex,float softness){
  float sd=(0.5-tex.a)*2.0;
  float aa=max(fwidth(sd),0.012)+softness;
  float bounds=1.0-smoothstep(0.9,1.0,max(abs(p.x),abs(p.y)));
  return (1.0-smoothstep(-aa,aa,sd))*bounds;
}

`;

// Shared particle uniforms, attributes and trajectory.
const PARTICLE_COMMON = /* glsl */ `
attribute vec4 aSeed;    // four uniform randoms
attribute vec4 aParams;  // type, lifetime (s), phase offset (s), radius (world)
attribute float aDepth;  // world z, fixed per instance (enables a one-time sort)

uniform float uTime;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uCameraZ;
uniform float uViewportH;   // drawing-buffer height in px
uniform float uPixelRatio;
uniform float uFocus;       // focal distance from the camera
uniform float uAperture;    // thin-lens coc scale
uniform float uDensity;     // 0..1 share of instances to draw
uniform float uLight;       // 0 dark theme, 1 light theme

${SIMPLEX}

float hash11(float p){
  p=fract(p*0.1031);
  p*=p+33.33;
  p*=p+p;
  return fract(p);
}

// World-space position of a particle 'age' seconds into its current life.
vec3 simulate(float age,float lifeT,float cycle,float type){
  float h1=hash11(cycle*17.13+aSeed.x*91.7);
  float h2=hash11(cycle*5.71+aSeed.y*47.3);
  float z=aDepth;
  float halfH=uTanHalfFov*(uCameraZ-z);
  float halfW=halfH*uAspect;

  vec3 p;
  p.z=z;
  p.x=(fract(aSeed.w+h1)*2.0-1.0)*halfW*1.08;
  p.y=-halfH-0.15-h2*0.5;

  // Neighboring births share shifting updrafts, creating uneven bursts.
  float birthTime=cycle*aParams.y-aParams.z;
  float lane=step(0.5,aSeed.w)*2.0-1.0;
  float source=lane*halfW*0.62+sin(birthTime*0.43+lane)*halfW*0.17;
  p.x=mix(p.x,source+(h1-0.5)*halfW*0.55,0.45);

  // Noise space is per particle *and* per cycle, so a respawn never retraces
  // the path it took last time.
  vec3 n0=vec3(aSeed.xy*37.0+h1*13.0,0.0);

  if(type<0.5){
    // Ember: buoyant plume that slows as the fragment cools, carried by
    // large eddies plus the tight corkscrew of the vortex shed behind it.
    float v0=0.95+aSeed.z*1.15;
    p.y+=v0*age-0.045*age*age;
    float tf=age*0.5;
    float amp=mix(0.12,0.95,lifeT);
    p.x+=snoise(n0+vec3(0.0,0.0,tf))*amp;
    p.y+=snoise(n0+vec3(3.7,41.9,tf*1.7))*0.18;
    float w=5.0+aSeed.y*9.0;
    float r=mix(0.015,0.07,aSeed.w)*(0.4+lifeT);
    p.x+=sin(age*w+aSeed.x*6.28)*r;
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
    p.y+=snoise(n0+vec3(2.9,23.1,tf*1.3))*0.35;
    p.x+=sin(age*(1.1+aSeed.y*1.3)+aSeed.x*6.28)*0.12;
  }

  // Coherent eddies move neighboring fragments together through the plume.
  // Keep depth fixed: flutter comes from tumble, preserving transparency order.
  float eddy=snoise(vec3(p.x*0.28,p.y*0.22,uTime*0.16));
  p.x+=eddy*min(age*0.12,0.7);
  p.y+=snoise(vec3(p.x*0.22+17.0,p.y*0.24,uTime*0.12))*0.14;

  // Slow shared crosswind; cumulative with age so older particles lean.
  float wind=sin(uTime*0.071)*0.16+sin(uTime*0.023+1.7)*0.1;
  p.x+=wind*age;
  return p;
}

vec3 viewAt(float age,float life,float cycle,float type){
  return (modelViewMatrix*vec4(simulate(age,age/life,cycle,type),1.0)).xyz;
}

bool culled(float type){
  // Thin the field on small screens without rebuilding buffers. On a light
  // page dark flakes read as dirt rather than ash, so keep fewer of them.
  float keep=uDensity*(type>1.5?mix(1.0,0.5,uLight):1.0);
  return fract(aSeed.x*7.13+aSeed.z*3.71)>keep;
}
`;

/* ---------------------------- Embers & sparks ----------------------------- */

const EMBER_VERTEX = /* glsl */ `
precision highp float;

// x: position along the trail, 0 = burning tip .. 1 = dissipating smoke
// y: side of the ribbon, -1 or 1
// z: end cap, -1 head cap, 1 tail cap, 0 body
attribute vec3 aStrip;

${PARTICLE_COMMON}
${BLACKBODY}

varying vec2 vPx;       // (cap distance, across distance) in px
varying float vCorePx;
varying float vHaloPx;
varying float vBlur;
varying vec3 vEmit;
varying float vT;
varying float vSpeck;
varying vec4 vSeed;
varying float vTrail;
varying float vAlong;
varying float vSmokePx;

void main(){
  float type=aParams.x;
  float life=aParams.y;
  float radius=aParams.w;

  if(culled(type)){
    gl_Position=vec4(2.0,2.0,2.0,1.0);
    return;
  }

  float clock=uTime+aParams.z;
  float cycle=floor(clock/life);
  float age=clock-cycle*life;

  // Keep a longer history for the smoke; only the leading portion emits.
  float span=type<0.5?mix(0.18,0.4,aSeed.w):mix(0.15,0.3,aSeed.w);
  float s=aStrip.x;
  vSeed=aSeed;
  vAlong=s;
  float rawAge=age-s*span;
  float ageS=max(rawAge,0.0);
  float tS=ageS/life;
  vT=tS;

  vec3 c=viewAt(ageS,life,cycle,type);
  vec3 ca=viewAt(max(ageS-0.012,0.0),life,cycle,type);
  vec3 cb=viewAt(ageS+0.012,life,cycle,type);
  vec2 tangent=cb.xy-ca.xy;
  float tl=length(tangent);
  tangent=tl>1e-6?tangent/tl:vec2(0.0,1.0);
  vec2 normal=vec2(-tangent.y,tangent.x);

  float dist=-c.z;
  float pxPerUnit=uViewportH/(2.0*uTanHalfFov*dist);
  float speedPx=tl/0.024*pxPerUnit;

  // Screen-space limits keep even the nearest fragments fine and linear.
  float rPx=clamp(radius*pxPerUnit,0.3*uPixelRatio,0.85*uPixelRatio);
  float cocPx=min(uAperture*abs(dist-uFocus)*uFocus/dist*pxPerUnit,0.55*uPixelRatio);
  float corePx=sqrt(rPx*rPx+cocPx*cocPx);
  // A defocused ember spreads its light, but it is far brighter than the
  // display, so it keeps more apparent brightness than strict r^2 would give.
  float energy=pow(rPx/corePx,1.7);
  float minPx=0.5*uPixelRatio;
  if(corePx<minPx){
    energy*=(corePx*corePx)/(minPx*minPx);
    corePx=minPx;
  }
  vBlur=clamp(cocPx/corePx,0.0,1.0);

  // Exposure is spread along the trail: each pixel only sees the ember for
  // the moment it passes, so fast trails are dimmer per pixel.
  energy*=pow(corePx/(corePx+speedPx*span*0.4),0.3);

  // Cooling along a blackbody ramp; sparks start hotter and die faster.
  float hot=type<0.5?mix(1800.0,2450.0,aSeed.y):mix(2300.0,2900.0,aSeed.y);
  float kelvin=mix(hot,750.0,pow(tS,mix(0.9,1.4,aSeed.z)));
  // Oxygen flicker sampled at each point's own moment of exposure, which is
  // what beads the trail.
  float flicker=0.66+0.34*snoise(vec3(aSeed.x*53.0,aSeed.y*17.0,(uTime-s*span)*(9.0+aSeed.w*14.0)));
  kelvin*=mix(0.92,1.04,flicker);
  float radiance=pow(kelvin/1500.0,4.0)*(type<0.5?5.5:10.0);
  float born=smoothstep(-0.015,0.0,rawAge);
  vEmit=blackbody(kelvin)*radiance*energy*flicker*born;
  // The grey speck a cooled ember leaves is a point, not a streak.
  vSpeck=type<0.5?born*(1.0-s):0.0;

  // Pixel-space glow: lens bloom is a property of the optics, not of the
  // ember's size, so it is sized in px rather than in world units.
  vTrail=s*speedPx*span/corePx;
  vCorePx=corePx;
  vHaloPx=mix(2.1,1.2,uLight)*uPixelRatio+corePx*0.4;
  vSmokePx=mix(0.8,4.5,pow(s,0.8))*uPixelRatio;
  float halfW=max(corePx*2.2+vHaloPx*3.0,vSmokePx*3.5);

  // The wake drifts after the ember has passed, with no separate particles.
  c.xy+=normal*sin(s*8.0+uTime*0.7+aSeed.x*23.0)*s*s*2.0*uPixelRatio/pxPerUnit;

  vec2 offsetPx=normal*aStrip.y*halfW-tangent*aStrip.z*halfW;
  vPx=vec2(aStrip.z*halfW,aStrip.y*halfW);
  gl_Position=projectionMatrix*vec4(c+vec3(offsetPx/pxPerUnit,0.0),1.0);
}
`;

const EMBER_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uLight;
uniform float uTime;
uniform sampler2D uSurface;

varying vec2 vPx;
varying float vCorePx;
varying float vHaloPx;
varying float vBlur;
varying vec3 vEmit;
varying float vT;
varying float vSpeck;
varying vec4 vSeed;
varying float vTrail;
varying float vAlong;
varying float vSmokePx;

${FILM}
${SURFACE}
${SIMPLEX}

void main(){
  float d=length(vPx);
  float dn=d/vCorePx;

  float core=exp(-dn*dn*2.0);
  // Material grain and exposed fissures break up the hot trail as the
  // fragment turns. Defocus averages this detail back into a soft light.
  vec2 materialUv=vec2(fract(vTrail*0.37+vSeed.y)*1.6-0.8,clamp(vPx.y/vCorePx,-1.0,1.0));
  vec4 tex=surface(materialUv);
  float fuel=0.3+tex.g*0.65+pow(tex.r,3.0)*0.4;
  core*=mix(fuel,1.0,smoothstep(0.2,0.8,vBlur));
  // Decay to black before the ribbon boundary, including after the display
  // transfer lifts low intensities. An exponential tail exposes the quad.
  float halo=exp(-1.5*d*d/(vHaloPx*vHaloPx))*mix(0.025,0.008,uLight);

  // A tiny white-hot leading point pulls a tapering orange line behind it.
  // Cap distance extends that point past the first row without a hard seam.
  vec2 headPx=vec2(vTrail*vCorePx+vPx.x,vPx.y);
  float tip=exp(-dot(headPx,headPx)/(vCorePx*vCorePx*0.85));
  float streak=pow(1.0-vAlong,1.5)*(1.0-smoothstep(0.3,0.65,vAlong));
  float heat=max(max(vEmit.r,vEmit.g),vEmit.b);
  vec3 tipEmit=mix(vEmit,heat*vec3(1.0,0.65,0.24),0.55)*tip*4.0;

  float fade=smoothstep(0.0,0.04,vT)*(1.0-smoothstep(0.8,1.0,vT));
  vec3 emit=film(vEmit*(core+halo)*streak+tipEmit,mix(1.8,1.05,uLight))*fade;
  // Defocused glow needs darkness around it to read; on a light page a
  // blurred ember is just a tinted smudge, so let it fall away.
  emit*=1.0-smoothstep(0.25,0.9,vBlur)*0.8*uLight;

  // Smoke expands, curls, and breaks up as it cools along the same wake.
  float wisp=snoise(vec3(vAlong*5.5+vSeed.x*31.0,vPx.y/vSmokePx*0.7,uTime*0.35+vSeed.y*17.0));
  float across=(vPx.y-wisp*vSmokePx*0.45)/vSmokePx;
  float smoke=exp(-across*across*1.8)*smoothstep(0.04,0.22,vAlong)*(1.0-smoothstep(0.35,1.0,vAlong));
  float smokeCov=smoke*(0.55+0.45*wisp)*fade*mix(0.34,0.13,uLight);
  vec3 smokeColor=mix(vec3(0.34,0.31,0.28),vec3(0.3,0.28,0.26),uLight);

  // The cooled fragment stays at the tip rather than darkening its wake.
  float speck=tip*smoothstep(0.35,0.95,vT)*(1.0-vBlur)*fade*vSpeck;
  float speckCov=speck*0.4*uLight;

  float glowAlpha=clamp(max(max(emit.r,emit.g),emit.b)+speckCov,0.0,1.0);
  float alpha=glowAlpha+smokeCov*(1.0-glowAlpha);
  if(alpha<0.002)discard;
  // Premultiplied over: alpha tracks emission, so the glow is valid on any
  // background, light or dark.
  gl_FragColor=vec4(emit+vec3(0.16,0.14,0.13)*speckCov+smokeColor*smokeCov*(1.0-glowAlpha),alpha);
}
`;

/* --------------------------------- Flakes --------------------------------- */

// These hooks retain Three.js's standard PBR lighting, tone mapping, and
// color management while moving every folded fragment on the GPU.
const FLAKE_TRANSFORM = /* glsl */ `
mat3 tumble(float age){
  vec3 a=aSeed.xyz*6.2831+age*vec3(0.7+aSeed.w,0.5+aSeed.y,aSeed.z-0.5);
  vec3 c=cos(a),s=sin(a);
  mat3 rx=mat3(1,0,0,0,c.x,s.x,0,-s.x,c.x);
  mat3 ry=mat3(c.y,0,-s.y,0,1,0,s.y,0,c.y);
  mat3 rz=mat3(c.z,s.z,0,-s.z,c.z,0,0,0,1);
  return rz*ry*rx;
}
`;

const FLAKE_NORMAL = /* glsl */ `
float clock=uTime+aParams.z;
float cycle=floor(clock/aParams.y);
float age=clock-cycle*aParams.y;
mat3 rotation=tumble(age);
vec2 foldPhase=position.xy*vec2(3.0,4.0)+aSeed.xy*6.2831;
vec2 slope=cos(foldPhase)*vec2(0.54,0.52);
slope.y/=mix(0.4,1.0,aSeed.y);
vec3 objectNormal=rotation*normalize(vec3(-slope,1.0));
`;

const FLAKE_POSITION = /* glsl */ `
vSeed=aSeed;
vUv=position.xy;
vT=age/aParams.y;
vType=aParams.x;
float r=aParams.w;
// Burning grains remain small enough to anchor the narrow streaks.
if(vType<1.5)r=min(r,0.013);
vec3 folded=vec3(position.x,position.y*mix(0.4,1.0,aSeed.y),dot(sin(foldPhase),vec2(0.18,0.13)));
vec3 transformed=rotation*folded*r+simulate(age,vT,cycle,vType);
if(culled(vType))transformed=vec3(10000.0);
`;

const FLAKE_COLOR = /* glsl */ `
vec4 ashTex=surface(vUv);
float mask=silhouette(vUv,ashTex,0.0);
float fade=smoothstep(0.0,0.045,vT)*(1.0-smoothstep(0.75,1.0,vT));
float mineral=smoothstep(0.2,0.8,ashTex.r);
float whiteness=vType<1.5?smoothstep(0.4,1.0,vT)*0.5:mix(0.15,0.9,pow(vSeed.x,0.65));
vec3 carbon=vec3(0.025,0.02,0.016);
vec3 ash=vec3(0.48,0.46,0.42);
diffuseColor.rgb*=mix(carbon,ash,whiteness*mineral)*(1.0-ashTex.g*0.6);
diffuseColor.a*=mask*fade*mix(0.85,0.55,uLight);
`;

const FLAKE_EMISSION = /* glsl */ `
float hotPatch=smoothstep(0.35,0.7,ashTex.r)*ashTex.g;
float sd=(0.5-ashTex.a)*2.0;
float edge=exp(-abs(sd+0.035)*26.0)*hotPatch;
float burning=vType<1.5?1.0:step(0.6,vSeed.z);
float heat=(1.0-smoothstep(0.1,0.75,vT))*burning;
float flicker=0.75+0.25*sin(uTime*(9.0+vSeed.w*11.0)+vSeed.x*19.0);
float kelvin=mix(750.0,vType<1.5?2200.0:1700.0,heat)*flicker;
totalEmissiveRadiance=blackbody(kelvin)*pow(heat,1.4)*(hotPatch*1.5+edge*3.0);
`;

/* --------------------------------- Smoke ---------------------------------- */

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv=uv;
  gl_Position=vec4(position.xy,0.0,1.0);
}
`;

const SMOKE_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uAspect;
uniform float uTanHalfFov;
uniform float uCameraZ;
uniform float uSmoke;
uniform float uGlow;
uniform float uFlicker;
uniform float uLight;
uniform vec3 uFirePosition[2];
uniform vec3 uFireColor[2];
uniform vec2 uFirePower;
uniform highp sampler3D uVolume;
varying vec2 vUv;

${BLACKBODY}
${FILM}

float volumeNoise(vec3 p){
  // Smooth interpolation within each voxel, with trilinear hardware filtering.
  vec3 cell=p*64.0-0.5;
  vec3 f=fract(cell);
  vec3 uv=(floor(cell)+f*f*(3.0-2.0*f)+0.5)/64.0;
  return texture(uVolume,uv).r;
}

float smokeDensity(vec3 p){
  vec3 q=p*vec3(0.016,0.012,0.016)-vec3(0.0,uTime*0.005,0.0);
  float curl=volumeNoise(q*0.45+vec3(0.0,0.0,uTime*0.001))-0.5;
  q.xz+=vec2(curl,sin(q.y*64.0+curl))*0.022;
  float n=volumeNoise(q)*0.75+volumeNoise(q*2.08+0.27)*0.25;
  return smoothstep(0.38,0.78,n);
}

void main(){
  vec2 screen=(vUv*2.0-1.0)*vec2(uAspect,1.0)*uTanHalfFov;
  vec3 ray=normalize(vec3(screen,-1.0));
  // Integrate through the same world-space depth occupied by the fragments.
  // Static stratification removes slice bands without temporal grain.
  float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  vec3 scattered=vec3(0.0);
  float transmittance=1.0;
  float stepLength=0.5625/(-ray.z);
  float heightFall=pow(1.0-vUv.y,1.7);
  for(int stepIndex=0;stepIndex<16;stepIndex++){
    float depth=7.0+(float(stepIndex)+jitter*0.3)*0.5625;
    vec3 p=vec3(screen*depth,uCameraZ-depth);
    float density=smokeDensity(p)*mix(0.18,1.0,heightFall);
    float alpha=1.0-exp(-density*uSmoke*stepLength*0.5);
    vec3 irradiance=mix(vec3(0.09,0.115,0.16),vec3(0.32),uLight);
    for(int lightIndex=0;lightIndex<2;lightIndex++){
      vec3 toLight=uFirePosition[lightIndex]-p;
      float distance2=dot(toLight,toLight);
      float cosine=dot(normalize(toLight),ray);
      float phase=0.9375/pow(1.0625-0.5*cosine,1.5);
      float attenuation=uFirePower[lightIndex]/max(distance2,1.0);
      float absorption=exp(-density*sqrt(distance2)*0.16);
      irradiance+=uFireColor[lightIndex]*attenuation*phase*absorption*0.22;
    }
    scattered+=transmittance*alpha*irradiance;
    transmittance*=1.0-alpha;
  }
  float opacity=1.0-transmittance;
  vec3 smokeColor=film(scattered/max(opacity,0.001),0.65)*opacity;

  // Low tongues of fire illuminate the foot of the plume, below the copy.
  vec2 fireUv=vec2(vUv.x*uAspect*0.11,vUv.y*0.2-uTime*0.013);
  float warp=volumeNoise(vec3(fireUv*0.4,uTime*0.001))*2.0-1.0;
  float flameNoise=volumeNoise(vec3(fireUv+vec2(warp*0.012,0.0),uTime*0.002))*2.0-1.0;
  float base=1.0-smoothstep(0.0,0.18+warp*0.045,vUv.y);
  float flame=pow(base,2.0)*smoothstep(0.1,0.7,flameNoise*0.5+0.4)*uGlow;
  vec3 fire=film(blackbody(1700.0+base*650.0)*flame*2.0,1.0)*0.32;
  float glow=pow(1.0-vUv.y,3.2)*uGlow*uFlicker*0.42;
  vec3 color=smokeColor+fire+vec3(1.0,0.32,0.06)*glow;
  float alpha=max(opacity,max(max(color.r,color.g),color.b));
  gl_FragColor=vec4(color,clamp(alpha,0.0,1.0));
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uSmokeMap;
varying vec2 vUv;
void main(){
  gl_FragColor=texture2D(uSmokeMap,vUv);
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

function buildInstances(
  rand: () => number,
  type: number,
  count: number
): Instance[] {
  const out: Instance[] = [];
  for (let i = 0; i < count; i++) {
    const seed: Instance["seed"] = [rand(), rand(), rand(), rand()];
    let life: number;
    let radius: number;
    let depth: number;

    if (type === TYPE_EMBER) {
      life = 4.5 + rand() * 4.5;
      // Mostly fine fragments with a long tail of larger ones.
      radius = 0.005 + Math.pow(rand(), 3.0) * 0.055;
      depth = rand() < 0.09 ? 4.5 + rand() * 2 : -7 + rand() * 9;
    } else if (type === TYPE_SPARK) {
      life = 0.9 + rand() * 1.1;
      radius = 0.003 + rand() * 0.005;
      depth = -3 + rand() * 5;
    } else {
      life = 11 + rand() * 9;
      radius = 0.018 + Math.pow(rand(), 2.5) * 0.115;
      depth = rand() < 0.08 ? 4 + rand() * 2 : -6 + rand() * 8;
    }

    out.push({ seed, params: [type, life, rand() * life, radius], depth });
  }
  return out;
}

function setInstanceAttributes(
  geometry: InstancedBufferGeometry,
  instances: Instance[]
) {
  // Far to near: depth is constant per instance, so this order stays correct.
  instances.sort((a, b) => a.depth - b.depth);
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
}

/** A ribbon: a head cap row, TRAIL_SEGMENTS + 1 body rows, a tail cap row. */
function createTrailGeometry(instances: Instance[]) {
  const rows: [number, number][] = [[0, -1]];
  for (let i = 0; i <= TRAIL_SEGMENTS; i++) rows.push([i / TRAIL_SEGMENTS, 0]);
  rows.push([1, 1]);

  const strip = new Float32Array(rows.length * 2 * 3);
  rows.forEach(([s, cap], row) => {
    strip.set([s, -1, cap, s, 1, cap], row * 6);
  });
  const index: number[] = [];
  for (let row = 0; row < rows.length - 1; row++) {
    const a = row * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("aStrip", new BufferAttribute(strip, 3));
  // three.js expects a position attribute to exist; the shader ignores it.
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(rows.length * 2 * 3), 3)
  );
  geometry.setIndex(index);
  setInstanceAttributes(geometry, instances);
  return geometry;
}

function createFragmentGeometry(instances: Instance[]) {
  // A folded 4 × 4 surface, with real depth and normals on both faces.
  const plane = new PlaneGeometry(2, 2, 4, 4);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", plane.getAttribute("position").clone());
  geometry.setAttribute("normal", plane.getAttribute("normal").clone());
  geometry.setAttribute("uv", plane.getAttribute("uv").clone());
  geometry.setIndex(plane.getIndex()!.clone());
  plane.dispose();
  setInstanceAttributes(geometry, instances);
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

const SMOKE_STRENGTH = { dark: 0.24, light: 0.09 };
const GLOW_STRENGTH = { dark: 0.22, light: 0 };

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
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);
  const screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new PlaneGeometry(2, 2);
  const noiseVolume = createAshNoiseVolume();
  const fireLights = [
    new PointLight(0xff782d, 95, 0, 2),
    new PointLight(0xffb65c, 65, 0, 2),
  ];
  const skyLight = new HemisphereLight(0x8799b8, 0x24130d, light ? 1.2 : 0.5);

  // --- Smoke, at quarter resolution ---------------------------------------
  const smokeTarget = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
  const smokeUniforms = {
    uVolume: { value: noiseVolume },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uTanHalfFov: { value: Math.tan(((FOV / 2) * Math.PI) / 180) },
    uCameraZ: { value: CAMERA_Z },
    uSmoke: { value: light ? SMOKE_STRENGTH.light : SMOKE_STRENGTH.dark },
    uGlow: { value: light ? GLOW_STRENGTH.light : GLOW_STRENGTH.dark },
    uFlicker: { value: 1 },
    uLight: { value: light ? 1 : 0 },
    uFirePosition: { value: fireLights.map((source) => source.position) },
    uFireColor: { value: fireLights.map((source) => source.color) },
    uFirePower: { value: [95, 65] },
  };
  const smokeMaterial = new ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    uniforms: smokeUniforms,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const smokeScene = new Scene();
  const smokeMesh = new Mesh(quad, smokeMaterial);
  smokeMesh.frustumCulled = false;
  smokeScene.add(smokeMesh);

  // --- Main scene: smoke backdrop, flakes, then embers --------------------
  const scene = new Scene();
  scene.add(...fireLights, skyLight);

  const compositeMaterial = new ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniforms: { uSmokeMap: { value: smokeTarget.texture } },
    ...premultipliedOver,
  });
  const composite = new Mesh(quad, compositeMaterial);
  composite.frustumCulled = false;
  composite.renderOrder = 0;
  scene.add(composite);

  const surfaceAtlas = createAshMaterialAtlas();
  const uniforms = {
    uSurface: { value: surfaceAtlas },
    uTime: { value: 0 },
    uTanHalfFov: { value: Math.tan(((FOV / 2) * Math.PI) / 180) },
    uAspect: { value: 1 },
    uCameraZ: { value: CAMERA_Z },
    uViewportH: { value: 1 },
    uPixelRatio: { value: 1 },
    uFocus: { value: CAMERA_Z + 1 },
    uAperture: { value: 0.0022 },
    uDensity: { value: 1 },
    uLight: { value: light ? 1 : 0 },
  };

  const rand = mulberry32(0xf3e1);
  const flakeInstances = buildInstances(rand, TYPE_FLAKE, 180);
  const emberInstances = [
    ...buildInstances(rand, TYPE_EMBER, 340),
    ...buildInstances(rand, TYPE_SPARK, 60),
  ];
  const flakeGeometry = createFragmentGeometry([...flakeInstances, ...emberInstances]);
  const flakeMaterial = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    side: DoubleSide,
    forceSinglePass: true,
    alphaTest: 0.01,
    ...premultipliedOver,
  });
  flakeMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const varyings = /* glsl */ `
      varying vec2 vUv;
      varying vec4 vSeed;
      varying float vT;
      varying float vType;
    `;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${PARTICLE_COMMON}\n${varyings}\n${FLAKE_TRANSFORM}`)
      .replace("#include <beginnormal_vertex>", FLAKE_NORMAL)
      .replace("#include <begin_vertex>", FLAKE_POSITION);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform sampler2D uSurface;\nuniform float uTime;\nuniform float uLight;\n${varyings}\n${SURFACE}\n${BLACKBODY}`)
      .replace("#include <map_fragment>", FLAKE_COLOR)
      .replace("#include <emissivemap_fragment>", FLAKE_EMISSION);
  };
  flakeMaterial.customProgramCacheKey = () => "folded-charcoal-pbr-v1";
  const flakes = new Mesh(flakeGeometry, flakeMaterial);
  flakes.frustumCulled = false; // positions are computed on the GPU
  flakes.renderOrder = 1;
  scene.add(flakes);

  const emberGeometry = createTrailGeometry(emberInstances);
  const emberMaterial = new ShaderMaterial({
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
    uniforms,
    ...premultipliedOver,
  });
  const embers = new Mesh(emberGeometry, emberMaterial);
  embers.frustumCulled = false;
  embers.renderOrder = 2;
  scene.add(embers);

  const setTime = (time: number) => {
    uniforms.uTime.value = time;
    smokeUniforms.uTime.value = time;
    smokeUniforms.uFlicker.value =
      0.86 +
      0.08 * Math.sin(time * 7.3) +
      0.05 * Math.sin(time * 13.1 + 1.3) +
      0.04 * Math.sin(time * 2.1);
    const themeStrength = uniforms.uLight.value ? 0.35 : 1;
    fireLights[0].intensity = 95 * smokeUniforms.uFlicker.value * themeStrength;
    fireLights[1].intensity = 65 * (0.87 + 0.13 * Math.sin(time * 9.7 + 2)) * themeStrength;
    smokeUniforms.uFirePower.value[0] = fireLights[0].intensity;
    smokeUniforms.uFirePower.value[1] = fireLights[1].intensity;
  };
  setTime(24);

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    smokeTarget.setSize(
      Math.max(1, Math.ceil(width * pixelRatio * SMOKE_SCALE)),
      Math.max(1, Math.ceil(height * pixelRatio * SMOKE_SCALE))
    );
    uniforms.uAspect.value = camera.aspect;
    smokeUniforms.uAspect.value = camera.aspect;
    const halfHeight = uniforms.uTanHalfFov.value * CAMERA_Z;
    fireLights[0].position.set(-halfHeight * camera.aspect * 0.45, -halfHeight * 1.05, 1);
    fireLights[1].position.set(halfHeight * camera.aspect * 0.5, -halfHeight * 1.12, -1);
    uniforms.uViewportH.value = height * pixelRatio;
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uDensity.value = Math.min(
      1,
      Math.max(MIN_DENSITY, (width * height) / FULL_DENSITY_AREA)
    );
  };

  let firstFrameSent = false;
  let contextLost = false;
  const render = () => {
    if (contextLost) return;
    renderer.setRenderTarget(smokeTarget);
    renderer.render(smokeScene, screenCamera);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    if (!firstFrameSent) {
      firstFrameSent = true;
      onFirstFrame?.();
    }
  };

  let running = false;
  let wantsToRun = false;
  let frame = 0;
  let last = 0;

  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (still || !running) render();
  });
  resizeObserver.observe(canvas);
  resize();

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const elapsed = now - last;
    if (elapsed < FRAME_BUDGET_MS) return;
    last = now;
    // Clamp so a long pause resumes smoothly instead of jumping the field.
    setTime(uniforms.uTime.value + Math.min(elapsed, 100) / 1000);
    render();
  };

  const resources = [
    surfaceAtlas,
    noiseVolume,
    quad,
    flakeGeometry,
    emberGeometry,
    flakeMaterial,
    emberMaterial,
    smokeMaterial,
    compositeMaterial,
    smokeTarget,
  ];
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    running = false;
    // Drop handles and disposal listeners belonging to the old GL context.
    // The CPU geometry and texture data remain available for re-upload.
    for (const resource of resources) resource.dispose();
  };
  const onContextRestored = () => {
    contextLost = false;
    resize();
    render();
    if (wantsToRun && !still) {
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  render();

  return {
    setLight(next) {
      uniforms.uLight.value = next ? 1 : 0;
      smokeUniforms.uLight.value = next ? 1 : 0;
      smokeUniforms.uSmoke.value = next
        ? SMOKE_STRENGTH.light
        : SMOKE_STRENGTH.dark;
      smokeUniforms.uGlow.value = next ? GLOW_STRENGTH.light : GLOW_STRENGTH.dark;
      skyLight.intensity = next ? 1.2 : 0.5;
      setTime(uniforms.uTime.value);
      if (still || !running) render();
    },
    setRunning(next) {
      wantsToRun = next;
      if (still || contextLost || next === running) return;
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
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      for (const resource of resources) resource.dispose();
      renderer.dispose();
    },
  };
}
