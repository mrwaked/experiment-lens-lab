import * as THREE from 'three';
import { RayBundle, to3D } from '../models/rays.js';
import { planoConvex, biconvex, achromat } from '../optics/designs.js';
import { traceRay, paraxial } from '../optics/tracer.js';
import { RGB_LAMBDAS, LAMBDA, resolveGlass } from '../optics/glass.js';
import { benchView } from './03-refraction.js';
import { FIELD } from './06-angle-of-view.js';
import { fNumberLineChart, SERIES } from '../ui/chart.js';
import { sharpnessBlur, aberrationBlur, airyDiameter, sweetSpot } from '../optics/photo-math.js';

let st = {};

function swapElement(ctx, key, sys) {
  if (st.elKey === key) return;
  st.removeEl?.();
  const el = ctx.bench.element(sys);
  ctx.stepScope.attach(ctx.bench.group, el.group);
  st.removeEl = () => ctx.bench.group.remove(el.group);
  st.elKey = key;
}

const cross = (r) => r.z - (r.y * r.dz) / r.dy;

function spherical(ctx) {
  const asphere = ctx.store.values.asphere;
  const sys = planoConvex({ asphere, sd: 20 });
  swapElement(ctx, `pc|${asphere}`, sys);
  const f0 = paraxial(sys).rearFocusZ;
  const paths = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 13; i++) {
    const y = -19 + (38 * i) / 12;
    if (Math.abs(y) < 0.5) continue;
    const r = traceRay(sys, { z: -150, y, dz: 1, dy: 0 }, LAMBDA.d, { toZ: f0 + 45 });
    const c = cross(traceRay(sys, { z: -150, y, dz: 1, dy: 0 }, LAMBDA.d, { toZ: null }));
    lo = Math.min(lo, c);
    hi = Math.max(hi, c);
    const t = Math.abs(y) / 19;
    paths.push({ points: to3D(r.points, Math.PI / 2, -0.4), n: r.segN, color: [1, 0.86 - 0.35 * t, 0.45 + 0.4 * t] });
  }
  st.bundle.setPaths(paths);
  st.marker.position.set(0, 0, f0);
  const spread = hi - lo;
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Surface</span><span class="v">${asphere ? 'Aspherical' : 'Spherical'}</span></div>
    <div class="cell wide"><span class="k">Spread of focus, edge vs centre rays</span><span class="v acc">${spread < 0.01 ? '< 0.01 mm · perfect' : `${spread.toFixed(2)} mm`}</span></div>`);
}

function chromatic(ctx) {
  const v = ctx.store.values;
  const sys = v.chroma === 'achromat' ? achromat({ sd: 12.7 }) : biconvex(v.singletGlass, { f: 100, t: 4, sd: 12.7 });
  swapElement(ctx, `${v.chroma}|${v.singletGlass}`, sys);
  const paths = [];
  const foci = {};
  for (const { key, lambda, color } of RGB_LAMBDAS) {
    const p = paraxial(sys, lambda);
    foci[key] = p.rearFocusZ;
    for (let i = 0; i < 5; i++) {
      const y = -11 + (22 * i) / 4;
      const r = traceRay(sys, { z: -150, y: y + (key === 'red' ? 0.25 : key === 'blue' ? -0.25 : 0), dz: 1, dy: 0 }, lambda, { toZ: p.rearFocusZ + 40 });
      paths.push({ points: to3D(r.points, Math.PI / 2, -0.4), n: r.segN, color, weight: 0.85 });
    }
  }
  st.bundle.setPaths(paths);
  st.marker.visible = false;
  RGB_LAMBDAS.forEach(({ key }, i) => st.foci[i].position.set(-0.6, 0, foci[key]));
  const spread = Math.abs(foci.red - foci.blue);
  st.dimRB.userData.set(Math.min(foci.red, foci.blue), Math.max(foci.red, foci.blue), -6, `Δ ${spread.toFixed(2)} mm`);
  const g = resolveGlass(v.chroma === 'achromat' ? 'N-BK7' : v.singletGlass);
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">${v.chroma === 'achromat' ? 'Design' : 'Glass'}</span><span class="v">${v.chroma === 'achromat' ? 'Crown + flint' : g.name}</span></div>
    <div class="cell"><span class="k">Abbe number</span><span class="v">${v.chroma === 'achromat' ? '64 + 32' : g.vd.toFixed(1)}</span></div>
    <div class="cell wide"><span class="k">Red focus vs blue focus</span><span class="v acc">${spread.toFixed(2)} mm apart</span></div>`);
}

function diffraction(ctx) {
  const a = ctx.store.values.slit;
  st.wave.material.uniforms.uSlit.value = a;
  const angle = a > 1 ? (Math.asin(1 / a) * 180) / Math.PI : 90;
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Opening</span><span class="v acc">${a.toFixed(1)} λ</span></div>
    <div class="cell"><span class="k">Spreading angle</span><span class="v">± ${angle.toFixed(0)}°</span></div>`);
}

function benchStep(kind) {
  return (ctx, scope) => {
    const chapterSets = ctx.chapter.sets;
    if (!ctx.stage.activeSets.includes('bench')) ctx.stage.applySets(chapterSets);
    st.elKey = null;
    st.removeEl = null;
    st.kind = kind;
    st.sig = '';
    if (kind !== 'wave') {
      scope.attach(ctx.bench.group, ctx.bench.laser(-160, { aperture: 22 }));
      st.marker = scope.attach(ctx.bench.group, ctx.bench.marker('paraxial focus', 'label3d center'));
      if (kind === 'chroma') {
        st.foci = RGB_LAMBDAS.map(({ color }) =>
          scope.attach(ctx.bench.group, new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), toneMapped: false }))),
        );
        st.dimRB = scope.attach(ctx.bench.group, ctx.bench.dimension(''));
        st.bundle.setOpacity(0.6);
        scope.add(() => st.bundle.setOpacity(1));
      }
      st.bundle.visible = true;
      st.bundle.setReveal(0);
      scope.animate(2, (e) => st.bundle.setReveal(e));
    } else {
      st.bundle.visible = false;
      st.wave = scope.attach(ctx.bench.group, ctx.bench.wavePlane({ length: 320, halfH: 44, wallZ: 70 }));
      st.wave.position.z = -90;
      ctx.animate({ update: (dt) => st.wave.userData.update(dt) }, scope);
      scope.add(() => (st.bundle.visible = true));
    }
  };
}

function fieldStep(extra) {
  return (ctx, scope) => {
    st.kind = 'field';
    ctx.stage.applySets(['product', 'diorama', 'field']);
    ctx.preview.setVisible(true);
    ctx.field.show({ frustum: true, focus: true, slab: false });
    document.getElementById('viewfinder').classList.add('big');
    extra?.(ctx, scope);
    scope.add(() => {
      ctx.field.show({ frustum: true, focus: true, slab: true });
      ctx.stage.applySets(ctx.chapter.sets);
      ctx.preview.setVisible(false);
      document.getElementById('viewfinder').classList.remove('big');
      ctx.store.set({ cropView: false, distortion: false, lens: 'z50' });
    });
  };
}

export default {
  id: 'sharpness',
  short: 'Sharpness',
  title: 'What limits <em>sharpness</em>',
  sets: ['studio', 'bench'],
  preview: false,
  params: { asphere: false, chroma: 'singlet', singletGlass: 'N-BK7', slit: 3 },
  enter(ctx) {
    st = { sig: '' };
    st.bundle = ctx.scope.attach(ctx.bench.group, new RayBundle({ capacity: 600, dash: 3, gap: 12, speed: 55, width: 1.6 }));
    ctx.animate(st.bundle, ctx.scope);
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${st.kind}|${v.asphere}|${v.chroma}|${v.singletGlass}|${v.slit}|${v.fNumber}`;
    if (sig === st.sig) return;
    st.sig = sig;
    if (st.kind === 'sph') spherical(ctx);
    else if (st.kind === 'chroma') chromatic(ctx);
    else if (st.kind === 'wave') diffraction(ctx);
    else if (st.kind === 'field' && st.chart) {
      st.chart.setMarker(ctx.d.N);
      const best = sweetSpot();
      ctx.panel.setReadout(`
        <div class="cell"><span class="k">Aperture</span><span class="v acc">${ctx.d.fLabel}</span></div>
        <div class="cell"><span class="k">Blur spot</span><span class="v">${(sharpnessBlur(ctx.d.N) * 1000).toFixed(1)} µm</span></div>
        <div class="cell"><span class="k">Sweet spot</span><span class="v">≈ f/${best}</span></div>`);
    }
  },
  steps: [
    {
      view: benchView(70, 0.44, 0.05),
      html: `
        <p>Real lenses aren't perfect. The first villain is <strong>spherical aberration</strong>. Spherical surfaces are easy to
        grind, but rays through the <em>edge</em> of a spherical lens bend a bit too much and focus closer than the rays through the centre.
        The result is a soft, glowing image.</p>
        <p>Flip on the <strong>aspherical surface</strong>: its curve flattens towards the edge so every ray meets in one point.
        Modern lenses use one or more aspherical elements for exactly this.</p>`,
      controls: ['asphere'],
      apply: benchStep('sph'),
    },
    {
      view: benchView(96, 0.12, 0.012),
      html: `
        <p>Second villain: <strong>chromatic aberration</strong>. Glass bends blue light more than red (dispersion), so a single lens has
        a slightly different focal length for each colour. You see it as colour fringes along contrasty edges.</p>
        <p>Compare glasses by their <em>Abbe number</em> (higher = less dispersion), then switch to the <strong>achromatic doublet</strong>:
        a positive crown element cemented to a negative flint element. The flint's stronger dispersion cancels the crown's, and red and blue meet again.</p>`,
      controls: ['chroma', 'singletGlass'],
      examples: [
        { label: 'Crown singlet', sub: 'Abbe 64', params: { chroma: 'singlet', singletGlass: 'N-BK7' } },
        { label: 'Flint singlet', sub: 'Abbe 38 · worse', params: { chroma: 'singlet', singletGlass: 'F5' } },
        { label: 'ED singlet', sub: 'Abbe 82 · better', params: { chroma: 'singlet', singletGlass: 'ED' } },
        { label: 'Achromat', sub: 'crown + flint', params: { chroma: 'achromat' } },
        { label: 'Whole lens', sub: 'zoom out', view: benchView(60, 0.42, 0.05) },
        { label: 'Closer to focus', sub: 'the colours split', view: benchView(97, 0.09, 0.008) },
      ],
      apply: benchStep('chroma'),
    },
    {
      view: benchView(60, 0.5, 0.05),
      html: `
        <p>Third villain, and one you can't design away: <strong>diffraction</strong>. Light is a wave, and a wave squeezed
        through an opening spreads out on the other side.</p>
        <p>Make the opening narrow and the wave fans out widely; make it wide and it passes almost straight. For a lens, that means a
        <em>tiny</em> aperture (high f-number) smears every point into a small blurry disc, the Airy disc.</p>
        <p class="note">The wavelength here is exaggerated about 10,000× so you can see it.</p>`,
      controls: ['slit'],
      examples: [
        { label: 'Wide opening', sub: '12 λ · little spread', params: { slit: 12 } },
        { label: 'Narrow', sub: '2 λ · strong spread', params: { slit: 2 } },
      ],
      apply: benchStep('wave'),
    },
    {
      view: FIELD.shoulder,
      params: { lens: 'z50', cropView: true, fNumber: 1.8, focus: 2.5 },
      html: `
        <p>Put it together. Wide open, residual aberrations soften the image a little. Stopping down cuts them fast, but
        diffraction grows steadily. Somewhere in between is the <strong>sweet spot</strong>, usually 2–3 stops down (f/4–f/5.6 here).</p>
        <p>The simulated photo is now a <strong>100% crop</strong> of the test chart next to the robot: one screen pixel per
        sensor pixel. Compare <span class="num">f/1.8</span>, <span class="num">f/5.6</span> and <span class="num">f/22</span>.</p>`,
      controls: ['fNumber'],
      examples: [
        { label: 'Wide open', sub: 'f/1.8 · aberrations', params: { fNumber: 1.8 } },
        { label: 'Sweet spot', sub: 'f/5.6', params: { fNumber: 5.6 } },
        { label: 'Stopped down', sub: 'f/22 · diffraction', params: { fNumber: 22 } },
      ],
      apply: fieldStep((ctx) => {
        st.chart = fNumberLineChart(ctx.panel.figureHost(), {
          title: 'Blur spot size',
          subtitle: 'Lower is sharper · simplified model, µm on the sensor',
          format: (v) => v.toFixed(0),
          yMax: 40,
          series: [
            { key: 'total', label: 'Total', color: SERIES.total, fn: (N) => sharpnessBlur(N) * 1000 },
            { key: 'aberr', label: 'Aberrations', color: SERIES.blue, fn: (N) => aberrationBlur(N) * 1000 },
            { key: 'diff', label: 'Diffraction', color: SERIES.magenta, fn: (N) => airyDiameter(N) * 1000 },
          ],
        });
        st.sig = '';
      }),
    },
    {
      view: FIELD.shoulder,
      params: { lens: 'z24120', focal: 24, cropView: false, distortion: true, vignetting: true, fNumber: 4, focus: 2.5 },
      html: `
        <p>Two more lens “signatures” show up across the frame:</p>
        <ul>
          <li><strong>Distortion</strong>: straight lines bow outwards (<em>barrel</em>, typical at the wide end of a zoom) or inwards
          (<em>pincushion</em>, at the long end). Watch the distance posts and roofs.</li>
          <li><strong>Vignetting</strong>: darker corners wide open, because less light reaches the edge of the sensor.</li>
        </ul>
        <p>Both are predictable, so the Z5 II corrects them automatically using a profile of the lens. Mirrorless lenses often lean on that on purpose.</p>`,
      controls: ['focal', 'distortion', 'vignetting'],
      controlOverrides: { focal: { min: 24, max: 120 } },
      examples: [
        { label: 'Barrel', sub: '24 mm', params: { focal: 24, distortion: true } },
        { label: 'Pincushion', sub: '120 mm', params: { focal: 120, distortion: true } },
        { label: 'Corrected in camera', sub: 'profile on', params: { distortion: false, vignetting: false } },
      ],
      apply: fieldStep(() => {
        st.chart = null;
      }),
    },
  ],
  deepDive: `
    <p><strong>Airy disc</strong> diameter (to the first dark ring) for green light:</p>
    <div class="formula">d = 2.44 · λ · N ≈ 1.34 µm × N</div>
    <p>At f/8 that is <span class="num">10.7 µm</span>, almost two of the Z5 II's <span class="num">5.9 µm</span> pixels;
    at f/22 it is <span class="num">29.5 µm</span>, five pixels. That is why landscape photographers rarely go past f/11 on full frame.</p>
    <p>The chart combines pixel size, aberrations and diffraction as <span class="num">√(p² + a² + d²)</span>. The aberration
    curve is a simplified model; real lenses publish MTF charts instead.</p>`,
};
