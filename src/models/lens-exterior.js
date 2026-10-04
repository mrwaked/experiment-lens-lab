// Lens barrels built from lathe profiles. Units: mm in camera coordinates (lens points to −z).
import * as THREE from 'three';
import { createMaterials, ringTextTexture } from './materials.js';
import { FLANGE_Z } from './camera-body.js';
import { sag } from '../optics/tracer.js';
import { disposeDeep } from '../core/tween.js';

export function lathe(points, segments = 96, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(
    points.map(([r, z]) => new THREE.Vector2(r, z)),
    segments,
    phiStart,
    phiLength,
  );
  g.rotateX(Math.PI / 2);
  return g;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function exteriorSpec(lensId, { focal, design } = {}) {
  if (lensId === 'z50' || lensId === 'z85') {
    const s1 = design.sys.surfaces[0];
    const glass = { R: 1 / s1.c, sd: s1.sd, vertexZ: s1.z };
    const is85 = lensId === 'z85';
    const lipZ = s1.z - (is85 ? 4.5 : 4);
    const length = -lipZ + FLANGE_Z;
    return {
      r: is85 ? 36.5 : 32,
      length,
      tubeR: is85 ? 34 : 29.8,
      lipR: is85 ? 35.6 : 31.2,
      rings: is85
        ? [
            { from: 9, to: 17, r: 36.8, tex: 'knurl' },
            { from: 30, to: 88, r: 37.2, tex: 'ribs' },
          ]
        : [
            { from: 8, to: 15, r: 32.3, tex: 'knurl' },
            { from: 21, to: 47, r: 32.7, tex: 'ribs' },
          ],
      glass,
      text: is85 ? '85mm 1:1.8   Ø67' : '50mm 1:1.8   Ø62',
      tubeTravel: is85 ? 22 : 12,
    };
  }
  if (lensId === 'z24120') {
    const length = 118;
    return {
      r: 42,
      length,
      tubeR: 38.8,
      lipR: 40.6,
      rings: [
        { from: 22, to: 66, r: 42.6, tex: 'ribs' },
        { from: 74, to: 86, r: 42.3, tex: 'knurl' },
      ],
      glass: { R: 92, sd: 31.5, vertexZ: FLANGE_Z - length + 6 },
      text: '24–120mm 1:4   Ø77',
      tubeTravel: 44,
    };
  }
  const f = clamp(focal ?? 50, 14, 400);
  const length = 48 + 0.55 * f ** 0.95;
  const r = 31 + 11 * (f / 400) + (f < 24 ? (24 - f) * 0.9 : 0);
  const sd = clamp(r - 8 + (f < 24 ? 4 : 0), 18, 46);
  return {
    r,
    length,
    tubeR: r - 2.4,
    lipR: r - 0.8,
    rings: [
      { from: 8, to: 15, r: r + 0.3, tex: 'knurl' },
      { from: length * 0.35, to: length * 0.72, r: r + 0.7, tex: 'ribs' },
    ],
    glass: { R: f < 24 ? sd * 1.25 : sd * 3.2, sd, vertexZ: FLANGE_Z - length + 5 },
    text: `${Math.round(f)}mm`,
    tubeTravel: 10,
  };
}

// One barrel. `front` holds the inner tube + front element and slides for focusing/zooming.
export function buildExterior(spec, envMap) {
  const M = createMaterials(envMap);
  const mats = {
    body: M.body(),
    chrome: M.chrome(),
    metal: M.metal(),
    black: M.black(),
    ribs: M.rubber(M.textures.ribs),
    knurl: M.rubber(M.textures.knurl),
    glass: M.frontGlass(),
    paint: M.paint(),
  };
  mats.body.color.set(0x18191c);
  mats.body.clearcoat = 0.08;
  mats.body.roughness = 0.62;
  mats.body.envMapIntensity = 0.35;
  for (const m of Object.values(mats)) m.side = THREE.DoubleSide;
  const group = new THREE.Group();
  group.name = 'lensExterior';
  const add = (geom, mat, parent = group) => {
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const F = FLANGE_Z;
  const { r, length, tubeR, lipR } = spec;
  const fixedFront = F - length + spec.tubeTravel * 0.35;

  add(lathe([[27.2, F - 0.01], [30.6, F - 0.01], [30.6, F - 3.4], [29.8, F - 3.8]]), mats.chrome);
  add(
    lathe([
      [29.8, F - 3.8],
      [r - 2.2, F - 4.8],
      [r, F - 6.5],
      [r, fixedFront + 1.2],
      [r - 0.9, fixedFront],
      [tubeR + 0.4, fixedFront],
      [tubeR + 0.4, fixedFront + 6],
    ]),
    mats.body,
  );
  const dot = add(new THREE.SphereGeometry(1.1, 12, 8), mats.paint);
  dot.position.set(0, r - 0.4, F - 5.6);

  const rings = {};
  for (const ring of spec.rings) {
    const z0 = F - ring.from;
    const z1 = F - ring.to;
    const mesh = add(
      lathe([
        [r - 0.2, z0],
        [ring.r, z0 - 0.7],
        [ring.r, z1 + 0.7],
        [r - 0.2, z1],
      ], 128),
      ring.tex === 'ribs' ? mats.ribs : mats.knurl,
    );
    rings[ring.tex === 'ribs' ? 'focus' : 'control'] = mesh;
  }

  const front = new THREE.Group();
  group.add(front);
  const lipZ = F - length;
  const g = spec.glass;
  const edgeZ = g.vertexZ + sag({ c: 1 / g.R, k: 0 }, g.sd);
  const rInner = g.sd + 1.2;
  add(lathe([[tubeR, fixedFront + 10], [tubeR, lipZ + 1], [lipR, lipZ + 0.6], [lipR, lipZ]]), mats.body, front);
  const textRing = new THREE.Mesh(
    new THREE.RingGeometry(rInner + 1.2, lipR - 0.1, 96, 1),
    new THREE.MeshStandardMaterial({ map: ringTextTexture(spec.text, { accentText: 'LENS LAB' }), roughness: 0.7, metalness: 0.1 }),
  );
  textRing.rotation.y = Math.PI;
  textRing.position.z = lipZ - 0.02;
  front.add(textRing);
  add(lathe([[rInner + 1.2, lipZ], [rInner, lipZ + 0.8], [rInner, edgeZ + 0.3], [g.sd * 0.6, edgeZ + 1.5]]), mats.black, front);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const h = (g.sd * i) / 24;
    pts.push([Math.max(h, 1e-3), g.vertexZ + sag({ c: 1 / g.R, k: 0 }, h)]);
  }
  pts.push([g.sd, edgeZ + 0.6]);
  const glassMesh = add(lathe(pts, 96), mats.glass, front);
  glassMesh.castShadow = false;

  return {
    group,
    front,
    rings,
    glassMesh,
    mats,
    spec,
    anchors: {
      front: new THREE.Vector3(0, g.sd * 0.55, g.vertexZ - 1),
      focus: new THREE.Vector3(0, (spec.rings[1]?.r ?? r) + 0.5, F - ((spec.rings[1]?.from ?? 20) + (spec.rings[1]?.to ?? 40)) / 2),
      control: new THREE.Vector3(0, -(spec.rings[0]?.r ?? r) - 0.5, F - ((spec.rings[0]?.from ?? 8) + (spec.rings[0]?.to ?? 15)) / 2),
      mount: new THREE.Vector3(r * 0.7, -r * 0.7, F - 3),
    },
    dispose() {
      textRing.material.map.dispose();
      disposeDeep(group);
    },
  };
}

// Owns the mounted lens: rebuilds on preset/focal changes, drives focus travel and ring rotation.
export function createLensRig({ envMap, designs, focusShiftFor }) {
  const group = new THREE.Group();
  group.name = 'lensRig';
  let current = null;
  let currentId = null;
  let currentFocal = 0;
  let travel = 0;
  const listeners = new Set();

  function build(id, focal) {
    if (current) {
      group.remove(current.group);
      current.dispose();
    }
    current = buildExterior(exteriorSpec(id, { focal, design: designs[id] }), envMap);
    group.add(current.group);
    currentId = id;
    currentFocal = focal;
    for (const fn of listeners) fn(current);
  }

  function update(d) {
    const id = d.lens.id;
    if (id !== currentId || (d.lens.kind === 'free' && Math.abs(d.focal - currentFocal) / currentFocal > 0.02)) build(id, d.focal);
    let t = 0;
    if (d.lens.kind === 'prime') t = focusShiftFor(id, d.focusM);
    else if (d.lens.kind === 'zoom') t = (current.spec.tubeTravel * Math.log(d.focal / 24)) / Math.log(5);
    travel = Number.isFinite(t) ? t : 0;
    current.front.position.z = -travel;
    const focusAngle = Number.isFinite(d.focusM) ? 2.4 / Math.max(d.focusM, 0.3) : 0;
    if (current.rings.focus) current.rings.focus.rotation.z = d.lens.kind === 'zoom' ? Math.log(d.focal / 24) * 1.2 : focusAngle;
    if (current.rings.control && d.lens.kind === 'zoom') current.rings.control.rotation.z = focusAngle;
  }

  return {
    group,
    update,
    onRebuild(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get exterior() {
      return current;
    },
    get travel() {
      return travel;
    },
    setOpacity(a) {
      if (!current) return;
      current.group.traverse((o) => {
        if (!o.material) return;
        const ghost = a < 0.999;
        if (o.material.transparent !== ghost) {
          o.material.transparent = ghost;
          o.material.needsUpdate = true;
        }
        o.material.opacity = a;
        o.material.depthWrite = a > 0.5;
      });
      current.group.visible = a > 0.001;
    },
  };
}
