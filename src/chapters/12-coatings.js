import { RayBundle, infinityBundle, to3D } from '../models/rays.js';
import { traceSequence, ghostSteps, aimInfinity } from '../optics/tracer.js';
import { LAMBDA } from '../optics/glass.js';
import { SIDE } from './05-inside-the-lens.js';

const REFLECT = { none: 0.04, single: 0.012, multi: 0.002 };
const IRIDESCENCE = { none: 0, single: 0.55, multi: 1 };
const GHOST_COLORS = [
  [1.0, 0.35, 0.85],
  [0.35, 1.0, 0.55],
  [0.5, 0.6, 1.0],
];
const FRONT_VIEW = { pos: [-0.07, 0.06, -0.43], target: [0.012, 0.004, -0.11] };
let st = {};

function airGlassCount(sys) {
  return sys.surfaces.filter((s, i) => !s.stop && (s.glass === 'air') !== ((i === 0 ? 'air' : sys.surfaces[i - 1].glass) === 'air')).length;
}

function rebuild(ctx) {
  const o = ctx.opticsState();
  const coating = ctx.store.values.coating;
  const R = REFLECT[coating];
  const paths = infinityBundle(o.sys, { count: 9, stopR: o.stopR });
  const pairs = [
    [10, 8],
    [9, 2],
    [4, 0],
  ];
  const ghostWeight = Math.min(1, R * R * 2500);
  pairs.forEach(([a, b], k) => {
    for (const frac of [-0.8, -0.3, 0.3, 0.8]) {
      const ray = aimInfinity(o.sys, 0, frac * o.stopR, LAMBDA.d);
      if (!ray) continue;
      const t = (o.sys.surfaces[0].z - 45 - ray.z) / ray.dz;
      const start = { z: ray.z + t * ray.dz, y: ray.y + t * ray.dy, dz: ray.dz, dy: ray.dy };
      const r = traceSequence(o.sys, start, LAMBDA.d, ghostSteps(o.sys, a, b), { toZ: 0 });
      if (r.status !== 'ok') continue;
      paths.push({ points: to3D(r.points, Math.PI / 2, -0.5), color: GHOST_COLORS[k], weight: ghostWeight });
    }
  });
  st.bundle.setPaths(paths);
  const n = airGlassCount(o.sys);
  const tLens = (1 - R) ** n;
  const t24 = (1 - R) ** 24;
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Reflected per surface</span><span class="v acc">${(R * 100).toFixed(1)} %</span></div>
    <div class="cell"><span class="k">This lens (${n} surfaces)</span><span class="v">${Math.round(tLens * 100)} % gets through</span></div>
    <div class="cell"><span class="k">12-element lens (24)</span><span class="v">${Math.round(t24 * 100)} % gets through</span></div>`);
  const glass = ctx.lensRig.exterior?.glassMesh?.material;
  if (glass) glass.iridescence = IRIDESCENCE[coating];
}

export default {
  id: 'coatings',
  short: 'Coatings & flare',
  title: 'Coatings & <em>flare</em>',
  sets: ['studio', 'product', 'cutaway'],
  preview: true,
  params: { coating: 'none', fNumber: 2.8, focus: 60 },
  enter(ctx) {
    ctx.ensurePrime();
    st = { sig: '' };
    const c = ctx.getCutaway();
    c.setOpen(1);
    c.labels.visible = false;
    st.bundle = ctx.scope.attach(ctx.camRig, new RayBundle({ capacity: 700 }));
    ctx.animate(st.bundle, ctx.scope);
    ctx.xray(0.88, 1.0);
    ctx.scope.add(() => {
      ctx.body.setXray(0);
      ctx.store.set({ coating: 'multi' });
      const glass = ctx.lensRig.exterior?.glassMesh?.material;
      if (glass) glass.iridescence = 1;
    });
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${v.coating}|${v.fNumber}|${v.lens}|${ctx.stepIndex}`;
    if (sig !== st.sig && st.bundle) {
      st.sig = sig;
      rebuild(ctx);
    }
  },
  steps: [
    {
      view: SIDE,
      html: `
        <p>Every time light passes from air into glass (or back), about <span class="num">4 %</span> of it is <strong>reflected</strong>.
        That sounds small, but a modern lens has 20+ such surfaces.</p>
        <p>Reflected light bounces back and forth between surfaces. Some of it (the coloured rays) ends up on the sensor in the wrong
        place, as <strong>ghosts</strong> and a veil of haze that washes out contrast. Toggle the coating and watch the ghosts fade.</p>`,
      controls: ['coating'],
      examples: [
        { label: 'Uncoated', sub: '1930s glass · 4 %', params: { coating: 'none' } },
        { label: 'Single coat', sub: '≈ 1.2 %', params: { coating: 'single' } },
        { label: 'Multi / nano', sub: '≈ 0.2 %', params: { coating: 'multi' } },
      ],
    },
    {
      view: FRONT_VIEW,
      params: { lens: 'z24120', focal: 28, fNumber: 8 },
      html: `
        <p>A <strong>coating</strong> is a stack of layers only a few hundred nanometres thick. Light reflected from the top and
        bottom of each layer cancels out, so almost nothing reflects. That interference is also what gives a lens front its
        <span style="color:#c9a0ff">purple</span>–<span style="color:#7dffa8">green</span> sheen. Compare the three settings on the front element.</p>
        <p>The simulated photo points at the street lamp. Without coatings, the bright lamp spawns coloured <strong>ghosts</strong> mirrored across
        the centre and a grey veil over the shadows. A <strong>lens hood</strong> helps too, by keeping stray light from outside the frame off the front element.</p>`,
      controls: ['coating'],
      examples: [
        { label: 'Uncoated', sub: 'ghosts + veil', params: { coating: 'none' } },
        { label: 'Multi-coated', sub: 'clean, contrasty', params: { coating: 'multi' } },
      ],
      apply(ctx, scope) {
        const chapterSets = ctx.chapter.sets;
        ctx.stage.applySets(['studio', 'product']);
        ctx.body.setXray(0);
        document.getElementById('viewfinder').classList.add('big');
        scope.add(() => {
          ctx.stage.applySets(chapterSets);
          ctx.body.setXray(0.88);
          document.getElementById('viewfinder').classList.remove('big');
          ctx.store.set({ lens: 'z50' });
        });
      },
    },
  ],
  deepDive: `
    <p>Reflection at normal incidence between indices n₁ and n₂:</p>
    <div class="formula">R = ((n₁ − n₂) ÷ (n₁ + n₂))²&nbsp;&nbsp;→&nbsp;&nbsp;air/glass (1.0 / 1.5) = 4 %</div>
    <p>Through 24 uncoated surfaces only <span class="num">0.96²⁴ ≈ 37.5 %</span> of the light gets through. With modern
    multi-coating at ~0.2 % per surface it's <span class="num">≈ 95 %</span>. A single quarter-wave layer of index √n
    cancels reflection at one colour; multi-layer and nano-structured coatings extend that across the whole spectrum
    and over a wide range of angles.</p>`,
};
