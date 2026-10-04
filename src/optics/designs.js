import { buildSystem, paraxial, computeSemiDiameters, elementsOf, cloneSystem } from './tracer.js';
import { resolveGlass } from './glass.js';

// Classic 6-element double-Gauss (EFL ≈ 100 mm): radius / thickness after / glass after.
export const DOUBLE_GAUSS_ROWS = [
  { R: 56.20238, t: 8.75, glass: 'N-SSK2' },
  { R: 152.2858, t: 0.5 },
  { R: 37.68262, t: 12.5, glass: 'N-SK2' },
  { R: Infinity, t: 3.8, glass: 'F5' },
  { R: 24.2313, t: 16.369445 },
  { R: Infinity, t: 13.747957, stop: true },
  { R: -28.37731, t: 3.8, glass: 'F5' },
  { R: Infinity, t: 11, glass: 'N-SK16' },
  { R: -37.92546, t: 0.5 },
  { R: 177.41176, t: 7, glass: 'N-SK16' },
  { R: -79.41143, t: 61.487536 },
];

const HALF_DIAGONAL = Math.hypot(35.9, 23.9) / 2;

// Double-Gauss scaled to `focal`, sensor (image plane) at z = 0 for infinity focus.
export function makeDoubleGauss(focal, { maxFNumber = 1.8 } = {}) {
  const efl100 = paraxial(buildSystem(DOUBLE_GAUSS_ROWS)).efl;
  const scale = focal / efl100;
  let sys = buildSystem(DOUBLE_GAUSS_ROWS, { scale, imageAt: 0 });
  sys = cloneSystem(sys, -paraxial(sys).rearFocusZ);
  sys.imageZ = 0;
  const fieldDeg = (Math.atan(HALF_DIAGONAL / focal) * 180) / Math.PI;
  sys = computeSemiDiameters(sys, { fNumber: maxFNumber, fieldDeg, rimFraction: 0.5 });
  return { sys, scale, fieldDeg, info: paraxial(sys), elements: elementsOf(sys) };
}

// Bench systems start at z = 0 and put the image plane at the paraxial rear focus.
function benchSystem(rows) {
  const sys = buildSystem(rows, { originAtFirst: true });
  sys.imageZ = paraxial(sys).rearFocusZ;
  return sys;
}

export function biconvex(glass = 'N-BK7', { f = 100, t = 4, sd = 22 } = {}) {
  const R = 2 * (resolveGlass(glass).nd - 1) * f;
  return benchSystem([
    { R, t, glass, sd },
    { R: -R, t: 0, sd },
  ]);
}

export function biconcave(glass = 'N-BK7', { f = 100, t = 2.5, sd = 22 } = {}) {
  const R = 2 * (resolveGlass(glass).nd - 1) * f;
  return benchSystem([
    { R: -R, t, glass, sd },
    { R, t: 0, sd },
  ]);
}

// Achromatic doublet (AC254-100-A style): N-BK7 + SF5, f ≈ 100 mm.
export function achromat({ sd = 12.7 } = {}) {
  return benchSystem([
    { R: 62.75, t: 4.0, glass: 'N-BK7', sd },
    { R: -45.71, t: 2.5, glass: 'SF5', sd },
    { R: -128.23, t: 0, sd },
  ]);
}

// Plano-convex, flat side first. conic k = −n² makes the exit surface a stigmatic hyperboloid.
export function planoConvex({ asphere = false, glass = 'N-BK7', f = 100, t = 8, sd = 20 } = {}) {
  const n = resolveGlass(glass).nd;
  return benchSystem([
    { R: Infinity, t, glass, sd },
    { R: -(n - 1) * f, k: asphere ? -n * n : 0, t: 0, sd },
  ]);
}

// Parallel-sided slab of index n (or glass name), thickness t.
export function slab(glass, { t = 30, sd = 40 } = {}) {
  const sys = buildSystem(
    [
      { R: Infinity, t, glass, sd },
      { R: Infinity, t: 0, sd },
    ],
    { originAtFirst: true },
  );
  sys.imageZ = t + 60;
  return sys;
}
