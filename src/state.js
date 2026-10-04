import {
  THIRD_STOPS,
  aov,
  depthOfField,
  shutterFor,
  nearestShutter,
  formatFNumber,
  formatDistance,
  hyperfocal,
  SENSOR,
} from './optics/photo-math.js';
import { clamp, ease } from './core/tween.js';

export const FOCUS_INFINITY = 60;

export const LENSES = {
  z24120: {
    id: 'z24120',
    name: '24–120mm f/4 zoom',
    short: '24–120 f/4',
    kind: 'zoom',
    range: [24, 120],
    maxN: 4,
    minFocus: 0.35,
    blades: 7,
    pupil: 0.075,
    blurb: 'A do-it-all standard zoom. Its groups of glass slide inside the barrel to change the focal length.',
  },
  z50: {
    id: 'z50',
    name: '50mm f/1.8 prime',
    short: '50 f/1.8',
    kind: 'prime',
    focal: 50,
    maxN: 1.8,
    minFocus: 0.4,
    blades: 9,
    pupil: 0.0408,
    blurb: 'The classic “normal” lens: fixed focal length, bright f/1.8 aperture, a double-Gauss design at heart.',
  },
  z85: {
    id: 'z85',
    name: '85mm f/1.8 prime',
    short: '85 f/1.8',
    kind: 'prime',
    focal: 85,
    maxN: 1.8,
    minFocus: 0.8,
    blades: 9,
    pupil: 0.0693,
    blurb: 'The portrait favourite: flattering perspective from a comfortable distance and creamy background blur.',
  },
  free: {
    id: 'free',
    name: 'Any focal length',
    short: 'Any',
    kind: 'free',
    range: [14, 400],
    maxN: 1.4,
    minFocus: 0.3,
    blades: 9,
    pupil: 0.06,
    hidden: true,
    blurb: '',
  },
};

const fmtMm = (v) => `${Math.round(v)} mm`;
const fmtFocus = (v) => (v >= FOCUS_INFINITY ? '∞' : formatDistance(v * 1000));

// Single source of truth for every control in the UI.
export const PARAMS = {
  lens: { type: 'lens', label: 'Lens', default: 'z50' },
  focal: {
    type: 'range',
    label: 'Focal length',
    min: 14,
    max: 400,
    log: true,
    default: 50,
    format: fmtMm,
    dynamic: (v) => {
      const l = LENSES[v.lens];
      return l.kind === 'prime' ? { hidden: true } : { min: l.range[0], max: l.range[1] };
    },
  },
  fNumber: { type: 'stops', label: 'Aperture', stops: THIRD_STOPS, default: 1.8, format: formatFNumber },
  focus: { type: 'range', label: 'Focus distance', min: 0.3, max: FOCUS_INFINITY, log: true, default: 2.5, format: fmtFocus },
  blades: { type: 'segmented', label: 'Aperture blades', options: [5, 7, 9], default: 9 },
  rounded: { type: 'toggle', label: 'Rounded blades', default: true },
  catEye: { type: 'toggle', label: 'Cat’s-eye at the edges', default: false },
  lockShutter: { type: 'toggle', label: 'Lock the shutter speed', default: false },
  coating: {
    type: 'segmented',
    label: 'Lens coating',
    options: ['none', 'single', 'multi'],
    labels: { none: 'None', single: 'Single', multi: 'Multi / nano' },
    default: 'multi',
  },
  distortion: { type: 'toggle', label: 'Show uncorrected distortion', default: false },
  vignetting: { type: 'toggle', label: 'Show vignetting', default: true },
  pinhole: { type: 'toggle', label: 'Replace the lens with a pinhole', default: false },
  cropView: { type: 'toggle', label: '100% crop of the test chart', default: false },
  cameraBack: { type: 'range', label: 'Step back from the robot', min: 0, max: 20, default: 0, format: (v) => `+${v.toFixed(1)} m` },
  blurMap: { type: 'toggle', label: 'False-colour blur map', default: false },

  // optical bench
  ior: { type: 'range', label: 'Refractive index n', min: 1.0, max: 2.45, step: 0.01, default: 1.52, format: (v) => v.toFixed(2) },
  incidence: { type: 'range', label: 'Angle of the beam', min: 0, max: 70, step: 1, default: 35, format: (v) => `${Math.round(v)}°` },
  benchFocal: { type: 'range', label: 'Lens focal length', min: 50, max: 200, step: 1, default: 100, format: fmtMm },
  benchShape: {
    type: 'segmented',
    label: 'Element',
    options: ['convex', 'concave'],
    labels: { convex: 'Convex (+)', concave: 'Concave (−)' },
    default: 'convex',
  },
  objectDist: { type: 'range', label: 'Object distance', min: 120, max: 600, step: 1, default: 300, format: fmtMm },
  asphere: { type: 'toggle', label: 'Aspherical surface', default: false },
  chroma: {
    type: 'segmented',
    label: 'Design',
    options: ['singlet', 'achromat'],
    labels: { singlet: 'Single element', achromat: 'Achromatic doublet' },
    default: 'singlet',
  },
  singletGlass: {
    type: 'segmented',
    label: 'Glass',
    options: ['N-BK7', 'F5', 'ED'],
    labels: { 'N-BK7': 'Crown', F5: 'Flint', ED: 'ED' },
    default: 'N-BK7',
  },
  slit: { type: 'range', label: 'Opening (in wavelengths)', min: 1, max: 12, step: 0.1, default: 3, format: (v) => `${v.toFixed(1)} λ` },
  pointDist: { type: 'range', label: 'Distance of the point', min: 0.5, max: 50, log: true, default: 50, format: (v) => formatDistance(v * 1000) },
};

export function createStore(schema, tweens) {
  const values = {};
  for (const [k, def] of Object.entries(schema)) values[k] = def.default;
  const subs = new Set();
  const running = new Map();

  function notify(changed) {
    if (!changed.length) return;
    for (const s of [...subs]) {
      if (!s.keys || s.keys.some((k) => changed.includes(k))) s.fn(changed, values);
    }
  }

  function setNow(patch) {
    const changed = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in values)) throw new Error(`Unknown param "${k}"`);
      if (values[k] !== v) {
        values[k] = v;
        changed.push(k);
      }
    }
    notify(changed);
  }

  return {
    get: (k) => values[k],
    values,
    set(patch, { animate = 0 } = {}) {
      const immediate = {};
      for (const [k, v] of Object.entries(patch)) {
        running.get(k)?.cancel();
        running.delete(k);
        if (animate > 0 && typeof v === 'number' && typeof values[k] === 'number' && tweens) {
          const from = values[k];
          const log = schema[k]?.log && from > 0 && v > 0;
          const h = tweens.add({
            duration: animate,
            ease: ease.inOutCubic,
            update: (e) => setNow({ [k]: log ? Math.exp(Math.log(from) + (Math.log(v) - Math.log(from)) * e) : from + (v - from) * e }),
          });
          running.set(k, h);
        } else immediate[k] = v;
      }
      setNow(immediate);
    },
    subscribe(keys, fn) {
      const s = { keys, fn };
      subs.add(s);
      return () => subs.delete(s);
    },
    reset(keys) {
      const patch = {};
      for (const k of keys ?? Object.keys(schema)) patch[k] = schema[k].default;
      setNow(patch);
    },
  };
}

// Everything the scene, preview and HUD need, derived from raw params.
export function derive(v) {
  const lens = LENSES[v.lens];
  const focal = lens.kind === 'prime' ? lens.focal : clamp(v.focal, lens.range[0], lens.range[1]);
  const pinhole = !!v.pinhole;
  const N = pinhole ? 180 : Math.max(v.fNumber, lens.maxN);
  const focusM = v.focus >= FOCUS_INFINITY ? Infinity : Math.max(v.focus, lens.minFocus);
  const pupilM = lens.kind === 'free' ? 0.03 + focal * 0.0004 : lens.pupil;
  const sMm = Number.isFinite(focusM) ? Math.max(focusM - pupilM, focal * 0.0012) * 1000 : Infinity;
  const dof = Number.isFinite(sMm) ? depthOfField(focal, N, sMm) : { near: hyperfocal(focal, N), far: Infinity, total: Infinity, H: hyperfocal(focal, N) };
  const baseN = 1.8;
  const exposureStops = v.lockShutter ? -2 * Math.log2(N / baseN) : 0;
  const shutterT = v.lockShutter ? 1 / 250 : shutterFor(N, { baseN, baseT: 1 / 250 });
  return {
    lens,
    focal,
    N,
    pinhole,
    blades: v.blades,
    rounded: v.rounded,
    focusM,
    pupilM,
    sMm,
    dof: {
      ...dof,
      nearM: dof.near / 1000 + pupilM,
      farM: Number.isFinite(dof.far) ? dof.far / 1000 + pupilM : Infinity,
    },
    hyperfocalM: dof.H / 1000 + pupilM,
    aov: aov(focal),
    exposureStops,
    shutter: nearestShutter(shutterT),
    shutterT,
    iso: 100,
    fLabel: formatFNumber(Math.round(N * 10) / 10),
    sensor: SENSOR,
  };
}
