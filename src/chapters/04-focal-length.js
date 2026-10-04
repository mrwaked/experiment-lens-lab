import { RayBundle, to3D, WARM } from '../models/rays.js';
import { biconvex, biconcave } from '../optics/designs.js';
import { traceRay, paraxial, aimPoint } from '../optics/tracer.js';
import { benchView } from './03-refraction.js';

const BLUE = [0.45, 0.72, 1.0];
let st = {};

function lensFor(ctx, kind, f) {
  const key = `${kind}|${f}`;
  if (st.lensKey !== key) {
    st.removeLens?.();
    const sys = kind === 'concave' ? biconcave('N-BK7', { f }) : biconvex('N-BK7', { f, sd: 22 });
    const el = ctx.bench.element(sys);
    ctx.stepScope.attach(ctx.bench.group, el.group);
    st.removeLens = () => ctx.bench.group.remove(el.group);
    st.sys = sys;
    st.lensKey = key;
  }
  return st.sys;
}

function parallelRays(ctx, concave) {
  const f = Math.round(ctx.store.values.benchFocal);
  const sys = lensFor(ctx, concave ? 'concave' : 'convex', f);
  const p = paraxial(sys);
  const paths = [];
  for (let i = 0; i < 9; i++) {
    const y = -16 + i * 4;
    const r = traceRay(sys, { z: -150, y, dz: 1, dy: 0 }, 0.5876, { toZ: Math.max(260, p.rearFocusZ + 60) });
    paths.push({ points: to3D(r.points, Math.PI / 2, -0.4), n: r.segN, color: WARM });
    if (concave) {
      const last = r.points.at(-2);
      const zF = p.rearFocusZ;
      const yAtF = last[1] + (r.dy / r.dz) * (zF - last[0]);
      paths.push({ points: to3D([last, [zF, yAtF]], Math.PI / 2, -0.4), color: [0.35, 0.35, 0.4], weight: 0.6 });
    }
  }
  st.bundle.setPaths(paths);
  const lensMid = (sys.surfaces[0].z + sys.surfaces.at(-1).z) / 2;
  st.focus.position.set(0, 0, p.rearFocusZ);
  st.focus.userData.label.element.innerHTML = concave ? 'F (virtual)' : 'F · focal point';
  st.dim.userData.set(lensMid, p.rearFocusZ, concave ? 30 : -30, `f = ${Math.round(p.efl)} mm`);
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Focal length</span><span class="v acc">${Math.round(p.efl)} mm</span></div>
    <div class="cell"><span class="k">Power</span><span class="v">${(1000 / p.efl).toFixed(1)} dioptres</span></div>`);
}

function imaging(ctx) {
  const f = Math.round(ctx.store.values.benchFocal);
  const sys = lensFor(ctx, 'convex', f);
  const u = ctx.store.values.objectDist;
  const lensZ = (sys.surfaces[0].z + sys.surfaces.at(-1).z) / 2;
  const objZ = lensZ - u;
  const H = 22;
  const p = paraxial(sys);
  const tr = traceRay(sys, { z: objZ, y: 0, dz: 1, dy: 1e-3 }, 0.5876, { toZ: null, clip: false });
  const imgZ = tr.z - (tr.y * tr.dz) / tr.dy;
  const v = imgZ - lensZ;
  const m = -v / u;
  const paths = [];
  const zEnd = Math.min(Math.max(imgZ + 40, 200), 560);
  for (const [yObj, color] of [[H, WARM], [0, BLUE]]) {
    for (let i = 0; i < 7; i++) {
      const target = -14 + (i * 28) / 6;
      const ray = aimPoint(sys, { z: objZ, y: yObj }, target);
      if (!ray) continue;
      const r = traceRay(sys, ray, 0.5876, { toZ: zEnd });
      paths.push({ points: to3D(r.points, Math.PI / 2, -0.4), n: r.segN, color, weight: yObj ? 1 : 0.8 });
    }
  }
  st.bundle.setPaths(paths);
  st.object.position.set(0, 0, objZ);
  st.object.userData.set(H);
  const imgH = H * m;
  const real = Number.isFinite(imgZ) && v > 0 && u > f;
  st.image.visible = real;
  st.screen.visible = real;
  if (real) {
    st.image.position.set(0, 0, imgZ);
    st.image.userData.set(imgH);
    st.screen.position.set(0, 0, imgZ + 0.5);
  }
  st.focus.position.set(0, 0, p.rearFocusZ);
  st.front.position.set(0, 0, p.frontFocusZ);
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Object distance u</span><span class="v">${Math.round(u)} mm</span></div>
    <div class="cell"><span class="k">Image distance v</span><span class="v acc">${real ? `${Math.round(v)} mm` : '—'}</span></div>
    <div class="cell"><span class="k">Magnification</span><span class="v">${real ? `${m.toFixed(2)}×` : '—'}</span></div>`);
}

export default {
  id: 'focal-length',
  short: 'Focal point',
  title: 'Focal <em>point</em> & focal length',
  sets: ['studio', 'bench'],
  preview: false,
  params: { benchFocal: 100, objectDist: 300 },
  enter(ctx) {
    st = { sig: '' };
    st.bundle = ctx.scope.attach(ctx.bench.group, new RayBundle({ capacity: 600, dash: 3, gap: 12, speed: 60, width: 1.8 }));
    ctx.animate(st.bundle, ctx.scope);
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${ctx.stepIndex}|${v.benchFocal}|${v.objectDist}`;
    if (sig === st.sig || !st.focus) return;
    st.sig = sig;
    if (ctx.stepIndex === 0) parallelRays(ctx, false);
    else if (ctx.stepIndex === 1) parallelRays(ctx, true);
    else imaging(ctx);
  },
  steps: [
    {
      view: benchView(60, 0.44, 0.06),
      html: `
        <p>Send in parallel light, like light from a very distant object, and a converging lens gathers it into one point:
        the <strong>focal point F</strong>.</p>
        <p>The distance from the lens to F is the <strong>focal length</strong>. Strongly curved glass bends hard, so it focuses
        close and has a <em>short</em> focal length. Gentle curves give a <em>long</em> focal length.</p>
        <p>That is the number on every lens barrel: <span class="num">24 mm</span>, <span class="num">50 mm</span>,
        <span class="num">200 mm</span>… In a camera lens the sensor sits exactly at F when you focus at infinity.</p>`,
      controls: ['benchFocal'],
      examples: [
        { label: 'Strong curve', sub: 'f = 50 mm', params: { benchFocal: 50 } },
        { label: 'Medium', sub: 'f = 100 mm', params: { benchFocal: 100 } },
        { label: 'Gentle curve', sub: 'f = 200 mm', params: { benchFocal: 200 } },
      ],
      apply(ctx, scope) {
        scope.attach(ctx.bench.group, ctx.bench.laser(-160, { aperture: 22 }));
        st.lensKey = null;
        st.focus = scope.attach(ctx.bench.group, ctx.bench.marker('F'));
        st.dim = scope.attach(ctx.bench.group, ctx.bench.dimension(''));
        st.sig = '';
        st.bundle.setReveal(0);
        scope.animate(2, (e) => st.bundle.setReveal(e));
      },
    },
    {
      view: benchView(20, 0.44, 0.06),
      html: `
        <p>A <strong>diverging</strong> (concave) element spreads parallel light out. Trace the outgoing rays backwards (grey lines)
        and they seem to come from a point in front of the lens: a <em>virtual</em> focal point, so its focal length is negative.</p>
        <p>On its own it can't form an image on a sensor, but inside a camera lens negative elements are essential. They
        correct the errors of the positive ones, and in wide-angle and zoom designs they move the focal point where the designer needs it.</p>`,
      controls: ['benchFocal'],
      apply(ctx, scope) {
        scope.attach(ctx.bench.group, ctx.bench.laser(-160, { aperture: 22 }));
        st.lensKey = null;
        st.focus = scope.attach(ctx.bench.group, ctx.bench.marker('F'));
        st.dim = scope.attach(ctx.bench.group, ctx.bench.dimension(''));
        st.sig = '';
        st.bundle.setReveal(0);
        scope.animate(2, (e) => st.bundle.setReveal(e));
      },
    },
    {
      view: benchView(-30, 0.78, 0.1),
      html: `
        <p>Now a real object: the <span class="hl">yellow arrow</span>. Every point of it sends a cone of rays into the lens, and each
        cone re-converges into one point behind it. Together those points form an <strong>image</strong>, and it is
        <strong>upside-down</strong>.</p>
        <p>Move the object closer and the image moves <em>farther</em> back and grows. At twice the focal length the image is the
        same size. Closer than the focal length, the rays never converge and there is no real image. That is why a camera
        lens has to <em>move</em> to focus on nearby things (chapter 7).</p>`,
      controls: ['objectDist', 'benchFocal'],
      examples: [
        { label: 'Far away', sub: 'u = 6f → small image', params: { objectDist: 600, benchFocal: 100 } },
        { label: 'At 2f', sub: 'same size, 1:1', params: { objectDist: 200, benchFocal: 100 } },
        { label: 'At 1.5f', sub: 'bigger, farther', params: { objectDist: 150, benchFocal: 100 } },
        { label: 'Too close', sub: 'u < f → no image', params: { objectDist: 120, benchFocal: 130 } },
      ],
      apply(ctx, scope) {
        st.lensKey = null;
        st.focus = scope.attach(ctx.bench.group, ctx.bench.marker('F′'));
        st.front = scope.attach(ctx.bench.group, ctx.bench.marker('F'));
        st.object = scope.attach(ctx.bench.group, ctx.bench.arrow(22));
        st.image = scope.attach(ctx.bench.group, ctx.bench.arrow(-22, 0xffe100, 0.55));
        st.screen = scope.attach(ctx.bench.group, ctx.bench.screen(80));
        st.sig = '';
        st.bundle.setReveal(0);
        scope.animate(2.4, (e) => st.bundle.setReveal(e));
      },
    },
  ],
  deepDive: `
    <p>For a thin lens the object distance <em>u</em>, image distance <em>v</em> and focal length <em>f</em> are linked by
    the <strong>thin-lens equation</strong>:</p>
    <div class="formula">1/f = 1/u + 1/v &nbsp;&nbsp;·&nbsp;&nbsp; magnification m = −v/u</div>
    <p>Example: <span class="num">f = 50 mm</span>, subject at <span class="num">u = 2 m</span>: v = 1/(1/50 − 1/2000) =
    <span class="num">51.3 mm</span>. The lens must sit 1.3 mm farther from the sensor than for infinity. That little
    movement <em>is</em> focusing.</p>`,
};
