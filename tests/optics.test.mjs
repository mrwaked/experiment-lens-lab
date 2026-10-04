import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cauchy, refractiveIndex, LAMBDA, GLASS } from '../src/optics/glass.js';
import {
  buildSystem,
  paraxial,
  withStop,
  stopRadiusFor,
  aimInfinity,
  traceRay,
  traceSequence,
  forwardSteps,
  refract,
  fresnelNormal,
  focusShift,
  cloneSystem,
  paraxialImageZ,
  elementsOf,
  edgeThickness,
  stopIndex,
} from '../src/optics/tracer.js';
import { DOUBLE_GAUSS_ROWS, makeDoubleGauss, achromat, biconvex, planoConvex } from '../src/optics/designs.js';

const close = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} vs ${expected}`);

function axisCrossing(r) {
  return r.z - (r.y * r.dz) / r.dy;
}

test('Cauchy fit reproduces nd and the F–C dispersion', () => {
  const g = GLASS['N-BK7'];
  cauchy(g);
  close(refractiveIndex(g, LAMBDA.d), g.nd, 1e-12, 'nd');
  close(refractiveIndex(g, LAMBDA.F) - refractiveIndex(g, LAMBDA.C), (g.nd - 1) / g.vd, 1e-12, 'nF − nC');
});

test('double-Gauss paraxial data at 100 mm scale', () => {
  const sys = buildSystem(DOUBLE_GAUSS_ROWS);
  const p = paraxial(sys);
  close(p.efl, 100, 0.05, 'EFL');
  close(p.bfl, 61.49, 0.05, 'BFL');
  close(p.stopRatio, 0.634, 0.005, 'stop ratio');
  close(p.entrancePupilZ - sys.surfaces[0].z, 57.9, 0.3, 'entrance pupil behind S1');
});

test('double-Gauss scales to 50 and 85 mm with the sensor at the rear focus', () => {
  for (const f of [50, 85]) {
    const { sys, info } = makeDoubleGauss(f);
    close(info.efl, f, 0.02, `EFL ${f}`);
    close(info.rearFocusZ, 0, 1e-9, `rear focus ${f}`);
    assert.equal(sys.imageZ, 0);
  }
});

test('double-Gauss at f/1.8 traces cleanly with small spherical aberration', () => {
  const base = buildSystem(DOUBLE_GAUSS_ROWS);
  const sys = withStop(base, stopRadiusFor(base, 1.8));
  const p = paraxial(sys);
  const stopR = stopRadiusFor(sys, 1.8);
  for (const frac of [-1, -0.5, 0.5, 1]) {
    const ray = aimInfinity(sys, 0, frac * stopR);
    assert.ok(ray, 'aimed');
    const r = traceRay(sys, ray, LAMBDA.d, { clip: false, toZ: null });
    assert.equal(r.status, 'ok');
    if (Math.abs(frac) === 1) assert.ok(Math.abs(axisCrossing(r) - p.rearFocusZ) < 0.2, `LSA ${axisCrossing(r) - p.rearFocusZ}`);
  }
});

test('double-Gauss semi-diameters cover the corner chief ray and keep edges thick', () => {
  const { sys, fieldDeg } = makeDoubleGauss(50);
  const si = stopIndex(sys);
  const chief = aimInfinity(sys, fieldDeg, 0);
  const r = traceRay(sys, chief, LAMBDA.d, { clip: false, toZ: null });
  sys.surfaces.forEach((s, i) => {
    if (i === si) return;
    assert.ok(Math.abs(r.points[i + 1][1]) <= s.sd + 1e-9, `surface ${i + 1}: chief ${r.points[i + 1][1]} > sd ${s.sd}`);
  });
  for (const g of elementsOf(sys)) {
    const h = sys.surfaces[g.first].sd;
    assert.ok(edgeThickness(sys, g.first, g.last, h) > 0.5 * 0.5, `edge of element ${g.first}`);
  }
  const clipped = traceRay(sys, chief, LAMBDA.d);
  assert.equal(clipped.status, 'ok');
});

test('achromat vs singlet: focal spread between F and C', () => {
  const ach = achromat();
  const sgl = biconvex('N-BK7', { f: 100, t: 4 });
  close(paraxial(ach, LAMBDA.d).efl, 100.07, 0.1, 'achromat EFL');
  const spread = (sys) => Math.abs(paraxial(sys, LAMBDA.F).rearFocusZ - paraxial(sys, LAMBDA.C).rearFocusZ);
  const a = spread(ach);
  const s = spread(sgl);
  close(a, 0.12, 0.03, 'achromat spread');
  close(s, 1.55, 0.05, 'singlet spread');
  assert.ok(s / a > 8, `ratio ${s / a}`);
});

test('conic plano-convex (k = −n²) is free of spherical aberration', () => {
  const lambda = LAMBDA.d;
  const asph = planoConvex({ asphere: true });
  const sph = planoConvex({ asphere: false });
  const f0 = paraxial(asph, lambda).rearFocusZ;
  for (const h of [2, 6, 10, 14, 18]) {
    const r = traceRay(asph, { z: -5, y: h, dz: 1, dy: 0 }, lambda, { toZ: null });
    assert.equal(r.status, 'ok');
    close(axisCrossing(r), f0, 1e-6, `asphere h=${h}`);
  }
  const lsa = (h) => axisCrossing(traceRay(sph, { z: -5, y: h, dz: 1, dy: 0 }, lambda, { toZ: null })) - paraxial(sph, lambda).rearFocusZ;
  const ratio = lsa(10) / lsa(5);
  close(ratio, 4, 0.4, 'LSA ∝ h²');
  assert.ok(lsa(10) < 0, 'marginal rays focus short');
});

test('total internal reflection and Fresnel losses', () => {
  const n = 1.5168;
  const at = (deg) => {
    const a = (deg * Math.PI) / 180;
    return refract(Math.cos(a), Math.sin(a), -1, 0, n, 1);
  };
  assert.ok(at(41.0));
  assert.equal(at(41.5), null);
  close(fresnelNormal(1, 1.5), 0.04, 1e-12, 'R at n=1.5');
  close(0.96 ** 24, 0.3754, 1e-4, 'uncoated');
  close(0.998 ** 24, 0.9531, 1e-4, 'coated');
});

test('Newton unit focusing lands a 0.5 m object on the sensor', () => {
  const { sys } = makeDoubleGauss(50);
  const d = focusShift(sys, 500);
  assert.ok(d > 0 && d < 10, `shift ${d}`);
  const moved = cloneSystem(sys, -d);
  close(paraxialImageZ(moved, sys.imageZ - 500), sys.imageZ, 1e-6, 'image on sensor');
});

test('traceSequence reports blocked rays at the stop', () => {
  const { sys } = makeDoubleGauss(50);
  const small = withStop(sys, 1);
  const ray = aimInfinity(sys, 0, 5);
  const r = traceSequence(small, ray, LAMBDA.d, forwardSteps(small));
  assert.equal(r.status, 'blocked');
  assert.equal(r.failedAt, stopIndex(sys));
});
