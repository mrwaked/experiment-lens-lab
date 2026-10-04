// Dusk street at real scale (m), sensor at the origin looking down −z, 1.3 m above ground; DIORAMA layer only.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAYERS, setLayerDeep } from '../core/stage.js';
import { canvasTexture } from './materials.js';
import { makeLabel } from '../ui/hotspots.js';

export const GROUND_Y = -1.3;
export const SUBJECT_Z = -2.5;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
void main() {
  float y = normalize(vDir).y;
  vec3 zenith = vec3(0.012, 0.03, 0.09);
  vec3 mid = vec3(0.05, 0.08, 0.2);
  vec3 horizon = vec3(0.55, 0.26, 0.2);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.16, y));
  col = mix(col, zenith, smoothstep(0.16, 0.6, y));
  col = mix(col, vec3(0.03, 0.025, 0.03), smoothstep(0.0, -0.05, y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function tilesTexture() {
  return canvasTexture(
    1024,
    1024,
    (g, w, h) => {
      g.fillStyle = '#3b3833';
      g.fillRect(0, 0, w, h);
      const n = 8;
      const s = w / n;
      let seed = 11;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const v = 70 + r() * 40;
          g.fillStyle = `rgb(${v + 12},${v + 6},${v})`;
          g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
          for (let k = 0; k < 40; k++) {
            g.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
            g.fillRect(x * s + r() * s, y * s + r() * s, 3 + r() * 6, 2 + r() * 4);
          }
        }
      }
    },
    { repeat: [60, 60] },
  );
}

function chartTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#f2efe8';
    g.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.43;
    const R = w * 0.33;
    g.fillStyle = '#111';
    const spokes = 36;
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2;
      const a1 = ((i + 0.5) / spokes) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R, a0, a1);
      g.closePath();
      g.fill();
    }
    g.lineWidth = 3;
    g.strokeStyle = '#111';
    g.beginPath();
    g.arc(cx, cy, R + 6, 0, Math.PI * 2);
    g.stroke();
    g.font = '600 34px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.fillText('LENS LAB · RESOLUTION', cx, h * 0.84);
    for (let b = 0; b < 5; b++) {
      const pitch = 3 + b * 2;
      const x0 = w * 0.1 + b * w * 0.17;
      for (let i = 0; i < 5; i++) g.fillRect(x0 + i * pitch * 2, h * 0.88, pitch, h * 0.08);
    }
  });
}

function signTexture(text) {
  return canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#ffe100';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#141200';
    g.font = '600 36px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function windowsTexture(seed) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (r() < 0.45) continue;
        const warm = r();
        g.fillStyle = warm > 0.3 ? `rgb(255,${170 + r() * 50},${90 + r() * 40})` : 'rgb(200,220,255)';
        g.fillRect(20 + x * 60, 24 + y * 58, 30, 36);
      }
    }
  });
}

function robot() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xd8552e, roughness: 0.38, metalness: 0.15 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe9e1d0, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.3, metalness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.15, metalness: 0.3 });
  const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  for (const x of [-0.055, 0.055]) {
    add(new RoundedBoxGeometry(0.06, 0.14, 0.07, 2, 0.012), steel, x, 0.07, 0);
    add(new RoundedBoxGeometry(0.08, 0.035, 0.1, 2, 0.012), paint, x, 0.018, 0.01);
  }
  add(new RoundedBoxGeometry(0.25, 0.22, 0.17, 4, 0.03), paint, 0, 0.25, 0);
  add(new RoundedBoxGeometry(0.15, 0.1, 0.01, 2, 0.004), cream, 0, 0.26, 0.087);
  const dial = add(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 32), steel, -0.035, 0.265, 0.093);
  dial.rotation.x = Math.PI / 2;
  [0xff3b30, 0x34c759, 0xffcc00].forEach((c, i) => add(new THREE.SphereGeometry(0.009, 16, 12), glow(c, 3), 0.02 + i * 0.024, 0.265, 0.093));
  for (const s of [-1, 1]) {
    const arm = add(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 20), steel, s * 0.15, 0.24, 0);
    arm.rotation.z = s * 0.25;
    add(new THREE.SphereGeometry(0.035, 20, 14), cream, s * 0.17, 0.155, 0.01);
  }
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.035, 20), steel, 0, 0.375, 0);
  add(new RoundedBoxGeometry(0.23, 0.17, 0.18, 4, 0.035), cream, 0, 0.47, 0);
  add(new RoundedBoxGeometry(0.19, 0.075, 0.02, 3, 0.012), dark, 0, 0.475, 0.085);
  for (const x of [-0.045, 0.045]) add(new THREE.SphereGeometry(0.016, 20, 14), glow(0x5ff0ff, 4), x, 0.475, 0.095);
  for (const s of [-1, 1]) {
    const ear = add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 24), paint, s * 0.123, 0.47, 0);
    ear.rotation.z = Math.PI / 2;
  }
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 8), steel, 0.05, 0.6, 0);
  add(new THREE.SphereGeometry(0.014, 16, 12), glow(0xff4030, 8), 0.05, 0.65, 0);
  return g;
}

function tree(h, r, color) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.12, h * 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9 }));
  trunk.position.y = h * 0.17;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.8, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  crown.position.y = h * 0.6;
  g.add(trunk, crown);
  return g;
}

export function createDiorama() {
  const group = new THREE.Group();
  group.name = 'diorama';

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.renderOrder = -20;
  group.add(sky);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: tilesTexture(), roughness: 0.78, metalness: 0.0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  group.add(ground);

  // Subject: toy robot on a plinth.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.84, 40), new THREE.MeshStandardMaterial({ color: 0x5b5f68, roughness: 0.55, metalness: 0.2 }));
  plinth.position.set(0, GROUND_Y + 0.42, SUBJECT_Z);
  plinth.castShadow = plinth.receiveShadow = true;
  group.add(plinth);
  const bot = robot();
  bot.position.set(0, GROUND_Y + 0.84, SUBJECT_Z);
  bot.rotation.y = -0.18;
  group.add(bot);
  const afTarget = new THREE.Vector3(0, GROUND_Y + 0.84 + 0.475, SUBJECT_Z + 0.09);

  // Test chart on an easel beside the robot, in the same plane.
  const chartCenter = new THREE.Vector3(0.62, -0.02, SUBJECT_Z);
  const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshStandardMaterial({ map: chartTexture(), roughness: 0.8 }));
  chart.position.copy(chartCenter);
  chart.receiveShadow = true;
  group.add(chart);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.7 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.39, 0.012), legMat);
  board.position.set(chartCenter.x, chartCenter.y, SUBJECT_Z - 0.008);
  group.add(board);
  for (const [dx, dz, rz, rx] of [[-0.12, -0.03, 0.08, 0], [0.12, -0.03, -0.08, 0], [0, -0.2, 0, -0.16]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 1.22, 8), legMat);
    leg.position.set(chartCenter.x + dx, GROUND_Y + 0.6, SUBJECT_Z + dz);
    leg.rotation.set(rx, 0, rz);
    leg.castShadow = true;
    group.add(leg);
  }

  // Distance posts, every metre on the left, labelled in the scene.
  const postGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.6 });
  const signGeo = new THREE.PlaneGeometry(0.2, 0.1);
  const posts = [];
  for (let m = 1; m <= 20; m++) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(-1.05, GROUND_Y + 0.25, -m);
    post.castShadow = true;
    const sign = new THREE.Mesh(signGeo, new THREE.MeshStandardMaterial({ map: signTexture(`${m} m`), roughness: 0.6, emissive: 0x332d00 }));
    sign.position.set(-1.05, GROUND_Y + 0.56, -m + 0.03);
    group.add(post, sign);
    posts.push(post);
  }

  // Foreground plant (lower left) for foreground blur.
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.6 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.2, 20), new THREE.MeshStandardMaterial({ color: 0x8a4b2c, roughness: 0.7 }));
  pot.position.set(-0.4, GROUND_Y + 0.7, -1.15);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.6, 10), postMat);
  stand.position.set(-0.4, GROUND_Y + 0.3, -1.15);
  group.add(pot, stand);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), leafMat);
    const a = (i / 9) * Math.PI * 2;
    leaf.scale.set(0.35, 1.1, 0.12);
    leaf.position.set(-0.4 + Math.cos(a) * 0.07, GROUND_Y + 0.9, -1.15 + Math.sin(a) * 0.07);
    leaf.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
    group.add(leaf);
  }

  // String lights: instanced HDR bulbs on catenaries (emissive only).
  const bulbs = [];
  const strands = [
    { z: -6, x0: -4.5, x1: 4.5, y: 0.75, sag: 0.45 },
    { z: -8.5, x0: -5, x1: 5, y: 0.95, sag: 0.5 },
    { z: -11.5, x0: -6, x1: 6, y: 1.25, sag: 0.6 },
    { z: -15, x0: -7, x1: 7, y: 1.55, sag: 0.7 },
  ];
  const wirePts = [];
  for (const s of strands) {
    const n = Math.round((s.x1 - s.x0) / 0.26);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = s.x0 + (s.x1 - s.x0) * t;
      const y = s.y - s.sag * (1 - (2 * t - 1) ** 2);
      bulbs.push(new THREE.Vector3(x, y - 0.02, s.z));
      if (i > 0) wirePts.push(wirePts.at(-1).clone(), new THREE.Vector3(x, y, s.z));
      else wirePts.push(new THREE.Vector3(x, y, s.z));
    }
    wirePts.pop();
  }
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  bulbs.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    bulbMesh.setMatrixAt(i, m4);
    const hue = 0.08 + ((i * 37) % 11) * 0.004;
    col.setHSL(hue, 0.95, 0.55).multiplyScalar(14);
    bulbMesh.setColorAt(i, col);
  });
  group.add(bulbMesh);
  const wire = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: 0x0a0a0a }));
  group.add(wire);

  // Lamp posts with real light.
  const lamps = [];
  for (const [x, z, h] of [[2.3, -9, 3.2], [-3.4, -17, 3.4]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, h, 12), postMat);
    pole.position.set(x, GROUND_Y + h / 2, z);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.14, 16), postMat);
    head.position.set(x, GROUND_Y + h + 0.05, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.4).multiplyScalar(40) }));
    bulb.position.set(x, GROUND_Y + h - 0.04, z);
    const light = new THREE.PointLight(0xffb070, 18, 14, 2);
    light.position.copy(bulb.position);
    group.add(pole, head, bulb, light);
    lamps.push(bulb);
  }

  // Background: houses with lit windows, trees, hills.
  const houseMat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a2622, roughness: 0.8 });
  [[-9, -30, 6, 5], [-2, -34, 7, 6], [6, -28, 5, 4.5], [13, -36, 8, 7], [-16, -38, 7, 5.5]].forEach(([x, z, w, h], i) => {
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x2a2c33,
      roughness: 0.9,
      emissive: 0xffffff,
      emissiveIntensity: 2.2,
      emissiveMap: windowsTexture(17 + i * 31),
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), [houseMat, houseMat, houseMat, houseMat, winMat, houseMat]);
    box.position.set(x, GROUND_Y + h / 2, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, h * 0.45, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.6;
    roof.position.set(x, GROUND_Y + h + h * 0.22, z);
    group.add(box, roof);
  });
  const treeSpots = [[-5.5, -13], [5.8, -12], [-8, -20], [8.5, -19], [-4, -24], [3.5, -23], [11, -25], [-12, -26], [0.5, -45], [-6, -48], [9, -50]];
  treeSpots.forEach(([x, z], i) => {
    const t = tree(4 + (i % 3) * 1.4, 1.2 + (i % 2) * 0.5, i % 2 ? 0x16301f : 0x1d3a26);
    t.position.set(x, GROUND_Y, z);
    group.add(t);
  });
  const hills = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 16, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x07090d, side: THREE.BackSide }));
  hills.position.y = GROUND_Y + 2;
  group.add(hills);

  // Lighting (diorama layer only).
  const hemi = new THREE.HemisphereLight(0x5570b0, 0x1a1410, 0.9);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.5);
  moon.position.set(4, 8, -10);
  const key = new THREE.SpotLight(0xffd6a8, 26, 9, 0.5, 0.6, 1.4);
  key.position.set(-1.4, 1.1, -0.6);
  key.target.position.set(0, -0.15, SUBJECT_Z);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  const rim = new THREE.SpotLight(0x9fc0ff, 30, 8, 0.45, 0.7, 1.4);
  rim.position.set(1.6, 1.4, -4.6);
  rim.target.position.set(0, -0.1, SUBJECT_Z);
  group.add(hemi, moon, key, key.target, rim, rim.target);

  const labels = new THREE.Group();
  for (const m of [1, 2, 3, 5, 10, 20]) {
    const l = makeLabel(`${m} m`, 'label3d plain');
    l.position.set(-1.05, GROUND_Y + 0.72, -m);
    labels.add(l);
  }
  labels.visible = false;
  group.add(labels);

  setLayerDeep(group, LAYERS.DIORAMA);

  return {
    group,
    robot: bot,
    afTarget,
    chartCenter,
    bulbs,
    lamps,
    posts,
    labels,
    stringLightCenter: new THREE.Vector3(0, 0.5, -8.5),
  };
}
