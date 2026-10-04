// 2D meridional sequential tracer (mm, light along +z); surfaces are conics c(y² + (1+k)z²) − 2z = 0.
import { refractiveIndex, LAMBDA } from './glass.js';

const EPS = 1e-9;

export function buildSystem(rows, { scale = 1, imageAt = 0, originAtFirst = false } = {}) {
  const total = rows.reduce((sum, r) => sum + (r.t ?? 0), 0) * scale;
  let z = originAtFirst ? 0 : imageAt - total;
  const surfaces = rows.map((r) => {
    const s = {
      z,
      c: r.R == null || !Number.isFinite(r.R) ? 0 : 1 / (r.R * scale),
      k: r.k ?? 0,
      glass: r.glass ?? 'air',
      sd: r.sd != null ? r.sd * scale : Infinity,
      stop: !!r.stop,
      label: r.label,
    };
    z += (r.t ?? 0) * scale;
    return s;
  });
  return { surfaces, imageZ: z };
}

export function cloneSystem(sys, dz = 0) {
  return { ...sys, imageZ: sys.imageZ, surfaces: sys.surfaces.map((s) => ({ ...s, z: s.z + dz })) };
}

// Aperture stop surface; a system without a marked stop (a single element) is stopped by its first surface.
export function stopIndex(sys) {
  const i = sys.surfaces.findIndex((s) => s.stop);
  return i >= 0 ? i : 0;
}

export function sag(s, y) {
  if (s.c === 0) return 0;
  const root = 1 - (1 + s.k) * s.c * s.c * y * y;
  if (root < 0) return NaN;
  return (s.c * y * y) / (1 + Math.sqrt(root));
}

// Distance t along (dz,dy) from (oz,oy) to the vertex branch of surface s, or null.
export function intersect(s, oz, oy, dz, dy) {
  const zl = oz - s.z;
  if (s.c === 0) {
    if (Math.abs(dz) < 1e-14) return null;
    const t = -zl / dz;
    return t > EPS ? t : null;
  }
  const c = s.c;
  const K = 1 + s.k;
  const a = c * (dy * dy + K * dz * dz);
  const b = 2 * c * (oy * dy + K * zl * dz) - 2 * dz;
  const cc = c * (oy * oy + K * zl * zl) - 2 * zl;
  let roots;
  if (Math.abs(a) < 1e-14) {
    if (Math.abs(b) < 1e-14) return null;
    roots = [-cc / b];
  } else {
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return null;
    const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(disc));
    roots = [q / a, q !== 0 ? cc / q : Infinity];
  }
  let best = null;
  for (const t of roots) {
    if (!(t > EPS)) continue;
    const zh = zl + t * dz;
    if (1 - c * K * zh <= 0) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

export function surfaceNormal(s, z, y) {
  if (s.c === 0) return { nz: -1, ny: 0 };
  const zl = z - s.z;
  const nz = s.c * (1 + s.k) * zl - 1;
  const ny = s.c * y;
  const len = Math.hypot(nz, ny);
  return { nz: nz / len, ny: ny / len };
}

export function refract(dz, dy, nz, ny, n1, n2) {
  let cosi = -(nz * dz + ny * dy);
  if (cosi < 0) {
    nz = -nz;
    ny = -ny;
    cosi = -cosi;
  }
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const f = eta * cosi - Math.sqrt(k);
  return { dz: eta * dz + f * nz, dy: eta * dy + f * ny };
}

export function reflect(dz, dy, nz, ny) {
  const d = nz * dz + ny * dy;
  return { dz: dz - 2 * d * nz, dy: dy - 2 * d * ny };
}

// Unpolarised Fresnel reflectance at normal incidence.
export function fresnelNormal(n1, n2) {
  return ((n1 - n2) / (n1 + n2)) ** 2;
}

function mediumBefore(sys, i) {
  return i <= 0 ? 'air' : sys.surfaces[i - 1].glass;
}

// Trace through steps [{ i, mode: 'refract' | 'reflect' }] → points [[z, y]], per-segment n, status.
export function traceSequence(sys, start, lambda, steps, { clip = true, toZ = null, overshoot = 0 } = {}) {
  let { z, y, dz, dy } = start;
  const len = Math.hypot(dz, dy);
  dz /= len;
  dy /= len;
  const points = [[z, y]];
  const segN = [];
  let n = refractiveIndex(mediumBefore(sys, steps.length ? steps[0].i : 0), lambda);
  let status = 'ok';
  let failedAt = -1;
  for (const step of steps) {
    const s = sys.surfaces[step.i];
    const t = intersect(s, z, y, dz, dy);
    if (t === null) {
      status = 'miss';
      failedAt = step.i;
      if (Math.abs(dz) > 1e-9) {
        const tp = (s.z - z) / dz;
        if (tp > 0) {
          points.push([z + tp * dz, y + tp * dy]);
          segN.push(n);
        }
      }
      break;
    }
    z += t * dz;
    y += t * dy;
    points.push([z, y]);
    segN.push(n);
    if (clip && Math.abs(y) > s.sd) {
      status = 'blocked';
      failedAt = step.i;
      break;
    }
    const { nz, ny } = surfaceNormal(s, z, y);
    if (step.mode === 'reflect') {
      ({ dz, dy } = reflect(dz, dy, nz, ny));
      continue;
    }
    const forward = dz > 0;
    const n2 = refractiveIndex(forward ? s.glass : mediumBefore(sys, step.i), lambda);
    const out = refract(dz, dy, nz, ny, n, n2);
    if (!out) {
      status = 'tir';
      failedAt = step.i;
      break;
    }
    ({ dz, dy } = out);
    n = n2;
  }
  if (status === 'ok' && toZ !== null && Math.abs(dz) > 1e-12) {
    const t = (toZ - z) / dz;
    if (t > 0) {
      z += t * dz;
      y += t * dy;
      points.push([z, y]);
      segN.push(n);
      if (overshoot > 0) {
        points.push([z + overshoot * dz, y + overshoot * dy]);
        segN.push(n);
      }
    }
  }
  return { points, segN, status, failedAt, z, y, dz, dy, n };
}

export function forwardSteps(sys, from = 0, to = sys.surfaces.length - 1) {
  const steps = [];
  for (let i = from; i <= to; i++) steps.push({ i, mode: 'refract' });
  return steps;
}

// Ghost path: reflect at surface a (going forward), travel back, reflect at b < a, continue to image.
export function ghostSteps(sys, a, b) {
  const steps = [];
  for (let i = 0; i < a; i++) steps.push({ i, mode: 'refract' });
  steps.push({ i: a, mode: 'reflect' });
  for (let i = a - 1; i > b; i--) steps.push({ i, mode: 'refract' });
  steps.push({ i: b, mode: 'reflect' });
  for (let i = b + 1; i < sys.surfaces.length; i++) steps.push({ i, mode: 'refract' });
  return steps;
}

export function traceRay(sys, start, lambda = LAMBDA.d, opts = {}) {
  const { from = 0, to = sys.surfaces.length - 1, toZ = sys.imageZ, clip = true, overshoot = 0 } = opts;
  return traceSequence(sys, start, lambda, forwardSteps(sys, from, to), { clip, toZ, overshoot });
}

// --- paraxial optics -----------------------------------------------------------------------------

export function paraxialTrace(sys, y, u, lambda = LAMBDA.d) {
  const heights = [];
  let n = 1;
  const S = sys.surfaces;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    heights.push(y);
    const n2 = refractiveIndex(s.glass, lambda);
    u = (n * u - y * s.c * (n2 - n)) / n2;
    if (i < S.length - 1) y += u * (S[i + 1].z - s.z);
    n = n2;
  }
  return { heights, y, u };
}

export function paraxial(sys, lambda = LAMBDA.d) {
  const S = sys.surfaces;
  const A = paraxialTrace(sys, 1, 0, lambda);
  const B = paraxialTrace(sys, 0, 1, lambda);
  const efl = -1 / A.u;
  const bfl = -A.y / A.u;
  // Front focal distance = −D/C of the system matrix; C = A.u, D = B.u.
  const ffd = -B.u / A.u;
  const first = S[0].z;
  const last = S[S.length - 1].z;
  const si = stopIndex(sys);
  const result = {
    efl,
    bfl,
    ffd,
    frontFocusZ: first - ffd,
    rearFocusZ: last + bfl,
    firstZ: first,
    lastZ: last,
  };
  {
    const yA = A.heights[si];
    const yB = B.heights[si];
    result.stopRatio = yA; // stop height per unit entrance-pupil height
    result.entrancePupilZ = first + yB / yA;
  }
  return result;
}

export function stopRadiusFor(sys, fNumber, lambda = LAMBDA.d) {
  const p = paraxial(sys, lambda);
  return (p.stopRatio * p.efl) / (2 * fNumber);
}

export function withStop(sys, radius) {
  return { ...sys, surfaces: sys.surfaces.map((s) => (s.stop ? { ...s, sd: radius } : s)) };
}

// Where a paraxial ray crosses the axis after the last surface, starting from an on-axis point.
export function paraxialImageZ(sys, objectZ, lambda = LAMBDA.d) {
  const S = sys.surfaces;
  const u0 = 1e-3;
  const y0 = u0 * (S[0].z - objectZ);
  const r = paraxialTrace(sys, y0, u0, lambda);
  return S[S.length - 1].z - r.y / r.u;
}

// Unit-focusing shift δ from Newton's (L − δ)·δ = f², L measured from the infinity front focal point.
export function focusShift(sys, distanceFromImage, lambda = LAMBDA.d) {
  if (!Number.isFinite(distanceFromImage)) return 0;
  const p = paraxial(sys, lambda);
  const objectZ = sys.imageZ - distanceFromImage;
  const L = p.frontFocusZ - objectZ;
  const disc = L * L - 4 * p.efl * p.efl;
  if (disc < 0) return NaN;
  return (L - Math.sqrt(disc)) / 2;
}

// --- ray aiming ----------------------------------------------------------------------------------

function secant(f, x0, x1, tol = 1e-10, maxIter = 40) {
  let f0 = f(x0);
  let f1 = f(x1);
  for (let i = 0; i < maxIter; i++) {
    if (!Number.isFinite(f0) || !Number.isFinite(f1)) return NaN;
    if (Math.abs(f1) < tol) return x1;
    const denom = f1 - f0;
    if (Math.abs(denom) < 1e-18) return x1;
    const x2 = x1 - (f1 * (x1 - x0)) / denom;
    x0 = x1;
    f0 = f1;
    x1 = x2;
    f1 = f(x1);
  }
  return Math.abs(f1) < 1e-6 ? x1 : NaN;
}

function heightAtStop(sys, start, lambda) {
  const si = stopIndex(sys);
  const r = traceSequence(sys, start, lambda, forwardSteps(sys, 0, si), { clip: false });
  return r.status === 'ok' ? r.y : NaN;
}

export function rayFromInfinity(sys, angleDeg, h) {
  const a = (angleDeg * Math.PI) / 180;
  const zRef = sys.surfaces[0].z - 10;
  return { z: zRef, y: h, dz: Math.cos(a), dy: Math.sin(a) };
}

// Ray from infinity at field angle whose stop height equals targetY.
export function aimInfinity(sys, angleDeg, targetY, lambda = LAMBDA.d) {
  const p = paraxial(sys, lambda);
  const f = (h) => heightAtStop(sys, rayFromInfinity(sys, angleDeg, h), lambda) - targetY;
  const zRef = sys.surfaces[0].z - 10;
  const tanA = Math.tan((angleDeg * Math.PI) / 180);
  const guess = targetY / p.stopRatio - tanA * (p.entrancePupilZ - zRef);
  const h = secant(f, guess, guess + 0.5);
  return Number.isFinite(h) ? rayFromInfinity(sys, angleDeg, h) : null;
}

// Ray from a finite point (z, y) whose stop height equals targetY.
export function aimPoint(sys, source, targetY, lambda = LAMBDA.d) {
  const p = paraxial(sys, lambda);
  const make = (m) => ({ z: source.z, y: source.y, dz: 1, dy: m });
  const f = (m) => heightAtStop(sys, make(m), lambda) - targetY;
  const guess = (targetY / p.stopRatio - source.y) / (p.entrancePupilZ - source.z);
  const m = secant(f, guess, guess * 1.02 + 1e-4);
  return Number.isFinite(m) ? make(m) : null;
}

// --- mechanical helpers ---------------------------------------------------------------------------

export function edgeThickness(sys, i, j, h) {
  const a = sys.surfaces[i];
  const b = sys.surfaces[j];
  return b.z + sag(b, h) - (a.z + sag(a, h));
}

// Glass regions grouped into elements/cemented groups: [{ first, last, glasses }]
export function elementsOf(sys) {
  const S = sys.surfaces;
  const groups = [];
  let cur = null;
  for (let i = 0; i < S.length - 1; i++) {
    const isGlass = S[i].glass !== 'air';
    if (isGlass) {
      if (!cur) cur = { first: i, last: i + 1, glasses: [S[i].glass] };
      else {
        cur.last = i + 1;
        cur.glasses.push(S[i].glass);
      }
    } else if (cur) {
      groups.push(cur);
      cur = null;
    }
  }
  if (cur) groups.push(cur);
  return groups;
}

// Clear apertures from the widest axial bundle and the off-axis chief ± rim rays, shrunk to keep edges ≥ minEdge.
export function computeSemiDiameters(sys, { fNumber, fieldDeg, rimFraction = 0.5, margin = 1.04, minEdge = 0.5, lambda = LAMBDA.d } = {}) {
  const S = sys.surfaces;
  const stopR = stopRadiusFor(sys, fNumber, lambda);
  const need = new Array(S.length).fill(0);
  const bundles = [];
  for (const frac of [-1, -0.5, 0.5, 1]) bundles.push({ angle: 0, frac });
  for (const angle of [fieldDeg * 0.5, fieldDeg]) {
    for (const frac of [-rimFraction, 0, rimFraction]) bundles.push({ angle, frac });
    for (const frac of [-rimFraction, 0, rimFraction]) bundles.push({ angle: -angle, frac });
  }
  for (const b of bundles) {
    const ray = aimInfinity(sys, b.angle, b.frac * stopR, lambda);
    if (!ray) continue;
    const r = traceSequence(sys, ray, lambda, forwardSteps(sys), { clip: false });
    for (let i = 0; i < S.length && i + 1 < r.points.length; i++) {
      need[i] = Math.max(need[i], Math.abs(r.points[i + 1][1]));
    }
  }
  const out = S.map((s, i) => ({ ...s, sd: s.stop ? stopR : need[i] * margin + 0.2 }));
  const result = { ...sys, surfaces: out };
  for (const g of elementsOf(result)) {
    let h = 0;
    for (let i = g.first; i <= g.last; i++) h = Math.max(h, out[i].sd);
    for (let i = g.first; i <= g.last; i++) {
      if (out[i].c !== 0) h = Math.min(h, 0.97 / Math.abs(out[i].c) / Math.sqrt(Math.max(1 + out[i].k, 1e-6)));
    }
    let lo = 0;
    let hi = h;
    if (edgeThickness(result, g.first, g.last, hi) < minEdge) {
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        if (edgeThickness(result, g.first, g.last, mid) >= minEdge) lo = mid;
        else hi = mid;
      }
      h = lo;
    }
    for (let i = g.first; i <= g.last; i++) out[i].sd = h;
  }
  return result;
}
