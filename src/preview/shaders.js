export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Pass A: colour + signed thin-lens blur radius in px (negative in front of the focus plane).
export const COC_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform float uK;
uniform float uInvS;
uniform float uMaxBlur;
varying vec2 vUv;
void main() {
  float depth = texture2D(tDepth, vUv).x;
  float viewZ = -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  float coc = uK * (uInvS - 1.0 / max(viewZ, 1e-3));
  gl_FragColor = vec4(texture2D(tColor, vUv).rgb, clamp(coc, -uMaxBlur, uMaxBlur));
}`;

// Pass B: Gustafsson-style golden-angle gather, accepting samples only inside the aperture shape (N-gon, cat's eye).
export const BOKEH_FRAG = /* glsl */ `
#define GOLDEN_ANGLE 2.39996323
#define PI 3.14159265
uniform sampler2D tCoc;
uniform vec2 uTexel;
uniform float uMaxBlur;
uniform float uRadScale;
uniform float uBlades;
uniform float uRot;
uniform float uRound;
uniform float uCatEye;
uniform float uAspect;
uniform float uBase;
varying vec2 vUv;

float boundary(float ang) {
  float seg = 2.0 * PI / uBlades;
  float a = mod(ang - uRot, seg) - 0.5 * seg;
  return mix(cos(0.5 * seg) / cos(a), 1.0, uRound);
}

void main() {
  vec4 center = texture2D(tCoc, vUv);
  float centerSize = abs(center.a) + uBase;
  vec3 color = center.rgb;
  float tot = 1.0;
  float radius = uRadScale;
  float ang = 0.0;
  float limit = uMaxBlur + uBase;
  vec2 norm = vec2(uAspect, 1.0) / length(vec2(uAspect, 1.0));
  for (int i = 0; i < 4096; i++) {
    if (radius >= limit) break;
    ang += GOLDEN_ANGLE;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 tc = vUv + dir * uTexel * radius;
    vec4 s = texture2D(tCoc, tc);
    float size = abs(s.a) + uBase;
    if (s.a > center.a) size = min(size, centerSize * 2.0);
    float shapeAng = ang + (s.a > 0.0 ? 0.0 : PI);
    float effR = radius / boundary(shapeAng);
    float m = smoothstep(effR - 0.5, effR + 0.5, size);
    if (uCatEye > 0.0) {
      vec2 q = (tc - 0.5) * 2.0 * norm;
      vec2 o = -dir * radius / max(size, 0.5);
      float ce = length(o + uCatEye * q);
      m *= 1.0 - smoothstep(1.0 - 1.0 / max(size, 1.0), 1.0, ce);
    }
    color += mix(color / tot, s.rgb, m);
    tot += 1.0;
    radius += uRadScale / radius;
  }
  gl_FragColor = vec4(color / tot, 1.0);
}`;

// Pass C: lens character + exposure + tone mapping, output linear LDR.
export const FINAL_FRAG = /* glsl */ `
uniform sampler2D tBlur;
uniform sampler2D tCoc;
uniform float uExposure;
uniform float uVignette;
uniform float uDistortion;
uniform float uCA;
uniform float uGhost;
uniform float uGlare;
uniform float uAspect;
uniform float uBlurMap;
uniform float uBlurSharp;
varying vec2 vUv;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 asp = vec2(uAspect, 1.0);
  float cornerR2 = 0.25 * (uAspect * uAspect + 1.0);
  vec2 p = (vUv - 0.5) * asp;
  float r2 = dot(p, p) / cornerR2;
  float k = uDistortion;
  vec2 ps = p * (1.0 + k * r2) / (1.0 + max(k, 0.0));
  vec2 uv = ps / asp + 0.5;
  vec2 c = uv - 0.5;

  vec3 col;
  col.r = texture2D(tBlur, 0.5 + c * (1.0 + uCA)).r;
  col.g = texture2D(tBlur, uv).g;
  col.b = texture2D(tBlur, 0.5 + c * (1.0 - uCA)).b;

  if (uGhost > 0.0) {
    vec3 ghosts = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float sc = -0.32 - float(i) * 0.46;
      vec2 guv = 0.5 + c * sc;
      vec3 h = vec3(0.0);
      for (int k = 0; k < 6; k++) {
        float a = float(k) * 1.0472;
        h += max(texture2D(tBlur, guv + vec2(cos(a), sin(a) * uAspect) * 0.006).rgb - 3.5, 0.0);
      }
      h /= 6.0;
      vec3 tint = i == 0 ? vec3(0.35, 1.0, 0.55) : i == 1 ? vec3(1.0, 0.45, 0.85) : i == 2 ? vec3(0.5, 0.6, 1.0) : vec3(1.0, 0.8, 0.4);
      float fade = 1.0 - smoothstep(0.25, 0.62, length((guv - 0.5) * asp));
      ghosts += h * tint * fade;
    }
    col += ghosts * uGhost;
  }
  col += uGlare;
  col *= 1.0 - uVignette * r2 * (0.55 + 0.45 * r2);
  col = aces(col * uExposure);

  if (uBlurMap > 0.5) {
    float coc = texture2D(tCoc, vUv).a;
    vec3 side = coc < 0.0 ? vec3(0.25, 0.5, 1.0) : vec3(1.0, 0.35, 0.2);
    vec3 map = mix(vec3(0.3, 1.0, 0.5), side, smoothstep(0.25, 3.5, abs(coc) - uBlurSharp));
    float l = dot(col, vec3(0.3, 0.55, 0.15));
    col = mix(col, map * (0.35 + 0.9 * l), 0.72);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
