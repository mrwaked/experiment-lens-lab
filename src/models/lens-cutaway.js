// Lens cross-section like a construction diagram: far-half glass skins plus tinted caps on the cut plane x = 0 (mm).
import * as THREE from 'three';
import { sag, stopIndex, elementsOf } from '../optics/tracer.js';
import { resolveGlass } from '../optics/glass.js';
import { lathe } from './lens-exterior.js';
import { FLANGE_Z } from './camera-body.js';
import { hatchTexture } from './materials.js';
import { createIris } from './iris.js';
import { makeLabel } from '../ui/hotspots.js';

export const GLASS_COLORS = {
  crown: 0x8fd3ff,
  flint: 0xb79bff,
  ed: 0xffc861,
  lanthanum: 0x7df0c8,
  other: 0x9fe7ff,
  custom: 0x9fe7ff,
};

function surfaceProfile(s, h, steps = 20) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = (h * i) / steps;
    pts.push([y, s.z + sag(s, y)]);
  }
  return pts;
}

function capShape(front, back, h, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = -h + (2 * h * i) / steps;
    pts.push(new THREE.Vector2(front.z + sag(front, y), y));
  }
  for (let i = 0; i <= steps; i++) {
    const y = h - (2 * h * i) / steps;
    pts.push(new THREE.Vector2(back.z + sag(back, y), y));
  }
  return pts;
}

function onCutPlane(geo) {
  geo.rotateY(-Math.PI / 2);
  return geo;
}

// Glass of every element in `sys`: half-lathe skins, edge bands, tinted section caps + outlines.
export function addGlassSections(sys, parent, { envMap, skinOpacity = 0.2, capOpacity = 0.42 } = {}) {
  const S = sys.surfaces;
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfeeff,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: skinOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMap,
    envMapIntensity: 1.6,
    clearcoat: 1,
  });
  const outlineMat = new THREE.LineBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.85 });
  const elements = [];
  let maxSd = 0;
  for (const g of elementsOf(sys)) {
    const h = S[g.first].sd;
    maxSd = Math.max(maxSd, h);
    for (let i = g.first; i <= g.last; i++) {
      const skin = new THREE.Mesh(lathe(surfaceProfile(S[i], h), 64, 0, Math.PI), skinMat);
      skin.renderOrder = 3;
      parent.add(skin);
    }
    for (let i = g.first; i < g.last; i++) {
      const front = S[i];
      const back = S[i + 1];
      const glass = resolveGlass(front.glass);
      const color = GLASS_COLORS[glass.kind] ?? GLASS_COLORS.other;
      parent.add(new THREE.Mesh(lathe([[h, front.z + sag(front, h)], [h, back.z + sag(back, h)]], 64, 0, Math.PI), skinMat));
      const pts = capShape(front, back, h);
      const capMat = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: capOpacity,
        roughness: 0.3,
        metalness: 0,
        emissive: color,
        emissiveIntensity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cap = new THREE.Mesh(onCutPlane(new THREE.ShapeGeometry(new THREE.Shape(pts))), capMat);
      cap.renderOrder = 2;
      const outline = new THREE.LineLoop(onCutPlane(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0)))), outlineMat);
      outline.position.x = -0.05;
      parent.add(cap, outline);
      elements.push({ cap, glass, glassKey: front.glass, first: i, center: new THREE.Vector3(0, 0, (front.z + back.z) / 2), h, group: g });
    }
  }
  return { elements, maxSd };
}

export function createLensCutaway({ envMap, design, outerR, frontZ }) {
  const { sys } = design;
  const S = sys.surfaces;
  const group = new THREE.Group();
  group.name = 'lensCutaway';
  const optics = new THREE.Group();
  group.add(optics);
  const { elements, maxSd } = addGlassSections(sys, optics, { envMap });

  // Barrel: fixed rear sleeve + moving inner tube holding the glass (unit focusing).
  const inner = maxSd + 1.4;
  const tubeOuter = outerR - 2.4;
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x202226, metalness: 0.55, roughness: 0.45, envMap, side: THREE.DoubleSide });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.95, side: THREE.DoubleSide });
  const hatch = hatchTexture();
  hatch.wrapS = hatch.wrapT = THREE.RepeatWrapping;
  hatch.repeat.set(0.25, 0.25);
  const sectionMat = new THREE.MeshBasicMaterial({ map: hatch, side: THREE.DoubleSide });

  const halves = { far: new THREE.Group(), near: new THREE.Group() };
  group.add(halves.far, halves.near);
  const tubeHalves = { far: new THREE.Group(), near: new THREE.Group() };
  optics.add(tubeHalves.far, tubeHalves.near);

  const sleeveProfile = [[27.2, FLANGE_Z], [outerR, FLANGE_Z - 5], [outerR, FLANGE_Z - 44], [tubeOuter + 0.3, FLANGE_Z - 44], [tubeOuter + 0.3, FLANGE_Z - 6], [27.2, FLANGE_Z - 3]];
  const tubeProfile = [[tubeOuter, FLANGE_Z - 12], [tubeOuter, frontZ + 0.5], [tubeOuter + 1.2, frontZ], [inner, frontZ], [inner, FLANGE_Z - 12]];
  const sectionRect = (profile) => profile.map(([r, z]) => new THREE.Vector2(z, r));

  for (const [key, phi0] of [['far', 0], ['near', Math.PI]]) {
    halves[key].add(new THREE.Mesh(lathe([...sleeveProfile, sleeveProfile[0]], 96, phi0, Math.PI), barrelMat));
    tubeHalves[key].add(new THREE.Mesh(lathe([...tubeProfile, tubeProfile[0]], 96, phi0, Math.PI), barrelMat));
    const lining = new THREE.Mesh(lathe([[inner - 0.05, frontZ + 1], [inner - 0.05, FLANGE_Z - 12]], 96, phi0, Math.PI), innerMat);
    tubeHalves[key].add(lining);
  }
  for (const sign of [1, -1]) {
    const flip = (pts) => pts.map((p) => new THREE.Vector2(p.x, p.y * sign));
    const sleeveCap = new THREE.Mesh(onCutPlane(new THREE.ShapeGeometry(new THREE.Shape(flip(sectionRect(sleeveProfile))))), sectionMat);
    sleeveCap.position.x = -0.02;
    halves.far.add(sleeveCap);
    const tubeCap = new THREE.Mesh(onCutPlane(new THREE.ShapeGeometry(new THREE.Shape(flip(sectionRect(tubeProfile))))), sectionMat);
    tubeCap.position.x = -0.02;
    tubeHalves.far.add(tubeCap);
  }

  // Spacers between groups (retaining rings), drawn only as section caps + far half.
  const groups = elementsOf(sys);
  for (let k = 0; k < groups.length - 1; k++) {
    const a = S[groups[k].last];
    const b = S[groups[k + 1].first];
    const ha = S[groups[k].first].sd;
    const hb = S[groups[k + 1].first].sd;
    const z0 = a.z + sag(a, ha);
    const z1 = b.z + sag(b, hb);
    if (z1 - z0 < 0.3) continue;
    const rIn = Math.max(ha, hb) + 0.25;
    const prof = [[rIn, z0 + 0.1], [inner, z0 + 0.1], [inner, z1 - 0.1], [rIn, z1 - 0.1]];
    tubeHalves.far.add(new THREE.Mesh(lathe([...prof, prof[0]], 64, 0, Math.PI), barrelMat));
    for (const sign of [1, -1]) {
      const sc = new THREE.Mesh(onCutPlane(new THREE.ShapeGeometry(new THREE.Shape(sectionRect(prof).map((p) => new THREE.Vector2(p.x, p.y * sign))))), sectionMat);
      sc.position.x = -0.02;
      tubeHalves.far.add(sc);
    }
  }

  const si = stopIndex(sys);
  const stopZ = S[si].z;
  const iris = createIris({ envMap, housingR: inner - 0.2, maxR: S[si].sd });
  iris.group.position.z = stopZ;
  optics.add(iris.group);

  // Labels for element groups.
  const labels = new THREE.Group();
  const names = ['Front element', 'Front doublet', 'Rear doublet', 'Rear element'];
  groups.forEach((g, k) => {
    const zc = (S[g.first].z + S[g.last].z) / 2;
    const l = makeLabel(`<b>${String(k + 1).padStart(2, '0')}</b> ${names[k] ?? `Group ${k + 1}`}`, 'label3d tag center');
    l.position.set(0, S[g.first].sd + (k % 2 ? 11 : 4.5), zc);
    labels.add(l);
  });
  const stopLabel = makeLabel('Aperture stop', 'label3d acc center');
  stopLabel.position.set(0, -inner - 6, stopZ);
  labels.add(stopLabel);
  const sensorLabel = makeLabel('Sensor', 'label3d center');
  sensorLabel.position.set(0, -15, 0);
  labels.add(sensorLabel);
  labels.visible = false;
  group.add(labels);

  let open = 1;
  function setOpen(t) {
    open = t;
    const near = [halves.near, tubeHalves.near];
    for (const h of near) {
      h.position.x = -t * (outerR * 2.4);
      h.visible = t < 0.999;
      h.traverse((o) => {
        if (o.material && !o.material.userData.cutFade) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.userData.cutFade = true;
        }
        if (o.material) o.material.opacity = 1 - t;
      });
    }
  }
  setOpen(1);

  return {
    group,
    optics,
    iris,
    elements,
    labels,
    stopZ,
    innerR: inner,
    setOpen,
    get open() {
      return open;
    },
    setFocusShift(delta) {
      optics.position.z = -delta;
    },
  };
}
