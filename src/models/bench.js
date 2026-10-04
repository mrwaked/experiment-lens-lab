// Optical bench for single elements (mm, axis +z, ray plane x = 0 viewed from −x).
import * as THREE from 'three';
import { canvasTexture } from './materials.js';
import { addGlassSections } from './lens-cutaway.js';
import { makeLabel } from '../ui/hotspots.js';
import { MM } from '../core/stage.js';

export const BENCH_ORIGIN = new THREE.Vector3(0, 0.02, 0.05);

function breadboardTexture() {
  return canvasTexture(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#16181c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0b0d';
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          g.beginPath();
          g.arc(32 + x * 64, 32 + y * 64, 6, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
    { repeat: [28, 8] },
  );
}

const WAVE_FRAG = /* glsl */ `
#define PI 3.14159265
uniform float uTime;
uniform float uSlit;
uniform float uLambda;
uniform float uWallZ;
uniform float uScreenZ;
uniform float uHalfH;
varying vec2 vP;
void main() {
  float k = 2.0 * PI / uLambda;
  float w = 2.0 * PI * 0.9;
  float a = uSlit * uLambda;
  vec3 dark = vec3(0.02, 0.025, 0.035);
  vec3 wave = vec3(0.35, 0.8, 1.0);
  vec3 col;
  if (vP.x < uWallZ) {
    float v = cos(k * vP.x - w * uTime);
    col = mix(dark, wave, 0.5 + 0.45 * v);
  } else {
    float sc = 0.0;
    float ss = 0.0;
    const int M = 48;
    for (int i = 0; i < M; i++) {
      float y = (float(i) + 0.5) / float(M) * a - 0.5 * a;
      float r = length(vec2(vP.x - uWallZ, vP.y - y));
      float amp = 1.0 / sqrt(max(r, uLambda * 0.5));
      float ph = k * (r + uWallZ) - w * uTime;
      sc += cos(ph) * amp;
      ss += sin(ph) * amp;
    }
    float norm = sqrt(uLambda) / float(M) * 1.6;
    float v = sc * norm;
    float I = (sc * sc + ss * ss) * norm * norm;
    col = mix(dark, wave, clamp(0.5 + 0.45 * v, 0.0, 1.0)) * (0.35 + 0.65 * clamp(I * 1.6, 0.0, 1.0));
    if (vP.x > uScreenZ) col = mix(vec3(0.05), vec3(1.0, 0.9, 0.5), clamp(I * 3.0, 0.0, 1.0));
  }
  float wall = step(abs(vP.x - uWallZ), 1.2) * step(0.5 * uSlit * uLambda, abs(vP.y));
  col = mix(col, vec3(0.13, 0.14, 0.16), wall);
  float edge = smoothstep(uHalfH, uHalfH - 3.0, abs(vP.y));
  gl_FragColor = vec4(col * edge, 1.0);
  #include <colorspace_fragment>
}`;

export function createBench({ envMap }) {
  const group = new THREE.Group();
  group.name = 'bench';
  group.position.copy(BENCH_ORIGIN);
  group.scale.setScalar(MM);

  const table = new THREE.Mesh(new THREE.BoxGeometry(120, 4, 760), new THREE.MeshStandardMaterial({ map: breadboardTexture(), roughness: 0.7, metalness: 0.3, envMap, envMapIntensity: 0.4 }));
  table.position.set(0, -49, 150);
  table.receiveShadow = true;
  group.add(table);

  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.2, 0, -200), new THREE.Vector3(-0.2, 0, 520)]),
    new THREE.LineDashedMaterial({ color: 0x6f6d67, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.6 }),
  );
  axis.computeLineDistances();
  group.add(axis);

  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.8, roughness: 0.35, envMap });

  // A lens holder post under an element at z.
  function post(z, height = 50) {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, height, 16), metal);
    rod.position.set(0, -47 + height / 2, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 16), metal);
    base.position.set(0, -45, z);
    g.add(rod, base);
    return g;
  }

  // Emitter box on the left.
  function laser(z = -150, { color = 0xffe100, aperture = 9, withPost = true } = {}) {
    const g = new THREE.Group();
    const size = Math.max(34, aperture * 2 + 12);
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, size, 60), metal);
    body.position.set(0, 0, z - 30.5);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(aperture, 40), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.85 }));
    lens.rotation.y = Math.PI;
    lens.position.set(0, 0, z - 0.4);
    const face = new THREE.Mesh(new THREE.CircleGeometry(aperture, 40), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    face.position.set(0, 0, z - 0.4);
    g.add(body, lens, face);
    if (withPost) g.add(post(z - 30, 47 - size / 2));
    return g;
  }

  function element(sys) {
    const g = new THREE.Group();
    const res = addGlassSections(sys, g, { envMap, skinOpacity: 0.24, capOpacity: 0.5 });
    const z = sys.surfaces[0].z;
    const h = res.maxSd;
    const zc = (sys.surfaces[0].z + sys.surfaces.at(-1).z) / 2;
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), metal);
    clamp.position.set(0, -h - 2.5, zc);
    g.add(clamp, post(zc, 47 - h - 5));
    return { group: g, ...res };
  }

  // Slab: a glass block drawn as a clear box with a tinted section.
  function block(t, height = 90, color = 0x8fd3ff) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(70, height, t),
      new THREE.MeshPhysicalMaterial({ color: 0xd8f2ff, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false, envMap, clearcoat: 1, side: THREE.DoubleSide }),
    );
    box.position.set(35, 0, t / 2);
    const cap = new THREE.Mesh(
      new THREE.PlaneGeometry(t, height),
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35, emissive: color, emissiveIntensity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    );
    cap.rotation.y = -Math.PI / 2;
    cap.position.set(0, 0, t / 2);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(70, height, t)), new THREE.LineBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.5 }));
    edges.position.copy(box.position);
    g.add(box, cap, edges);
    return { group: g, cap, box };
  }

  function arrow(height, color = 0xffe100, opacity = 1) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, transparent: opacity < 1, opacity });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 12), mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(4.5, 10, 16), mat);
    g.add(shaft, head);
    g.userData.set = (hgt) => {
      const s = Math.sign(hgt) || 1;
      const len = Math.max(Math.abs(hgt) - 10, 0.5);
      shaft.scale.y = len;
      shaft.position.y = (s * len) / 2;
      head.position.y = s * (len + 5);
      head.rotation.z = s > 0 ? 0 : Math.PI;
    };
    g.userData.set(height);
    return g;
  }

  function marker(text, cls = 'label3d acc center') {
    const g = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe100, toneMapped: false }));
    const label = makeLabel(text, cls);
    label.position.set(0, -9, 0);
    g.add(dot, label);
    g.userData.label = label;
    return g;
  }

  // Dimension line between z0 and z1 at height y, with a centred label.
  function dimension(text) {
    const g = new THREE.Group();
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe100, transparent: true, opacity: 0.8 }));
    const label = makeLabel(text, 'label3d center');
    g.add(line, label);
    g.userData.set = (z0, z1, y, txt) => {
      geo.setFromPoints([new THREE.Vector3(-0.5, y, z0), new THREE.Vector3(-0.5, y, z1)]);
      label.position.set(0, y - 7, (z0 + z1) / 2);
      if (txt) label.element.innerHTML = txt;
    };
    return g;
  }

  function screen(height = 70) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(50, height),
      new THREE.MeshStandardMaterial({ color: 0xece8df, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 }),
    );
    m.rotation.y = Math.PI;
    return m;
  }

  function wavePlane({ length = 300, halfH = 80, wallZ = 60 } = {}) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vP; void main(){ vP = vec2(position.x, position.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: WAVE_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSlit: { value: 3 },
        uLambda: { value: 7 },
        uWallZ: { value: wallZ },
        uScreenZ: { value: length - 12 },
        uHalfH: { value: halfH },
      },
    });
    const geo = new THREE.PlaneGeometry(length, halfH * 2, 1, 1);
    geo.translate(length / 2, 0, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = -Math.PI / 2;
    mesh.userData.update = (dt) => (mat.uniforms.uTime.value += dt);
    return mesh;
  }

  return { group, table, laser, element, block, arrow, marker, dimension, screen, wavePlane, post };
}
