// Wavelengths in micrometres (Fraunhofer lines + green e-line).
export const LAMBDA = { F: 0.4861327, e: 0.546074, d: 0.5875618, C: 0.6562725 };

export const RGB_LAMBDAS = [
  { key: 'red', lambda: LAMBDA.C, color: [1.0, 0.28, 0.22] },
  { key: 'green', lambda: LAMBDA.e, color: [0.3, 1.0, 0.45] },
  { key: 'blue', lambda: LAMBDA.F, color: [0.3, 0.5, 1.0] },
];

export const GLASS = {
  air: { name: 'Air', nd: 1.0, vd: Infinity, kind: 'air' },
  water: { name: 'Water', nd: 1.333, vd: 55.8, kind: 'other' },
  'N-BK7': { name: 'N-BK7 crown', nd: 1.5168, vd: 64.17, kind: 'crown' },
  'N-SK2': { name: 'N-SK2 dense crown', nd: 1.60738, vd: 56.65, kind: 'crown' },
  'N-SSK2': { name: 'N-SSK2 crown', nd: 1.62229, vd: 53.27, kind: 'crown' },
  'N-SK16': { name: 'N-SK16 dense crown', nd: 1.62041, vd: 60.32, kind: 'crown' },
  F2: { name: 'F2 flint', nd: 1.62004, vd: 36.37, kind: 'flint' },
  F5: { name: 'F5 flint', nd: 1.60342, vd: 38.03, kind: 'flint' },
  SF5: { name: 'SF5 dense flint', nd: 1.6727, vd: 32.25, kind: 'flint' },
  ED: { name: 'ED low-dispersion', nd: 1.497, vd: 81.54, kind: 'ed' },
  LAH: { name: 'Lanthanum glass', nd: 1.804, vd: 46.58, kind: 'lanthanum' },
  diamond: { name: 'Diamond', nd: 2.417, vd: 55.3, kind: 'other' },
};

const cauchyCache = new Map();

export function resolveGlass(glass) {
  if (glass == null) return GLASS.air;
  if (typeof glass === 'number') return { name: `n = ${glass.toFixed(2)}`, nd: glass, vd: Infinity, kind: 'custom' };
  if (typeof glass === 'string') {
    const g = GLASS[glass];
    if (!g) throw new Error(`Unknown glass "${glass}"`);
    return g;
  }
  return glass;
}

// Two-term Cauchy fit n(λ) = A + B/λ² that reproduces nd and the F–C dispersion (nd−1)/Vd.
export function cauchy(glass) {
  const g = resolveGlass(glass);
  const key = `${g.nd}|${g.vd}`;
  let fit = cauchyCache.get(key);
  if (!fit) {
    const dispersion = Number.isFinite(g.vd) && g.nd > 1 ? (g.nd - 1) / g.vd : 0;
    const B = dispersion / (1 / LAMBDA.F ** 2 - 1 / LAMBDA.C ** 2);
    fit = { A: g.nd - B / LAMBDA.d ** 2, B };
    cauchyCache.set(key, fit);
  }
  return fit;
}

export function refractiveIndex(glass, lambda = LAMBDA.d) {
  const g = resolveGlass(glass);
  if (g.nd === 1) return 1;
  const { A, B } = cauchy(g);
  return A + B / (lambda * lambda);
}
