// Fat-line light rays (faint core + flowing dashes) with buffers allocated once and rewritten in place.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { traceRay, aimInfinity, aimPoint } from '../optics/tracer.js';
import { LAMBDA } from '../optics/glass.js';

export const WARM = [1.0, 0.86, 0.45];

// 2D meridional trace points [[z, y]] → 3D points in the plane at angle phi (π/2 = the y–z cut plane).
export function to3D(points, phi = Math.PI / 2, xOffset = 0) {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return points.map(([z, y]) => [y * c + xOffset, y * s, z]);
}

export class RayBundle extends THREE.Group {
  constructor({ capacity = 1500, width = 1.6, opacity = 0.5, pulseWidth = 3, dash = 3, gap = 14, speed = 36, pulse = true } = {}) {
    super();
    this.capacity = capacity;
    this.speed = speed;
    const geo = new LineSegmentsGeometry();
    geo.setPositions(new Float32Array(capacity * 6));
    geo.setColors(new Float32Array(capacity * 6));
    const dist = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * 2), 2, 1);
    geo.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(dist, 1, 0));
    geo.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(dist, 1, 1));
    geo.instanceCount = 0;
    this.geo = geo;
    this.posBuf = geo.attributes.instanceStart.data;
    this.colBuf = geo.attributes.instanceColorStart.data;
    this.distBuf = dist;

    const common = { vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, worldUnits: false, toneMapped: false };
    this.base = new LineSegments2(geo, new LineMaterial({ ...common, linewidth: width, opacity }));
    this.base.frustumCulled = false;
    this.add(this.base);
    if (pulse) {
      this.pulse = new LineSegments2(geo, new LineMaterial({ ...common, linewidth: pulseWidth, opacity: 0.95, dashed: true, dashSize: dash, gapSize: gap }));
      this.pulse.frustumCulled = false;
      this.pulse.renderOrder = 2;
      this.add(this.pulse);
    }
    this.renderOrder = 5;
    this.paths = [];
    this.reveal = Infinity;
    this.maxLen = 0;
    this.intensity = 1;
  }

  // paths: [{ points: [[x,y,z]...], color: [r,g,b], n?: [index per segment], weight?: 0..1 }]
  setPaths(paths) {
    this.paths = paths.map((p) => {
      const pts = p.points;
      const cum = [0];
      const opt = [0];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay, az] = pts[i - 1];
        const [bx, by, bz] = pts[i];
        const l = Math.hypot(bx - ax, by - ay, bz - az);
        cum.push(cum[i - 1] + l);
        opt.push(opt[i - 1] + l * (p.n?.[i - 1] ?? 1));
      }
      return { pts, cum, opt, color: p.color ?? WARM, weight: p.weight ?? 1 };
    });
    this.maxLen = Math.max(0, ...this.paths.map((p) => p.cum.at(-1)));
    this.write();
    return this;
  }

  setReveal(fraction) {
    this.reveal = fraction >= 1 ? Infinity : fraction * this.maxLen;
    this.write();
  }

  setOpacity(a) {
    this.base.material.opacity = a * 0.5;
    if (this.pulse) this.pulse.material.opacity = a * 0.95;
    this.visible = a > 0.001;
  }

  write() {
    const P = this.posBuf.array;
    const C = this.colBuf.array;
    const D = this.distBuf.array;
    let k = 0;
    outer: for (const path of this.paths) {
      const { pts, cum, opt, color, weight } = path;
      const r = color[0] * weight * this.intensity;
      const g = color[1] * weight * this.intensity;
      const b = color[2] * weight * this.intensity;
      for (let i = 0; i < pts.length - 1; i++) {
        if (k >= this.capacity) break outer;
        const la = cum[i];
        if (la >= this.reveal) break;
        let lb = cum[i + 1];
        let t = 1;
        if (lb > this.reveal) {
          t = (this.reveal - la) / (lb - la);
          lb = this.reveal;
        }
        const a = pts[i];
        const e = pts[i + 1];
        const o = k * 6;
        P[o] = a[0];
        P[o + 1] = a[1];
        P[o + 2] = a[2];
        P[o + 3] = a[0] + (e[0] - a[0]) * t;
        P[o + 4] = a[1] + (e[1] - a[1]) * t;
        P[o + 5] = a[2] + (e[2] - a[2]) * t;
        C[o] = C[o + 3] = r;
        C[o + 1] = C[o + 4] = g;
        C[o + 2] = C[o + 5] = b;
        D[k * 2] = opt[i];
        D[k * 2 + 1] = opt[i] + (opt[i + 1] - opt[i]) * t;
        k++;
      }
    }
    this.geo.instanceCount = k;
    this.posBuf.needsUpdate = true;
    this.colBuf.needsUpdate = true;
    this.distBuf.needsUpdate = true;
  }

  update(dt) {
    if (this.pulse) this.pulse.material.dashOffset -= this.speed * dt;
  }

  dispose() {
    this.geo.dispose();
    this.base.material.dispose();
    this.pulse?.material.dispose();
  }
}

// Translucent surface spanned by a closed loop of rays that share the same number of points.
export class LightCone extends THREE.Mesh {
  constructor({ color = 0xffd98a, opacity = 0.14, maxVerts = 30000 } = {}) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
    super(
      geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.maxVerts = maxVerts;
    this.frustumCulled = false;
    this.renderOrder = 4;
  }

  setRays(rays) {
    const arr = this.geometry.attributes.position.array;
    let v = 0;
    const n = rays.length;
    for (let j = 0; j < n; j++) {
      const A = rays[j];
      const B = rays[(j + 1) % n];
      const m = Math.min(A.length, B.length);
      for (let i = 0; i < m - 1; i++) {
        if (v + 6 > this.maxVerts) break;
        for (const p of [A[i], B[i], B[i + 1], A[i], B[i + 1], A[i + 1]]) {
          arr[v * 3] = p[0];
          arr[v * 3 + 1] = p[1];
          arr[v * 3 + 2] = p[2];
          v++;
        }
      }
    }
    this.geometry.setDrawRange(0, v);
    this.geometry.attributes.position.needsUpdate = true;
  }
}

// Filled polygon (e.g. the blur spot on the sensor), rebuilt as a triangle fan.
export class Spot extends THREE.Mesh {
  constructor({ color = 0xffe7a8, opacity = 0.9, maxPts = 256 } = {}) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 9), 3));
    super(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.maxPts = maxPts;
    this.frustumCulled = false;
    this.renderOrder = 6;
  }

  setPolygon(points, center) {
    const arr = this.geometry.attributes.position.array;
    const n = Math.min(points.length, this.maxPts);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      for (const p of [center, a, b]) {
        arr[v * 3] = p[0];
        arr[v * 3 + 1] = p[1];
        arr[v * 3 + 2] = p[2];
        v++;
      }
    }
    this.geometry.setDrawRange(0, v);
    this.geometry.attributes.position.needsUpdate = true;
  }
}

// --- real traces (optics/tracer.js) turned into drawable 3D paths ------------------------------
const X_FRONT = -0.35; // draw rays just in front of the section caps (towards the viewer at −x)

function clipLead(points, zStart) {
  const [z0, y0] = points[0];
  const [z1, y1] = points[1];
  if (z0 >= zStart || z1 <= z0) return points;
  const t = (zStart - z0) / (z1 - z0);
  return [[zStart, y0 + (y1 - y0) * t], ...points.slice(1)];
}

// Parallel bundle from infinity at field angle `angle` (deg), spread across the stop.
export function infinityBundle(sys, { angle = 0, count = 9, stopR, lambda = LAMBDA.d, lead = 45, color = WARM, spread = 0.96, phi = Math.PI / 2, x = X_FRONT } = {}) {
  const paths = [];
  const zStart = sys.surfaces[0].z - lead;
  for (let i = 0; i < count; i++) {
    const frac = count === 1 ? 0 : (-1 + (2 * i) / (count - 1)) * spread;
    const ray = aimInfinity(sys, angle, frac * stopR, lambda);
    if (!ray) continue;
    const t = (zStart - ray.z) / ray.dz;
    const start = { z: ray.z + t * ray.dz, y: ray.y + t * ray.dy, dz: ray.dz, dy: ray.dy };
    const r = traceRay(sys, start, lambda, { toZ: sys.imageZ });
    paths.push({ points: to3D(r.points, phi, x), color, n: r.segN.map((n) => n), status: r.status, end: r.points.at(-1) });
  }
  return paths;
}

// Rays from a finite on-axis (or off-axis) point, spread across the stop.
export function pointBundle(sys, source, { count = 9, stopR, lambda = LAMBDA.d, lead = 45, color = WARM, spread = 0.96, phi = Math.PI / 2, x = X_FRONT, overshoot = 0 } = {}) {
  const paths = [];
  const zStart = sys.surfaces[0].z - lead;
  for (let i = 0; i < count; i++) {
    const frac = count === 1 ? 0 : (-1 + (2 * i) / (count - 1)) * spread;
    const ray = aimPoint(sys, source, frac * stopR, lambda);
    if (!ray) continue;
    const r = traceRay(sys, ray, lambda, { toZ: sys.imageZ, overshoot });
    paths.push({ points: to3D(clipLead(r.points, zStart), phi, x), color, n: r.segN, status: r.status, end: r.points.at(-1) });
  }
  return paths;
}

// Boundary radius of the iris opening at polar angle phi (matches models/iris.js blade layout).
export function apertureBoundary(phi, r, blades, rounded, maxR, swirl = (1 - r / maxR) * 0.5) {
  const seg = (Math.PI * 2) / blades;
  const theta0 = swirl + Math.PI / 2;
  let d = (phi - theta0) % seg;
  if (d < 0) d += seg;
  if (d > seg / 2) d -= seg;
  if (!rounded) return r / Math.cos(d);
  const Ra = maxR * 1.05;
  let rho = r / Math.cos(d);
  for (let i = 0; i < 12; i++) {
    const y = rho * Math.sin(d);
    const x = r + Ra - Math.sqrt(Math.max(Ra * Ra - y * y, 0));
    rho = x / Math.cos(d);
  }
  return rho;
}

// Cone from an on-axis point through the real aperture shape: cone rays + landing polygon on the sensor.
export function apertureCone(sys, sourceZ, { r, blades, rounded, maxR, n = 72, lambda = LAMBDA.d, lead = 45 } = {}) {
  const rays = [];
  const landing = [];
  const zStart = sys.surfaces[0].z - lead;
  for (let j = 0; j < n; j++) {
    const phi = (j / n) * Math.PI * 2;
    const rho = apertureBoundary(phi, r, blades, rounded, maxR) * 0.995;
    const ray = Number.isFinite(sourceZ) ? aimPoint(sys, { z: sourceZ, y: 0 }, rho, lambda) : aimInfinity(sys, 0, rho, lambda);
    if (!ray) continue;
    let start = ray;
    if (!Number.isFinite(sourceZ)) {
      const t = (zStart - ray.z) / ray.dz;
      start = { z: ray.z + t * ray.dz, y: ray.y + t * ray.dy, dz: ray.dz, dy: ray.dy };
    }
    const tr = traceRay(sys, start, lambda, { toZ: sys.imageZ, clip: false });
    const pts = to3D(Number.isFinite(sourceZ) ? clipLead(tr.points, zStart) : tr.points, phi, 0);
    rays.push(pts);
    landing.push(pts.at(-1));
  }
  return { rays, landing };
}
