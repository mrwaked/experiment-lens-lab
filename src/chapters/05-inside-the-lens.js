import { RayBundle, infinityBundle, WARM } from '../models/rays.js';
import { GLASS_COLORS } from '../models/lens-cutaway.js';

export const SIDE = { pos: [-0.25, 0.022, -0.046], target: [0, 0.003, -0.044] };
const BLUE = [0.45, 0.72, 1.0];
const PINK = [1.0, 0.45, 0.78];
const ROLES = [
  'Gathers the light and starts bending it towards the axis.',
  'A cemented pair: a crown element glued to a flint element. Together they cancel most colour fringing.',
  'The mirror image of the front doublet. The near-symmetry around the aperture cancels distortion and coma.',
  'Final positive element that brings the cone to a focus on the sensor.',
];

let st = {};

function glassHex(kind) {
  return `#${(GLASS_COLORS[kind] ?? GLASS_COLORS.other).toString(16).padStart(6, '0')}`;
}

function rebuild(ctx) {
  const o = ctx.opticsState();
  const fields = st.fields ?? [0];
  const colors = [WARM, BLUE, PINK];
  const paths = [];
  fields.forEach((angle, k) => {
    paths.push(...infinityBundle(o.sys, { angle: -angle, count: k === 0 ? 11 : 7, stopR: o.stopR, color: colors[k] }));
  });
  st.bundle.setPaths(paths);
  const blocked = paths.filter((p) => p.status !== 'ok').length;
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Focal length</span><span class="v">${o.design.info.efl.toFixed(1)} mm</span></div>
    <div class="cell"><span class="k">Aperture</span><span class="v acc">${o.d.fLabel}</span></div>
    <div class="cell"><span class="k">Elements / groups</span><span class="v">6 / 4</span></div>
    ${fields.length > 1 ? `<div class="cell wide"><span class="k">Rays stopped by the barrel</span><span class="v">${blocked} of ${paths.length}</span></div>` : ''}`);
}

export default {
  id: 'inside-the-lens',
  short: 'Inside the lens',
  title: 'Inside the <em>lens</em>',
  sets: ['studio', 'product', 'cutaway'],
  preview: false,
  params: { focus: 60, fNumber: 2.8 },
  enter(ctx) {
    ctx.ensurePrime();
    st = { sig: '' };
    const c = ctx.getCutaway();
    c.labels.visible = false;
    c.setOpen(0);
    st.cut = c;
    st.bundle = ctx.scope.attach(ctx.camRig, new RayBundle({ capacity: 800 }));
    ctx.animate(st.bundle, ctx.scope);
    st.bundle.setReveal(0);
    ctx.xray(0.86, 1.4);
    ctx.scope.add(() => {
      ctx.body.setXray(0);
      c.labels.visible = false;
      c.setOpen(1);
    });
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${v.fNumber}|${v.focus}|${v.lens}|${(st.fields ?? []).join(',')}|${v.blades}`;
    if (sig !== st.sig && st.bundle) {
      st.sig = sig;
      rebuild(ctx);
    }
  },
  steps: [
    {
      view: SIDE,
      html: `
        <p>Let's cut the lens in half. Inside the barrel there isn't one lens but a <strong>stack of glass elements</strong>,
        each ground to a precise curve, plus the adjustable <strong>aperture</strong> in the middle.</p>
        <p>This is a classic <em>double-Gauss</em> design with 6 elements in 4 groups, the ancestor of almost every 50 mm prime.
        Modern lenses use around a dozen elements, but the idea is the same.</p>`,
      apply(ctx, scope) {
        st.fields = [0];
        st.bundle.setReveal(0);
        scope.animate(1.8, (e) => st.cut.setOpen(e), { delay: 0.3 });
      },
    },
    {
      view: SIDE,
      html: `
        <p>Here is light from a point far away, straight ahead. Its rays arrive <strong>parallel</strong>.</p>
        <p>Watch them bend at every glass surface: a little at each one, never all at once. The result is that the whole bundle
        <strong>meets in a single point on the sensor</strong>. That's a sharp image of that point.</p>
        <p class="note">These rays are really traced through every surface with Snell's law, using the real glass of this design.</p>`,
      controls: ['fNumber'],
      apply(ctx, scope) {
        st.cut.setOpen(1);
        st.fields = [0];
        st.cut.labels.visible = true;
        st.sig = '';
        scope.animate(2.4, (e) => st.bundle.setReveal(e), { delay: 0.2 });
      },
    },
    {
      view: { pos: [-0.26, 0.035, -0.055], target: [0, 0.0, -0.045] },
      html: `
        <p>Light from the <span style="color:#72b8ff">side of the scene</span> and from the <span style="color:#ff73c7">corner of the frame</span>
        comes in at an angle and lands off-centre on the sensor. That is how the lens spreads the scene across the whole sensor.</p>
        <p>Notice that some of the corner rays hit the barrel and stop. Corners always get a little less light:
        that is <strong>vignetting</strong>, and it also gives out-of-focus highlights at the edges their “cat's-eye” shape.</p>`,
      controls: ['fNumber'],
      apply(ctx, scope) {
        st.cut.setOpen(1);
        st.cut.labels.visible = true;
        const fd = ctx.opticsState().design.fieldDeg;
        st.fields = [0, Math.round(fd * 0.6), fd];
        st.sig = '';
        st.bundle.setReveal(0);
        scope.animate(2.4, (e) => st.bundle.setReveal(e), { delay: 0.1 });
      },
    },
    {
      view: { pos: [-0.2, 0.06, -0.09], target: [0, 0.0, -0.045] },
      html: `
        <p>The elements are made of <strong>different kinds of glass</strong>: <span style="color:${glassHex('crown')}">crown glass</span>
        (low dispersion) and <span style="color:${glassHex('flint')}">flint glass</span> (high dispersion). Click the numbered dots to see each one.</p>
        <p>Why mix them? Every glass bends blue light a bit more than red. Pairing a positive crown element with a negative flint
        element cancels most of that colour error. Modern lenses add <span style="color:${glassHex('ed')}">ED</span> (extra-low dispersion)
        glass and <strong>aspherical</strong> elements for even more correction.</p>`,
      apply(ctx) {
        st.cut.setOpen(1);
        st.cut.labels.visible = false;
        st.fields = [0];
        st.sig = '';
        st.bundle.setReveal(1);
        const groups = [...new Set(st.cut.elements.map((e) => e.group))];
        st.cut.elements.forEach((el, i) => {
          const g = el.glass;
          const role = ROLES[groups.indexOf(el.group)] ?? '';
          ctx.hotspots.add(st.cut.optics, el.center.clone().setY(-el.h * 0.55).setX(-0.5), {
            title: g.name,
            number: i + 1,
            text: `<span class="num">n = ${g.nd.toFixed(3)}</span> · Abbe <span class="num">${g.vd.toFixed(1)}</span><br>${g.kind === 'flint' ? 'High dispersion (flint).' : 'Low dispersion (crown).'} ${role}`,
            side: i % 2 ? 'left' : 'right',
          });
        });
      },
    },
  ],
  deepDive: `
    <p><strong>Focal length of a thick lens.</strong> A real lens behaves like an ideal thin lens placed at its
    <em>rear principal plane</em>. The focal length is measured from there to the focus, not from the glass.</p>
    <div class="formula">1/f = (n − 1) · (1/R₁ − 1/R₂)&nbsp;&nbsp;(thin lens, “lensmaker's equation”)</div>
    <p><strong>Why nearly symmetric?</strong> Aberrations such as coma, distortion and lateral colour change sign between the
    front and rear halves. Mirroring the halves around the stop makes them largely cancel.</p>
    <p><strong>Snell's law</strong> is applied at every surface: <span class="num">n₁ sin θ₁ = n₂ sin θ₂</span>.</p>`,
};
