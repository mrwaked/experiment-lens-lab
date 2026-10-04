import { LightCone, Spot, RayBundle, apertureCone, pointBundle } from '../models/rays.js';
import { FIELD } from './06-angle-of-view.js';
import { blurDiameter, SENSOR } from '../optics/photo-math.js';

const VIEW = { pos: [-0.2, 0.07, -0.028], target: [0, 0.0, -0.03] };
const HIGHLIGHT_M = 10;
let st = {};

function spotSvg(landing, color = '#ffe7a8') {
  let r = 0;
  for (const p of landing) r = Math.max(r, Math.hypot(p[0], p[1]));
  const s = 58 / Math.max(r, 1e-6);
  const pts = landing.map((p) => `${(70 + p[0] * s).toFixed(1)},${(70 - p[1] * s).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 140 140" width="140" height="140" aria-label="Shape of the blur spot on the sensor">
    <defs><radialGradient id="bk" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${color}" stop-opacity="0.75"/><stop offset="0.85" stop-color="${color}" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></radialGradient></defs>
    <rect width="140" height="140" rx="10" fill="#07080a"/>
    <polygon points="${pts}" fill="url(#bk)"/>
  </svg>`;
}

function rebuild(ctx) {
  const o = ctx.opticsState();
  const v = ctx.store.values;
  const src = -HIGHLIGHT_M * 1000;
  const cone = apertureCone(o.sys, src, { r: o.stopR, blades: v.blades, rounded: v.rounded, maxR: o.maxStopR, n: 90 });
  st.cone.setRays(cone.rays);
  const flat = cone.landing.map((p) => [p[0], p[1], -0.7]);
  st.spot.setPolygon(flat, [0, 0, -0.7]);
  st.rays.setPaths(pointBundle(o.sys, { z: src, y: 0 }, { count: 9, stopR: o.stopR }));
  const dMm = blurDiameter(o.d.focal, o.d.N, o.d.sMm, HIGHLIGHT_M * 1000 - o.d.pupilM * 1000);
  ctx.panel.setReadout(`
    <div class="cell" style="grid-column: span 1; display:grid; place-items:center">${spotSvg(cone.landing)}</div>
    <div class="cell"><span class="k">Highlight at</span><span class="v">${HIGHLIGHT_M} m</span><span class="k" style="margin-top:8px">Focused at</span><span class="v">2.5 m</span></div>
    <div class="cell wide"><span class="k">Blur disc on the sensor</span><span class="v acc">${dMm.toFixed(2)} mm · ${Math.round(dMm / SENSOR.pitch)} pixels wide</span></div>`);
}

export default {
  id: 'bokeh',
  short: 'Bokeh',
  title: '<em>Bokeh</em>',
  sets: ['studio', 'product', 'cutaway'],
  preview: false,
  params: { fNumber: 1.8, focus: 2.5, blades: 9, rounded: true, catEye: false },
  enter(ctx) {
    ctx.ensurePrime();
    st = { sig: '' };
    const c = ctx.getCutaway();
    c.setOpen(1);
    c.labels.visible = false;
    st.cone = ctx.scope.attach(ctx.camRig, new LightCone({ opacity: 0.12, color: 0xffcf7a }));
    st.spot = ctx.scope.attach(ctx.camRig, new Spot({ color: 0xffe7a8, opacity: 0.95 }));
    st.rays = ctx.scope.attach(ctx.camRig, new RayBundle({ capacity: 300, opacity: 0.35 }));
    ctx.animate(st.rays, ctx.scope);
    ctx.xray(0.9, 1.0);
    ctx.scope.add(() => {
      ctx.body.setXray(0);
      ctx.store.set({ catEye: false });
    });
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${v.fNumber}|${v.blades}|${v.rounded}|${v.lens}|${v.focus}`;
    if (sig !== st.sig && st.cone && ctx.stage.activeSets.includes('cutaway')) {
      st.sig = sig;
      rebuild(ctx);
    }
  },
  steps: [
    {
      view: VIEW,
      html: `
        <p>The lens is focused on the robot (2.5 m), but a string light hangs <span class="num">10 m</span> away. Its cone of light
        converges <em>in front of</em> the sensor, crosses over, and spreads out again. It hits the sensor as a bright patch.</p>
        <p>Look at the shape of that patch (in the card): it is a small, upside-down <strong>image of the aperture</strong>.
        These out-of-focus highlights, and how pleasant they look, are called <strong>bokeh</strong> (Japanese for “blur”).</p>`,
      controls: ['fNumber', 'blades', 'rounded'],
    },
    {
      view: FIELD.shoulder,
      params: { lens: 'z85', fNumber: 1.8, focus: 2.5 },
      html: `
        <p>Every string light behind the robot becomes one of those patches. With nine <strong>rounded</strong> blades wide open
        they're smooth circles. Stop down and the corners of the polygon appear. Straight blades show them sooner, and odd
        blade counts give odd-sided shapes.</p>
        <p>Turn on <em>cat's-eye</em>: near the edges of the frame the lens barrel clips the cone (the vignetting you saw in
        chapter 5), squeezing the discs into lemon shapes. Stopping down makes it disappear.</p>`,
      controls: ['fNumber', 'blades', 'rounded', 'catEye'],
      examples: [
        { label: 'Creamy', sub: '9 rounded · f/1.8', params: { blades: 9, rounded: true, fNumber: 1.8, catEye: false } },
        { label: 'Heptagons', sub: '7 straight · f/4', params: { blades: 7, rounded: false, fNumber: 4 } },
        { label: 'Pentagons', sub: '5 straight · f/5.6', params: { blades: 5, rounded: false, fNumber: 5.6 } },
        { label: 'Cat’s eye', sub: 'wide open, frame edges', params: { blades: 9, rounded: true, fNumber: 1.8, catEye: true } },
      ],
      apply(ctx, scope) {
        const chapterSets = ctx.chapter.sets;
        ctx.stage.applySets(['product', 'diorama', 'field']);
        ctx.field.show({ frustum: true, focus: true, slab: false });
        ctx.preview.setVisible(true);
        ctx.body.setXray(0);
        document.getElementById('viewfinder').classList.add('big');
        scope.add(() => {
          ctx.stage.applySets(chapterSets);
          ctx.field.show({ frustum: true, focus: true, slab: true });
          ctx.preview.setVisible(false);
          ctx.body.setXray(0.9);
          document.getElementById('viewfinder').classList.remove('big');
          st.sig = '';
        });
      },
    },
    {
      view: FIELD.side,
      params: { lens: 'free', focal: 85, fNumber: 1.8, focus: 2.5, cameraBack: 0 },
      html: `
        <p>How big the bokeh gets depends on four things:</p>
        <ul>
          <li>a <strong>wider aperture</strong> (smaller f-number),</li>
          <li>a <strong>longer focal length</strong>,</li>
          <li>a <strong>closer subject</strong>, and</li>
          <li>a background <strong>farther</strong> behind it.</li>
        </ul>
        <p>That's why phones need software to fake background blur. Their tiny lenses (a few mm of focal length) can't make big discs.</p>`,
      controls: ['focal', 'fNumber', 'focus'],
      examples: [
        { label: 'Phone-like', sub: '24 mm · f/8', params: { focal: 24, fNumber: 8, focus: 2.5 } },
        { label: 'Kit zoom', sub: '50 mm · f/5.6', params: { focal: 50, fNumber: 5.6, focus: 2.5 } },
        { label: 'Portrait prime', sub: '85 mm · f/1.8', params: { focal: 85, fNumber: 1.8, focus: 2.5 } },
        { label: 'Tele portrait', sub: '135 mm · f/2 · 3.5 m', params: { focal: 135, fNumber: 2, focus: 3.5 } },
      ],
      apply(ctx, scope) {
        const chapterSets = ctx.chapter.sets;
        ctx.stage.applySets(['product', 'diorama', 'field']);
        ctx.field.show({ frustum: true, focus: true, slab: true });
        ctx.preview.setVisible(true);
        ctx.body.setXray(0);
        document.getElementById('viewfinder').classList.add('big');
        scope.add(() => {
          ctx.stage.applySets(chapterSets);
          ctx.preview.setVisible(false);
          ctx.body.setXray(0.9);
          document.getElementById('viewfinder').classList.remove('big');
          ctx.store.set({ lens: 'z50' });
          st.sig = '';
        });
      },
    },
  ],
  deepDive: `
    <p>The blur-disc diameter on the sensor for a point at distance <em>d</em>, when focused at <em>s</em>:</p>
    <div class="formula">b = f² ÷ (N · (s − f)) · |d − s| ÷ d</div>
    <p>An 85 mm f/1.8 focused at 2 m turns a light at infinity into a disc <span class="num">2.1 mm</span> wide: about
    <span class="num">350 pixels</span> on a 24 MP sensor. The simulated photo uses exactly this formula for every pixel,
    and draws each disc in the shape of the aperture.</p>
    <p><strong>Sun-stars</strong> are the opposite effect: at small apertures, diffraction at the blade edges turns bright
    points into stars with as many spikes as blades (even counts) or twice as many (odd counts).</p>`,
};
