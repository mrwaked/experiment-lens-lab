// Main-view overlays for the "field" chapters: tripod, view frustum, focus plane and DoF slab (metres).
import * as THREE from 'three';
import { GROUND_Y } from './diorama.js';
import { makeLabel } from '../ui/hotspots.js';
import { formatDistance } from '../optics/photo-math.js';

const HALF_W = 35.9 / 2;
const HALF_H = 23.9 / 2;
const FAR = 40;

function tripod() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.7, roughness: 0.35 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9 });
  const top = -0.041;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.05, 24), metal);
  head.position.y = top - 0.025;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.07), metal);
  plate.position.y = top - 0.002;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.3, 16), metal);
  column.position.y = top - 0.2;
  const spider = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.05, 24), metal);
  spider.position.y = top - 0.33;
  g.add(head, plate, column, spider);
  const hub = new THREE.Vector3(0, top - 0.33, 0.01);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const foot = new THREE.Vector3(Math.cos(a) * 0.46, GROUND_Y, Math.sin(a) * 0.46 + 0.02);
    const len = hub.distanceTo(foot);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, len, 12), metal);
    leg.position.copy(hub).lerp(foot, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().sub(hub).normalize());
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), rubber);
    shoe.position.copy(foot);
    g.add(leg, shoe);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

function quadStrip(color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36 * 3), 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

function edgeLines(color, opacity, count) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  lines.frustumCulled = false;
  return lines;
}

export function createFieldHelpers() {
  const group = new THREE.Group();
  group.name = 'fieldHelpers';
  const tri = tripod();
  group.add(tri);

  const frustumFaces = quadStrip(0xffffff, 0.035);
  const frustumEdges = edgeLines(0xffffff, 0.35, 8);
  const focusFace = quadStrip(0xffe100, 0.1);
  const focusEdges = edgeLines(0xffe100, 0.9, 8);
  const slabFaces = quadStrip(0x52f59a, 0.07);
  const slabEdges = edgeLines(0x52f59a, 0.55, 24);
  group.add(frustumFaces, frustumEdges, slabFaces, slabEdges, focusFace, focusEdges);

  const focusLabel = makeLabel('', 'label3d acc');
  const nearLabel = makeLabel('', 'label3d');
  const farLabel = makeLabel('', 'label3d');
  group.add(focusLabel, nearLabel, farLabel);

  const corners = (origin, dist, f) => {
    const hw = (dist * HALF_W) / f;
    const hh = (dist * HALF_H) / f;
    const z = origin.z - dist;
    return [
      new THREE.Vector3(-hw, -hh, z),
      new THREE.Vector3(hw, -hh, z),
      new THREE.Vector3(hw, hh, z),
      new THREE.Vector3(-hw, hh, z),
    ];
  };

  function writeTris(mesh, tris) {
    const arr = mesh.geometry.attributes.position.array;
    arr.fill(0);
    let i = 0;
    for (const t of tris) for (const p of t) {
      arr[i++] = p.x;
      arr[i++] = p.y;
      arr[i++] = p.z;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.setDrawRange(0, tris.length * 3);
  }

  function writeLines(lines, segs) {
    const arr = lines.geometry.attributes.position.array;
    let i = 0;
    for (const [a, b] of segs) {
      arr[i++] = a.x;
      arr[i++] = a.y;
      arr[i++] = a.z;
      arr[i++] = b.x;
      arr[i++] = b.y;
      arr[i++] = b.z;
    }
    lines.geometry.attributes.position.needsUpdate = true;
    lines.geometry.setDrawRange(0, segs.length * 2);
  }

  const rect = (c) => [
    [c[0], c[1], c[2]],
    [c[0], c[2], c[3]],
  ];
  const loop = (c) => [
    [c[0], c[1]],
    [c[1], c[2]],
    [c[2], c[3]],
    [c[3], c[0]],
  ];

  const opts = { frustum: true, focus: true, slab: true };
  function show(o) {
    Object.assign(opts, o);
    frustumFaces.visible = frustumEdges.visible = opts.frustum;
    focusFace.visible = focusEdges.visible = focusLabel.visible = opts.focus;
    slabFaces.visible = slabEdges.visible = nearLabel.visible = farLabel.visible = opts.slab;
  }

  let lastSig = '';
  function update(d, back = 0) {
    const sig = `${d.focal}|${d.focusM}|${d.N}|${back}|${d.dof.nearM}`;
    if (sig === lastSig) return;
    lastSig = sig;
    tri.position.z = back;
    const origin = new THREE.Vector3(0, 0, back - d.pupilM);
    const far = corners(origin, FAR, d.focal);
    writeTris(frustumFaces, [
      [origin, far[0], far[1]],
      [origin, far[1], far[2]],
      [origin, far[2], far[3]],
      [origin, far[3], far[0]],
    ]);
    writeLines(frustumEdges, far.map((c) => [origin, c]));

    const focusDist = Number.isFinite(d.focusM) ? d.focusM - d.pupilM : FAR * 0.98;
    const fc = corners(origin, focusDist, d.focal);
    writeTris(focusFace, rect(fc));
    writeLines(focusEdges, loop(fc));
    focusLabel.position.copy(fc[2]);
    focusLabel.element.innerHTML = `Focus · ${Number.isFinite(d.focusM) ? formatDistance(d.focusM * 1000) : '∞'}`;

    const nearD = Math.max(0.05, d.dof.nearM - d.pupilM);
    const farD = Number.isFinite(d.dof.farM) ? Math.min(FAR, d.dof.farM - d.pupilM) : FAR;
    const n = corners(origin, nearD, d.focal);
    const f = corners(origin, farD, d.focal);
    writeTris(slabFaces, [...rect(n), ...rect(f), [n[0], n[1], f[1]], [n[0], f[1], f[0]], [n[1], n[2], f[2]], [n[1], f[2], f[1]], [n[2], n[3], f[3]], [n[2], f[3], f[2]], [n[3], n[0], f[0]], [n[3], f[0], f[3]]]);
    writeLines(slabEdges, [...loop(n), ...loop(f), [n[0], f[0]], [n[1], f[1]], [n[2], f[2]], [n[3], f[3]]]);
    nearLabel.position.copy(n[1]);
    nearLabel.element.innerHTML = `Near sharp · ${formatDistance(d.dof.nearM * 1000)}`;
    farLabel.position.copy(f[1]);
    farLabel.element.innerHTML = `Far sharp · ${Number.isFinite(d.dof.farM) ? formatDistance(d.dof.farM * 1000) : '∞'}`;
  }

  return { group, update, show, tripod: tri };
}
