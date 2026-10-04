import { RayBundle, LightCone, infinityBundle, apertureCone } from '../models/rays.js';
import { stopColumnChart } from '../ui/chart.js';
import { lightFraction, stopsBetween, FULL_STOPS } from '../optics/photo-math.js';
import { ease } from '../core/tween.js';

const VIEW = { pos: [-0.23, 0.06, -0.075], target: [0, 0.004, -0.042] };
const POP = { pos: [-0.26, 0.11, -0.12], target: [-0.012, 0.03, -0.05] };
let st = {};

function irisHome(scope) {
  const iris = st.cut.iris.group;
  const from = { p: iris.position.clone(), ry: iris.rotation.y, s: iris.scale.x };
  if (from.s === 1 && from.ry === 0) return;
  scope.animate(1.0, (e) => {
    iris.position.lerpVectors(from.p, iris.position.clone().set(0, 0, st.cut.stopZ), e);
    iris.rotation.set(0, from.ry * (1 - e), 0);
    iris.scale.setScalar(from.s + (1 - from.s) * e);
  });
}

function rebuild(ctx) {
  const o = ctx.opticsState();
  const v = ctx.store.values;
  st.bundle.setPaths(infinityBundle(o.sys, { count: 13, stopR: o.stopR }));
  const cone = apertureCone(o.sys, -Infinity, { r: o.stopR, blades: v.blades, rounded: v.rounded, maxR: o.maxStopR, n: 72 });
  st.cone.setRays(cone.rays);
  const D = o.d.focal / o.d.N;
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Aperture</span><span class="v acc">${o.d.fLabel}</span></div>
    <div class="cell"><span class="k">Opening seen from the front</span><span class="v">${D.toFixed(1)} mm</span></div>
    <div class="cell"><span class="k">Light vs f/1.8</span><span class="v">${(lightFraction(o.d.N, 1.8) * 100).toFixed(o.d.N > 8 ? 1 : 0)} %</span></div>
    <div class="cell wide"><span class="k">Exposure change</span><span class="v">${stopsBetween(1.8, o.d.N).toFixed(1)} stops darker · shutter ${ctx.d.shutter.label}</span></div>`);
  st.chart?.setMarker(o.d.N);
}

export default {
  id: 'aperture',
  short: 'Aperture',
  title: 'The <em>aperture</em>',
  sets: ['studio', 'product', 'cutaway'],
  preview: true,
  params: { fNumber: 1.8, focus: 60, blades: 9, rounded: true, lockShutter: false },
  enter(ctx) {
    ctx.ensurePrime();
    st = { sig: '' };
    const c = ctx.getCutaway();
    st.cut = c;
    c.setOpen(1);
    c.labels.visible = false;
    st.bundle = ctx.scope.attach(ctx.camRig, new RayBundle({ capacity: 400 }));
    ctx.animate(st.bundle, ctx.scope);
    st.cone = ctx.scope.attach(ctx.camRig, new LightCone({ opacity: 0.1 }));
    ctx.xray(0.88, 1.0);
    ctx.scope.add(() => {
      ctx.body.setXray(0);
      ctx.store.set({ lockShutter: false });
      c.iris.group.position.set(0, 0, c.stopZ);
      c.iris.group.rotation.set(0, 0, 0);
      c.iris.group.scale.setScalar(1);
    });
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${v.fNumber}|${v.blades}|${v.rounded}|${v.lens}|${v.focus}|${v.lockShutter}`;
    if (sig !== st.sig && st.bundle) {
      st.sig = sig;
      rebuild(ctx);
    }
  },
  steps: [
    {
      view: POP,
      html: `
        <p>In the middle of the lens sits the <strong>aperture diaphragm</strong>: a ring of thin, overlapping metal blades that
        pivot together to make the opening bigger or smaller, like the iris of your eye.</p>
        <p>Watch it close down and open again. Then try it yourself, and see how the number of blades sets the
        <em>shape</em> of the opening.</p>`,
      controls: ['fNumber', 'blades', 'rounded'],
      apply(ctx, scope) {
        const iris = st.cut.iris.group;
        st.bundle.visible = false;
        st.cone.visible = false;
        scope.animate(1.4, (e) => {
          iris.position.set(-16 * e, 48 * e, st.cut.stopZ - 8 * e);
          iris.rotation.set(0, (-Math.PI / 2) * e, 0);
          iris.scale.setScalar(1 + 0.7 * e);
        });
        const demo = [1.8, 2.8, 4, 5.6, 8, 11, 16, 11, 8, 5.6, 4, 2.8, 1.8];
        demo.forEach((N, i) => scope.tween({ delay: 1.6 + i * 0.32, duration: 0.3, ease: ease.inOutSine, update: () => {}, complete: () => ctx.store.set({ fNumber: N }) }));
        scope.add(() => {
          st.bundle.visible = true;
          st.cone.visible = true;
        });
      },
    },
    {
      view: VIEW,
      html: `
        <p>The opening limits how wide the <strong>cone of light</strong> through the lens can be. The number that describes
        it is the <strong>f-number</strong>: focal length divided by the diameter of the opening (as seen from the front).</p>
        <p>So <span class="num">f/2</span> on a 50 mm lens means a 25 mm opening. Because it's a <em>ratio</em>, f/2 lets through
        the same light on any lens, wide or tele. Each full stop (×1.4 in f-number) <strong>halves</strong> the light.</p>`,
      controls: ['fNumber'],
      examples: [
        { label: 'Wide open', sub: 'f/1.8 · maximum light', params: { fNumber: 1.8 } },
        { label: 'Two stops down', sub: 'f/3.5', params: { fNumber: 3.5 } },
        { label: 'Stopped down', sub: 'f/8 · 1/20 of the light', params: { fNumber: 8 } },
        { label: 'Tiny', sub: 'f/16', params: { fNumber: 16 } },
      ],
      apply(ctx, scope) {
        irisHome(scope);
        st.chart = stopColumnChart(ctx.panel.figureHost(), {
          title: 'Light reaching the sensor',
          subtitle: 'Relative to f/1.4, per full stop',
          value: (N) => lightFraction(N, 1.4) * 100,
          label: (v) => `${v >= 10 ? Math.round(v) : v.toFixed(1)}%`,
        });
        st.sig = '';
      },
    },
    {
      view: VIEW,
      html: `
        <p>Less light has to be paid for. By default the camera keeps the photo equally bright by leaving the shutter open
        longer: watch the shutter speed in the viewfinder change as you stop down.</p>
        <p>Turn on <em>Lock the shutter speed</em> to see what happens when it can't compensate: every stop makes the photo
        half as bright. Aperture, shutter speed and ISO are the three sides of the <strong>exposure triangle</strong>.</p>`,
      controls: ['fNumber', 'lockShutter'],
      examples: [
        { label: 'f/1.8', sub: '1/250 s', params: { fNumber: 1.8 } },
        { label: 'f/4', sub: '≈ 1/50 s', params: { fNumber: 4 } },
        { label: 'f/8', sub: '≈ 1/13 s · use a tripod', params: { fNumber: 8 } },
      ],
      apply(ctx, scope) {
        irisHome(scope);
        st.chart = null;
        st.sig = '';
      },
    },
  ],
  deepDive: `
    <p>The f-number is <span class="num">N = f ÷ D</span>, where D is the diameter of the <em>entrance pupil</em> (the opening
    as it appears through the front glass). Light gathered goes with the area, so with <span class="num">1 ÷ N²</span>.</p>
    <div class="formula">${FULL_STOPS.map((n) => `f/${n}`).join(' → ')}</div>
    <p>Each step is ×√2 in N and ½ in light. From f/1.8 to f/8 is <span class="num">(8 ÷ 1.8)² ≈ 20×</span> less light, about 4.3 stops.</p>`,
};
