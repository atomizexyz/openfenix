/**
 * Rising-ash scene for the hero, modelled on a long-exposure photograph of a
 * fire rather than on a particle demo.
 *
 * Three passes, three draw calls, no per-particle CPU work -- every particle
 * is a pure function of time evaluated on the GPU, and the CPU only advances a
 * clock uniform each frame:
 *
 *  1. Smoke: domain-warped noise rising through the frame, lit orange from the
 *     unseen fire below. Rendered at quarter resolution into a render target
 *     (smoke is low-frequency, so this costs ~1/16th of a full-res pass) and
 *     upsampled as the backdrop.
 *  2. Flakes: irregular paper-ash flakes that tumble (a flip reads as a width
 *     squash plus a glint as the face turns into the firelight), some with a
 *     patchy burning rim that dies back as they climb.
 *  3. Embers and sparks, drawn as *ribbons* along their actual trajectory over
 *     a shutter interval. This is what makes ember photos look the way they
 *     do: trails curve with the turbulence that carries them, and because an
 *     ember flickers while the shutter is open, its trail is beaded -- brighter
 *     and dimmer along its length -- instead of a uniform pill. Per-pixel
 *     brightness falls as an ember outruns its own width (exposure is spread
 *     along the trail), cores are HDR so they bleach toward white under a film
 *     curve, and a pixel-space glow stands in for lens bloom.
 *
 * Embers cool along a blackbody ramp as they rise and leave a faint grey speck
 * once dark. Depth of field is a thin-lens circle of confusion, so embers off
 * the focal plane open into soft bokeh. Instances are sorted far-to-near once
 * (depth is fixed per instance), so premultiplied "over" blending stays
 * ordered without a per-frame sort.
 *
 * Imported dynamically by rising-ash.tsx, which keeps three.js out of the
 * initial bundle.
 */
import {
  AddEquation,
  BufferAttribute,
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  NoBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
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

// Tanner Helland's blackbody fit, valid ~1000K-6600K.
const BLACKBODY = /* glsl */ `
vec3 blackbody(float kelvin){
  float t=kelvin/100.0;
  float g=clamp((99.4708025861*log(t)-161.1195681661)/255.0,0.0,1.0);
  float b=t<=19.0?0.0:clamp((138.5177312231*log(t-10.0)-305.0447927307)/255.0,0.0,1.0);
  return vec3(1.0,g,b);
}
`;

// Exponential film response on the peak channel, so hue survives (per-channel
// rolloff drifts orange toward olive); only the hottest cores bleach to white.
const FILM = /* glsl */ `
vec3 film(vec3 c,float exposure){
  float peak=max(max(c.r,c.g),c.b);
  if(peak<=1e-5)return vec3(0.0);
  float mapped=1.0-exp(-peak*exposure);
  return mix(c/peak,vec3(1.0,0.96,0.86),smoothstep(0.82,1.0,mapped)*0.6)*mapped;
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
    p.z+=snoise(n0+vec3(19.1,7.3,tf))*amp*0.6;
    p.y+=snoise(n0+vec3(3.7,41.9,tf*1.7))*0.18;
    float w=5.0+aSeed.y*9.0;
    float r=mix(0.015,0.07,aSeed.w)*(0.4+lifeT);
    p.x+=sin(age*w+aSeed.x*6.28)*r;
    p.z+=cos(age*w+aSeed.x*6.28)*r;
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

// x: position along the trail, 0 = now (head) .. 1 = shutter open (tail)
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

  // Shutter interval. Sparks move fast enough to want a longer one.
  float span=type<0.5?mix(0.07,0.13,aSeed.w):mix(0.1,0.17,aSeed.w);
  float s=aStrip.x;
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

  // Thin-lens defocus, capped so deep embers soften rather than balloon.
  float rPx=radius*pxPerUnit;
  float cocPx=min(uAperture*abs(dist-uFocus)*pxPerUnit,rPx*2.5+2.0*uPixelRatio);
  float corePx=sqrt(rPx*rPx+cocPx*cocPx);
  // A defocused ember spreads its light, but it is far brighter than the
  // display, so it keeps more apparent brightness than strict r^2 would give.
  float energy=pow(rPx/corePx,1.35);
  float minPx=0.8*uPixelRatio;
  if(corePx<minPx){
    energy*=(corePx*corePx)/(minPx*minPx);
    corePx=minPx;
  }
  vBlur=clamp(cocPx/corePx,0.0,1.0);

  // Exposure is spread along the trail: each pixel only sees the ember for
  // the moment it passes, so fast trails are dimmer per pixel.
  energy*=pow(corePx/(corePx+speedPx*span),0.4);

  // Cooling along a blackbody ramp; sparks start hotter and die faster.
  float hot=type<0.5?mix(1300.0,1800.0,aSeed.y):mix(1900.0,2400.0,aSeed.y);
  float kelvin=mix(hot,620.0,pow(tS,mix(0.55,1.1,aSeed.z)));
  // Oxygen flicker sampled at each point's own moment of exposure, which is
  // what beads the trail.
  float flicker=0.66+0.34*snoise(vec3(aSeed.x*53.0,aSeed.y*17.0,(uTime-s*span)*(9.0+aSeed.w*14.0)));
  kelvin*=mix(0.92,1.04,flicker);
  float radiance=pow(kelvin/1500.0,4.0)*(type<0.5?10.0:16.0);
  float born=smoothstep(-0.015,0.0,rawAge);
  vEmit=blackbody(kelvin)*radiance*energy*flicker*mix(1.0,0.6,s)*born;
  // The grey speck a cooled ember leaves is a point, not a streak.
  vSpeck=type<0.5?born*(1.0-s):0.0;

  // Pixel-space glow: lens bloom is a property of the optics, not of the
  // ember's size, so it is sized in px rather than in world units.
  vCorePx=corePx;
  vHaloPx=mix(6.5,2.5,uLight)*uPixelRatio+corePx*0.6;
  float halfW=corePx*2.2+vHaloPx*3.0;

  vec2 offsetPx=normal*aStrip.y*halfW-tangent*aStrip.z*halfW;
  vPx=vec2(aStrip.z*halfW,aStrip.y*halfW);
  gl_Position=projectionMatrix*vec4(c+vec3(offsetPx/pxPerUnit,0.0),1.0);
}
`;

const EMBER_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uLight;

varying vec2 vPx;
varying float vCorePx;
varying float vHaloPx;
varying float vBlur;
varying vec3 vEmit;
varying float vT;
varying float vSpeck;

${FILM}

void main(){
  float d=length(vPx);
  float dn=d/vCorePx;

  // Sharp: gaussian core. Defocused: a flat disc with a faint bright rim,
  // which is what an out-of-focus point light looks like through a lens.
  float sharp=exp(-dn*dn*1.6);
  float disc=smoothstep(1.0,0.8,dn)*(0.8+0.2*smoothstep(0.5,0.95,dn));
  float core=mix(sharp,disc,smoothstep(0.2,0.85,vBlur));
  float halo=exp(-d/vHaloPx)*mix(0.11,0.03,uLight)*(1.0-0.7*vBlur);

  float fade=smoothstep(0.0,0.04,vT)*(1.0-smoothstep(0.8,1.0,vT));
  vec3 emit=film(vEmit*(core+halo),mix(1.8,1.05,uLight))*fade;
  // Defocused glow needs darkness around it to read; on a light page a
  // blurred ember is just a tinted smudge, so let it fall away.
  emit*=1.0-smoothstep(0.25,0.9,vBlur)*0.8*uLight;

  // A cooled ember is a speck of grey ash. On a dark page it vanishes; on a
  // light page it is what you actually see once the glow has gone.
  float speck=smoothstep(1.25,0.55,dn)*smoothstep(0.35,0.95,vT)*(1.0-vBlur)*fade*vSpeck;
  float speckCov=speck*0.4*uLight;

  float alpha=clamp(max(max(emit.r,emit.g),emit.b)+speckCov,0.0,1.0);
  if(alpha<0.002)discard;
  // Premultiplied over: alpha tracks emission, so the glow is valid on any
  // background, light or dark.
  gl_FragColor=vec4(emit+vec3(0.16,0.14,0.13)*speckCov,alpha);
}
`;

/* --------------------------------- Flakes --------------------------------- */

const FLAKE_VERTEX = /* glsl */ `
precision highp float;

${PARTICLE_COMMON}

varying vec2 vUv;
varying float vT;
varying float vBlur;
varying float vEnergy;
varying vec4 vSeed;
varying float vFlip;
varying float vHeight;

void main(){
  float life=aParams.y;
  float radius=aParams.w;
  vSeed=aSeed;

  if(culled(aParams.x)){
    gl_Position=vec4(2.0,2.0,2.0,1.0);
    return;
  }

  float clock=uTime+aParams.z;
  float cycle=floor(clock/life);
  float age=clock-cycle*life;
  vT=age/life;

  vec3 c=viewAt(age,life,cycle,aParams.x);
  float dist=-c.z;
  vHeight=clamp(c.y/(uTanHalfFov*dist)*0.5+0.5,0.0,1.0);

  float coc=min(uAperture*abs(dist-uFocus),radius*4.0);
  float r=sqrt(radius*radius+coc*coc);
  vEnergy=pow(radius/r,1.35);
  vBlur=clamp(coc/r,0.0,1.0);

  // Tumble: in-plane spin plus an out-of-plane flip read as a width squash.
  // Curled ash never goes knife-thin edge-on, so the squash bottoms out.
  float ang=aSeed.x*6.2831+age*(aSeed.y-0.5)*2.4;
  vec2 dir=vec2(cos(ang),sin(ang));
  vec2 perp=vec2(-dir.y,dir.x);
  float flip=cos(age*(0.9+aSeed.w*1.8)+aSeed.z*6.2831);
  vFlip=flip;
  float ext=1.25+vBlur*0.6;
  vUv=position.xy*ext;

  vec2 offset=dir*position.x*r*ext+perp*position.y*r*ext*max(abs(flip),0.32);
  gl_Position=projectionMatrix*vec4(c+vec3(offset,0.0),1.0);
}
`;

const FLAKE_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uLight;

varying vec2 vUv;
varying float vT;
varying float vBlur;
varying float vEnergy;
varying vec4 vSeed;
varying float vFlip;
varying float vHeight;

${BLACKBODY}
${FILM}

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

void main(){
  float fade=smoothstep(0.0,0.05,vT)*(1.0-smoothstep(0.8,1.0,vT));

  // Irregular silhouette from radial noise, softened by defocus.
  vec2 p=vUv;
  float r=length(p);
  float ang=atan(p.y,p.x);
  float rad=0.68+0.3*fbm(vec2(cos(ang),sin(ang))*1.6+vSeed.xy*31.0);
  float sd=r-rad;
  float aa=fwidth(sd)*1.2+vBlur*0.45;
  float mask=1.0-smoothstep(-aa,aa,sd);

  // Mottled, occasionally holed paper ash.
  float tex=fbm(p*2.6+vSeed.zw*23.0);
  mask*=smoothstep(-0.62,-0.42,tex+vBlur*0.4);
  if(mask<0.002)discard;

  vec3 charcoal=vec3(0.07,0.065,0.06);
  vec3 paleAsh=vec3(0.62,0.6,0.57);
  vec3 albedo=mix(charcoal,paleAsh,vSeed.x*vSeed.x)*(0.82+0.36*tex);
  // Daylight reads ash as soft grey paper, not charcoal.
  albedo=mix(albedo,vec3(0.42,0.39,0.37)*(0.85+0.3*tex),0.45*uLight);

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
  float alive=1.0-smoothstep(0.08,0.55,vT);
  float kelvin=mix(950.0,1350.0,patchy);
  vec3 rim=blackbody(kelvin)*pow(kelvin/1500.0,4.0)*band*patchy*alive*burns*vEnergy*3.0;
  vec3 emit=film(rim,1.6)*fade;

  float cov=mask*fade*mix(0.85,0.6,uLight)*mix(1.0,0.55,vBlur);
  float alpha=clamp(cov+max(max(emit.r,emit.g),emit.b),0.0,1.0);
  gl_FragColor=vec4(lit*cov+emit,alpha);
}
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
uniform float uSmoke;
uniform float uGlow;
uniform float uFlicker;
uniform float uLight;
varying vec2 vUv;

${SIMPLEX}

float fbm(vec3 p){
  float s=0.0;
  float a=0.5;
  for(int i=0;i<4;i++){
    s+=a*snoise(p);
    p=p*2.02+vec3(5.1,1.3,7.7);
    a*=0.5;
  }
  return s;
}

void main(){
  vec2 p=vec2((vUv.x-0.5)*uAspect,vUv.y);
  float t=uTime;

  // Domain warp gives the curling, folding structure of real smoke; the
  // second layer rises faster than the warp field, so wisps shear and stretch.
  vec3 q=vec3(p*1.3-vec2(0.0,t*0.05),t*0.035);
  vec2 warp=vec2(fbm(q),fbm(q+vec3(4.2,1.7,3.1)));
  float n=fbm(vec3(p*2.2+warp*0.95-vec2(0.0,t*0.1),t*0.05));

  float heat=pow(1.0-vUv.y,2.2);
  float density=smoothstep(0.05,0.8,n*0.5+0.45+0.25*heat-0.25);
  density*=mix(1.0,0.3,vUv.y);

  // Lit from below by the fire, fading to cool grey as it climbs.
  vec3 col=mix(vec3(0.3,0.28,0.27),vec3(1.0,0.5,0.2),heat*0.85*uFlicker);
  col=mix(col,vec3(0.56,0.54,0.53),uLight*0.6);
  float a=density*uSmoke;

  float x=vUv.x*2.0-1.0;
  float glow=pow(1.0-vUv.y,3.2)*(1.0-0.35*x*x)*uGlow*uFlicker;

  gl_FragColor=vec4(col*a+vec3(1.0,0.36,0.08)*glow,clamp(a+glow*0.9,0.0,1.0));
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

function createQuadGeometry(instances: Instance[]) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
      3
    )
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
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

const SMOKE_STRENGTH = { dark: 0.4, light: 0.09 };
const GLOW_STRENGTH = { dark: 0.3, light: 0 };

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

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);
  const screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new PlaneGeometry(2, 2);

  // --- Smoke, at quarter resolution ---------------------------------------
  const smokeTarget = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
  const smokeUniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uSmoke: { value: light ? SMOKE_STRENGTH.light : SMOKE_STRENGTH.dark },
    uGlow: { value: light ? GLOW_STRENGTH.light : GLOW_STRENGTH.dark },
    uFlicker: { value: 1 },
    uLight: { value: light ? 1 : 0 },
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

  const uniforms = {
    uTime: { value: 0 },
    uTanHalfFov: { value: Math.tan(((FOV / 2) * Math.PI) / 180) },
    uAspect: { value: 1 },
    uCameraZ: { value: CAMERA_Z },
    uViewportH: { value: 1 },
    uPixelRatio: { value: 1 },
    uFocus: { value: CAMERA_Z + 2 },
    uAperture: { value: 0.0045 },
    uDensity: { value: 1 },
    uLight: { value: light ? 1 : 0 },
  };

  const rand = mulberry32(0xf3e1);
  const flakeGeometry = createQuadGeometry(
    buildInstances(rand, TYPE_FLAKE, 150)
  );
  const flakeMaterial = new ShaderMaterial({
    vertexShader: FLAKE_VERTEX,
    fragmentShader: FLAKE_FRAGMENT,
    uniforms,
    ...premultipliedOver,
  });
  const flakes = new Mesh(flakeGeometry, flakeMaterial);
  flakes.frustumCulled = false; // positions are computed on the GPU
  flakes.renderOrder = 1;
  scene.add(flakes);

  const emberGeometry = createTrailGeometry([
    ...buildInstances(rand, TYPE_EMBER, 340),
    ...buildInstances(rand, TYPE_SPARK, 44),
  ]);
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
  };
  setTime(still ? 24 : 0);

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
    uniforms.uViewportH.value = height * pixelRatio;
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uDensity.value = Math.min(
      1,
      Math.max(MIN_DENSITY, (width * height) / FULL_DENSITY_AREA)
    );
  };

  let firstFrameSent = false;
  const render = () => {
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
      smokeUniforms.uLight.value = next ? 1 : 0;
      smokeUniforms.uSmoke.value = next
        ? SMOKE_STRENGTH.light
        : SMOKE_STRENGTH.dark;
      smokeUniforms.uGlow.value = next ? GLOW_STRENGTH.light : GLOW_STRENGTH.dark;
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
      for (const disposable of [
        quad,
        flakeGeometry,
        emberGeometry,
        flakeMaterial,
        emberMaterial,
        smokeMaterial,
        compositeMaterial,
        smokeTarget,
        renderer,
      ]) {
        disposable.dispose();
      }
    },
  };
}
