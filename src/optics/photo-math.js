// Photographic formulas. Lengths in mm unless noted; distances measured from the lens (entrance pupil).

export const SENSOR = {
  width: 35.9,
  height: 23.9,
  pxW: 6048,
  pxH: 4032,
  get pitch() {
    return this.width / this.pxW;
  },
  get diagonal() {
    return Math.hypot(this.width, this.height);
  },
};

export const COC = 0.03;
export const GREEN_MM = 0.00055;

export const FULL_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
export const THIRD_STOPS = [1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22];

const deg = (rad) => (rad * 180) / Math.PI;

export function angleOfView(f, size) {
  return deg(2 * Math.atan(size / (2 * f)));
}

export function aov(f, sensor = SENSOR) {
  return {
    h: angleOfView(f, sensor.width),
    v: angleOfView(f, sensor.height),
    d: angleOfView(f, Math.hypot(sensor.width, sensor.height)),
  };
}

export function hyperfocal(f, N, c = COC) {
  return (f * f) / (N * c) + f;
}

export function depthOfField(f, N, s, c = COC) {
  const H = hyperfocal(f, N, c);
  const near = (s * (H - f)) / (H + s - 2 * f);
  const far = s < H ? (s * (H - f)) / (H - s) : Infinity;
  return { H, near, far, total: far - near };
}

// Blur-disc diameter on the sensor for a point at distance d when focused at s.
export function blurDiameter(f, N, s, d) {
  const k = (f * f) / (N * (s - f));
  if (!Number.isFinite(d)) return k;
  return (k * Math.abs(d - s)) / d;
}

export function stopsBetween(N1, N2) {
  return 2 * Math.log2(N2 / N1);
}

export function lightFraction(N, ref = 1.4) {
  return (ref / N) ** 2;
}

export function airyDiameter(N, lambda = GREEN_MM) {
  return 2.44 * lambda * N;
}

// Simplified residual-aberration blur (mm): strong wide open, fades quickly when stopped down.
export function aberrationBlur(N, { wideOpen = 0.018, ref = 1.8, power = 2.5 } = {}) {
  return wideOpen * (ref / N) ** power;
}

// Total blur spot (mm): pixel, residual aberrations and diffraction combined in quadrature.
export function sharpnessBlur(N, opts = {}) {
  const pixel = opts.pitch ?? SENSOR.pitch;
  return Math.hypot(pixel, aberrationBlur(N, opts), airyDiameter(N));
}

export function sweetSpot(stops = THIRD_STOPS, opts = {}) {
  let best = stops[0];
  for (const N of stops) if (sharpnessBlur(N, opts) < sharpnessBlur(best, opts)) best = N;
  return best;
}

const SHUTTER_DENOMS = [8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 80, 60, 50, 40, 30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3];
const SHUTTER_SECONDS = [0.4, 0.5, 0.6, 0.8, 1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30];
const SHUTTERS = [...SHUTTER_DENOMS.map((d) => ({ t: 1 / d, label: `1/${d}` })), ...SHUTTER_SECONDS.map((s) => ({ t: s, label: `${s}″` }))];

export function shutterFor(N, { baseN = 1.8, baseT = 1 / 250 } = {}) {
  return baseT * (N / baseN) ** 2;
}

export function nearestShutter(t) {
  let best = SHUTTERS[0];
  for (const s of SHUTTERS) if (Math.abs(Math.log(s.t / t)) < Math.abs(Math.log(best.t / t))) best = s;
  return best;
}

export function formatFNumber(N) {
  return `f/${Number.isInteger(N) ? N : N.toFixed(1).replace(/\.0$/, '')}`;
}

export function formatDistance(mm) {
  if (!Number.isFinite(mm)) return '∞';
  if (mm < 1000) return `${Math.round(mm / 10)} cm`;
  if (mm < 10000) return `${(mm / 1000).toFixed(2)} m`;
  return `${(mm / 1000).toFixed(1)} m`;
}

export function formatLength(mm) {
  if (!Number.isFinite(mm)) return '∞';
  if (mm < 10) return `${mm.toFixed(1)} mm`;
  if (mm < 1000) return `${Math.round(mm)} mm`;
  return formatDistance(mm);
}
