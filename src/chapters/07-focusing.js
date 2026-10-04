import { RayBundle, Spot, pointBundle } from '../models/rays.js';
import { FIELD } from './06-angle-of-view.js';
import { formatDistance, SENSOR } from '../optics/photo-math.js';
import { FOCUS_INFINITY } from '../state.js';

const VIEW = { pos: [-0.2, 0.05, -0.012], target: [0, 0.0, -0.036] };
let st = {};

function rebuild(ctx) {
  const o = ctx.opticsState();
  const D = ctx.store.values.pointDist;
  const paths = pointBundle(o.sys, { z: -D * 1000, y: 0 }, { count: 11, stopR: o.stopR, overshoot: 34 });
  st.bundle.setPaths(paths);
  let r = 0;
  for (const p of paths) {
    const at = p.points[p.points.length - 2];
    if (at) r = Math.max(r, Math.abs(at[1]));
  }
  const ring = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ring.push([Math.cos(a) * r, Math.sin(a) * r, -0.7]);
  }
  st.spot.setPolygon(ring, [0, 0, -0.7]);
  st.spot.visible = r > 0.03;
  const blurUm = r * 2 * 1000;
  const px = (r * 2) / SENSOR.pitch;
  const focus = ctx.store.values.focus >= FOCUS_INFINITY ? '∞' : formatDistance(ctx.store.values.focus * 1000);
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Point at</span><span class="v">${formatDistance(D * 1000)}</span></div>
    <div class="cell"><span class="k">Focused at</span><span class="v">${focus}</span></div>
    <div class="cell"><span class="k">Lens moved</span><span class="v">${(Number.isFinite(o.delta) ? o.delta : 0).toFixed(2)} mm</span></div>
    <div class="cell wide"><span class="k">Blur disc on the sensor</span><span class="v ${blurUm < 30 ? 'acc' : ''}">${blurUm < 1 ? '< 1 µm · sharp' : `${Math.round(blurUm)} µm ≈ ${Math.round(px)} pixels${blurUm < 30 ? ' · looks sharp' : ''}`}</span></div>`);
}

export default {
  id: 'focusing',
  short: 'Focusing',
  title: '<em>Focusing</em>',
  sets: ['studio', 'product', 'cutaway'],
  preview: false,
  params: { focus: FOCUS_INFINITY, pointDist: 50, fNumber: 1.8 },
  enter(ctx) {
    ctx.ensurePrime();
    st = { sig: '' };
    const c = ctx.getCutaway();
    c.setOpen(1);
    c.labels.visible = false;
    st.bundle = ctx.scope.attach(ctx.camRig, new RayBundle({ capacity: 400 }));
    ctx.animate(st.bundle, ctx.scope);
    st.spot = ctx.scope.attach(ctx.camRig, new Spot({ color: 0xffe08a, opacity: 0.85 }));
    ctx.xray(0.88, 1.0);
    ctx.lensRig.setOpacity(1);
    ctx.scope.add(() => ctx.body.setXray(0));
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${v.pointDist}|${v.focus}|${v.fNumber}|${v.lens}`;
    if (sig !== st.sig && st.bundle && ctx.stage.activeSets.includes('cutaway')) {
      st.sig = sig;
      rebuild(ctx);
    } else if (!ctx.stage.activeSets.includes('cutaway')) {
      const d = ctx.d;
      const fmt = (m) => (Number.isFinite(m) ? formatDistance(m * 1000) : '∞');
      ctx.panel.setReadout(`
        <div class="cell"><span class="k">Focused at</span><span class="v acc">${fmt(d.focusM)}</span></div>
        <div class="cell"><span class="k">Sharp from</span><span class="v">${fmt(d.dof.nearM)}</span></div>
        <div class="cell"><span class="k">Sharp to</span><span class="v">${fmt(d.dof.farM)}</span></div>`);
    }
  },
  steps: [
    {
      view: VIEW,
      html: `
        <p>Light from a point very far away arrives parallel and meets exactly on the sensor. The lens is <strong>focused at infinity</strong>.</p>
        <p>Remember the thin-lens rule from chapter 4: the closer the object, the <em>farther behind</em> the lens its image forms.</p>`,
      apply(ctx, scope) {
        st.bundle.setReveal(0);
        scope.animate(2, (e) => st.bundle.setReveal(e));
      },
    },
    {
      view: VIEW,
      params: { pointDist: 0.7 },
      animate: 2.4,
      html: `
        <p>Now the point comes closer, to <span class="num">0.7 m</span>. Its rays spread out more, and the lens can't bend them
        together in time: they would meet <strong>behind</strong> the sensor.</p>
        <p>Where they cross the sensor they form a <span class="hl">blurry disc</span> instead of a point. That's what “out of
        focus” physically is.</p>`,
      controls: ['pointDist'],
    },
    {
      view: VIEW,
      html: `
        <p>To fix it, <strong>move the glass away from the sensor</strong>. Turning the focus ring (or the autofocus motor) slides the lens
        forward by a precise amount until the rays meet on the sensor again.</p>
        <p>This design moves as one unit. Most modern lenses move only a small, light <em>internal focus group</em>, which is faster,
        quieter and keeps the barrel length constant.</p>`,
      controls: ['focus', 'pointDist'],
      examples: [
        { label: 'Focus on the point', sub: 'match the distance', run: (ctx) => ctx.store.set({ focus: ctx.store.values.pointDist }, { animate: 1.4 }) },
        { label: 'Back to infinity', sub: 'lens fully retracted', params: { focus: FOCUS_INFINITY } },
        { label: 'Closest focus', sub: '≈ 0.4 m on a 50 mm', params: { focus: 0.4, pointDist: 0.4 } },
      ],
    },
    {
      view: FIELD.side,
      params: { focus: 2.5 },
      html: `
        <p>In the real scene the focus distance is a <span class="hl">plane</span> across the whole view. Everything on it is sharp;
        the farther something is from it, the blurrier it gets.</p>
        <p>Use the examples to focus on different things and watch the simulated photo. This is exactly what the autofocus
        does when you half-press the shutter button.</p>`,
      controls: ['focus'],
      examples: [
        { label: 'The robot', sub: '2.5 m', params: { focus: 2.5 } },
        { label: 'The 5 m post', sub: 'background sharp', params: { focus: 5 } },
        { label: 'Infinity', sub: 'the houses', params: { focus: FOCUS_INFINITY } },
        { label: 'The plant', sub: '1.15 m', params: { focus: 1.15 } },
      ],
      apply(ctx, scope) {
        const chapterSets = ctx.chapter.sets;
        ctx.stage.applySets(['product', 'diorama', 'field']);
        ctx.preview.setVisible(true);
        ctx.body.setXray(0);
        ctx.field.show({ frustum: true, focus: true, slab: false });
        scope.add(() => {
          ctx.stage.applySets(chapterSets);
          ctx.preview.setVisible(false);
          ctx.field.show({ frustum: true, focus: true, slab: true });
          ctx.body.setXray(0.88);
          st.sig = '';
        });
      },
    },
  ],
  deepDive: `
    <p>Newton's form of the lens equation measures distances from the focal points: an object <em>x</em> in front of the
    front focal point images at <em>x′</em> behind the rear focal point, with</p>
    <div class="formula">x · x′ = f²</div>
    <p>So the lens must move out by <span class="num">x′ = f² ÷ x</span>. For a 50 mm lens focusing at 2 m that's
    <span class="num">≈ 1.3 mm</span>; at 0.4 m it's already about <span class="num">8 mm</span>. That's why close focusing needs long travel.</p>`,
};
