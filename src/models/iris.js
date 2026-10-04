// Iris (mm, plane z = 0): each blade is the housing disc beyond a chord/arc at radius r, so N blades leave an N-gon.
import * as THREE from 'three';

function bladeShape(r, housingR, roundR) {
  const pts = [];
  const steps = 28;
  let yMax = Math.sqrt(Math.max(housingR * housingR - r * r, 0));
  if (roundR) {
    for (let i = 0; i <= 200; i++) {
      const y = (housingR * i) / 200;
      const x = r + roundR - Math.sqrt(Math.max(roundR * roundR - y * y, 0));
      if (x * x + y * y >= housingR * housingR || y >= roundR) break;
      yMax = y;
    }
  }
  const edge = (y) => (roundR ? r + roundR - Math.sqrt(Math.max(roundR * roundR - y * y, 0)) : r);
  for (let i = 0; i <= steps; i++) {
    const y = -yMax + (2 * yMax * i) / steps;
    pts.push(new THREE.Vector2(edge(y), y));
  }
  const a0 = Math.atan2(yMax, edge(yMax));
  for (let i = 1; i < steps; i++) {
    const a = a0 - (2 * a0 * i) / steps;
    pts.push(new THREE.Vector2(Math.cos(a) * housingR, Math.sin(a) * housingR));
  }
  return { shape: new THREE.Shape(pts), edge: pts.slice(0, steps + 1) };
}

export function createIris({ envMap, housingR = 18, maxR = 9 }) {
  const group = new THREE.Group();
  group.name = 'iris';
  const bladeMats = [0x4a4d57, 0x565a66].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.34, envMap, envMapIntensity: 1.5, side: THREE.DoubleSide }),
  );
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xd9dde6, transparent: true, opacity: 0.9 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1f, metalness: 0.7, roughness: 0.35, envMap, side: THREE.DoubleSide });
  const accentMat = new THREE.MeshBasicMaterial({ color: 0xffe100, toneMapped: false });

  const ring = new THREE.Mesh(new THREE.RingGeometry(housingR, housingR + 1.6, 96), ringMat);
  ring.position.z = -0.35;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(housingR + 1.6, housingR + 1.6, 1.2, 96, 1, true), ringMat);
  band.rotation.x = Math.PI / 2;
  const tick = new THREE.Mesh(new THREE.RingGeometry(housingR + 0.4, housingR + 1.3, 24, 1, Math.PI / 2 - 0.05, 0.1), accentMat);
  tick.position.z = -0.37;
  group.add(ring, band, tick);

  const blades = new THREE.Group();
  group.add(blades);
  let state = { r: -1, n: 0, rounded: null };
  let geo = null;
  let edgeGeo = null;

  function rebuild(r, n, rounded) {
    blades.clear();
    geo?.dispose();
    edgeGeo?.dispose();
    const { shape, edge } = bladeShape(r, housingR, rounded ? maxR * 1.05 : 0);
    geo = new THREE.ShapeGeometry(shape, 1);
    edgeGeo = new THREE.BufferGeometry().setFromPoints(edge.map((p) => new THREE.Vector3(p.x, p.y, 0)));
    const swirl = (1 - r / maxR) * 0.5;
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / n) * Math.PI * 2 + swirl + Math.PI / 2;
      pivot.position.z = -0.12 + (i / n) * 0.24;
      const mesh = new THREE.Mesh(geo, bladeMats[i % 2]);
      const line = new THREE.Line(edgeGeo, edgeMat);
      line.position.z = -0.01;
      pivot.add(mesh, line);
      blades.add(pivot);
    }
    state = { r, n, rounded };
  }

  return {
    group,
    set(r, n, rounded) {
      r = Math.max(0.2, Math.min(housingR - 0.5, r));
      if (Math.abs(r - state.r) > 1e-3 || n !== state.n || rounded !== state.rounded) rebuild(r, n, rounded);
    },
    get radius() {
      return state.r;
    },
  };
}
