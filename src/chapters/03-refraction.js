import * as THREE from 'three';
import { RayBundle, to3D, WARM } from '../models/rays.js';
import { BENCH_ORIGIN } from '../models/bench.js';
import { slab, biconvex, biconcave } from '../optics/designs.js';
import { traceRay } from '../optics/tracer.js';
import { makeLabel } from '../ui/hotspots.js';

// View helper: look at bench-local z (mm) from the side.
export function benchView(zMm, dist = 0.42, lift = 0.05) {
  const z = BENCH_ORIGIN.z + zMm / 1000;
  return { pos: [-dist, BENCH_ORIGIN.y + lift, z - 0.02], target: [0, BENCH_ORIGIN.y + 0.004, z] };
}

const deg = (r) => (r * 180) / Math.PI;
let st = {};

function traceBlock(ctx) {
  const v = ctx.store.values;
  const n = v.ior;
  const sys = slab(n, { t: 60, sd: 45 });
  const th = (v.incidence * Math.PI) / 180;
  const dir = { dz: Math.cos(th), dy: -Math.sin(th) };
  const paths = [];
  const L = 118;
  for (const off of [-4, 0, 4]) {
    const hitY = 18 + off / Math.max(Math.cos(th), 0.2);
    const start = { z: -L * dir.dz, y: hitY - L * dir.dy, ...dir };
    const r = traceRay(sys, start, 0.5876, { toZ: 112 });
    paths.push({ points: to3D(r.points, Math.PI / 2, -0.4), n: r.segN, color: WARM });
  }
  st.bundle.setPaths(paths);
  st.laser.position.set(0, 18 - (L + 4) * dir.dy, -(L + 4) * dir.dz);
  st.laser.rotation.x = th;
  const sin2 = Math.sin(th) / n;
  const th2 = Math.asin(sin2);
  st.normal.position.set(-0.3, 18, 0);
  st.inLabel.element.innerHTML = `θ₁ = ${v.incidence.toFixed(0)}°`;
  st.outLabel.element.innerHTML = `θ₂ = ${deg(th2).toFixed(1)}°`;
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Index n</span><span class="v acc">${n.toFixed(2)}</span></div>
    <div class="cell"><span class="k">Speed in it</span><span class="v">${Math.round(299792 / n).toLocaleString('en')} km/s</span></div>
    <div class="cell"><span class="k">Bent to</span><span class="v">${deg(th2).toFixed(1)}°</span></div>`);
}

function traceLens(ctx) {
  const concave = ctx.store.values.benchShape === 'concave';
  const sys = concave ? biconcave('N-BK7', { f: 100 }) : biconvex('N-BK7', { f: 100 });
  if (st.lensKind !== ctx.store.values.benchShape) {
    st.lens?.();
    const el = ctx.bench.element(sys);
    ctx.stepScope.attach(ctx.bench.group, el.group);
    st.lens = () => ctx.bench.group.remove(el.group);
    st.lensKind = ctx.store.values.benchShape;
  }
  const paths = [];
  for (let i = 0; i < 9; i++) {
    const y = -18 + i * 4.5;
    const r = traceRay(sys, { z: -150, y, dz: 1, dy: 0 }, 0.5876, { toZ: concave ? 260 : 230 });
    paths.push({ points: to3D(r.points, Math.PI / 2, -0.4), n: r.segN, color: WARM });
  }
  st.bundle.setPaths(paths);
}

export default {
  id: 'refraction',
  short: 'Refraction',
  title: 'Why glass <em>bends</em> light',
  sets: ['studio', 'bench'],
  preview: false,
  params: { ior: 1.52, incidence: 35, benchShape: 'convex' },
  enter(ctx) {
    st = { sig: '' };
    st.bundle = ctx.scope.attach(ctx.bench.group, new RayBundle({ capacity: 400, dash: 3, gap: 11, speed: 55, width: 2, pulseWidth: 3.4 }));
    ctx.animate(st.bundle, ctx.scope);
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${ctx.stepIndex}|${v.ior}|${v.incidence}|${v.benchShape}`;
    if (sig === st.sig) return;
    st.sig = sig;
    if (ctx.stepIndex === 0) traceBlock(ctx);
    else traceLens(ctx);
  },
  steps: [
    {
      view: benchView(5, 0.47, 0.07),
      html: `
        <p>Everything a lens does comes down to one effect: <strong>light slows down inside glass</strong>.</p>
        <p>The bright pulses travel along the beam. Watch them bunch up inside the block: in ordinary crown glass light moves
        about <span class="num">1.5×</span> slower than in air. The <strong>refractive index n</strong> is exactly that slow-down factor.</p>
        <p>When a beam hits the surface at an angle, one side of it slows down first and the whole beam <strong>swings towards the
        perpendicular</strong>, like a car whose right wheels hit sand first. Leaving the glass, it swings back.</p>`,
      controls: ['ior', 'incidence'],
      examples: [
        { label: 'Water', sub: 'n = 1.33', params: { ior: 1.33 } },
        { label: 'Crown glass', sub: 'n = 1.52 · most lenses', params: { ior: 1.52 } },
        { label: 'Flint glass', sub: 'n = 1.62', params: { ior: 1.62 } },
        { label: 'Lanthanum glass', sub: 'n ≈ 1.80 · modern lenses', params: { ior: 1.8 } },
        { label: 'Diamond', sub: 'n = 2.42', params: { ior: 2.42 } },
        { label: 'No glass', sub: 'n = 1.00 · no bending', params: { ior: 1.0 } },
      ],
      apply(ctx, scope) {
        st.laser = scope.attach(ctx.bench.group, ctx.bench.laser(0, { aperture: 9, withPost: false }));
        const block = ctx.bench.block(60);
        scope.attach(ctx.bench.group, block.group);
        const normal = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -45), new THREE.Vector3(0, 0, 45)]),
          new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 3, gapSize: 3, transparent: true, opacity: 0.5 }),
        );
        normal.computeLineDistances();
        st.normal = scope.attach(ctx.bench.group, normal);
        st.inLabel = scope.attach(ctx.bench.group, makeLabel('', 'label3d'));
        st.inLabel.position.set(0, 44, -40);
        st.outLabel = scope.attach(ctx.bench.group, makeLabel('', 'label3d'));
        st.outLabel.position.set(0, -12, 22);
        st.sig = '';
        st.bundle.setReveal(0);
        scope.animate(2, (e) => st.bundle.setReveal(e));
      },
    },
    {
      view: benchView(40, 0.44, 0.06),
      html: `
        <p>Now curve the glass. A <strong>convex</strong> element (thicker in the middle) bends every ray a little more the farther
        it is from the centre, so parallel rays <strong>converge</strong>.</p>
        <p>A <strong>concave</strong> element (thinner in the middle) does the opposite: the rays <strong>diverge</strong>.
        Camera lenses combine both kinds. Positive elements do the imaging, negative ones cancel their errors.</p>`,
      controls: ['benchShape'],
      apply(ctx, scope) {
        scope.attach(ctx.bench.group, ctx.bench.laser(-160, { aperture: 22 }));
        st.lensKind = null;
        st.lens = null;
        st.sig = '';
        st.bundle.setReveal(0);
        scope.animate(2.2, (e) => st.bundle.setReveal(e));
      },
    },
  ],
  deepDive: `
    <p><strong>Snell's law</strong> relates the angles on both sides of a surface (measured from the perpendicular):</p>
    <div class="formula">n₁ · sin θ₁ = n₂ · sin θ₂</div>
    <p>Going from glass back into air at a steep angle, sin θ₂ would have to exceed 1. The light can't get out and reflects
    completely. That is <strong>total internal reflection</strong>: above <span class="num">41°</span> for n = 1.52. Prisms in binoculars use it.</p>
    <p>The index also depends slightly on colour: blue light slows more than red. That's <strong>dispersion</strong>, the root of chromatic aberration (chapter 11).</p>`,
};
