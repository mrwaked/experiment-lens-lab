import * as THREE from 'three';
import { LightCone, RayBundle } from '../models/rays.js';

const FAR_VIEW = { pos: [-3.3, 0.5, -1.15], target: [0.1, -0.35, -1.25] };
const NEAR_VIEW = { pos: [-0.135, 0.045, -0.125], target: [0, -0.002, -0.012] };
const TOP = [1.0, 0.8, 0.35];
const FEET = [0.4, 0.7, 1.0];
let st = {};

function build(ctx) {
  const d = ctx.d;
  const back = ctx.store.values.cameraBack;
  const pupilZ = back - d.pupilM;
  const epR = d.pinhole ? 0.00014 : d.focal / d.N / 2000;
  const sensorZ = back;
  const cones = [];
  const pulses = [];
  for (const [local, color] of [
    [new THREE.Vector3(0.05, 0.65, 0), TOP],
    [new THREE.Vector3(0, 0.02, 0.05), FEET],
  ]) {
    const P = ctx.diorama.robot.localToWorld(local.clone());
    const s = pupilZ - P.z;
    const m = (d.focal / 1000) / (s - d.focal / 1000);
    const Q = new THREE.Vector3(-P.x * m, -P.y * m, sensorZ - 0.0006);
    const rays = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const E = new THREE.Vector3(Math.cos(a) * epR, Math.sin(a) * epR, pupilZ);
      rays.push([P.toArray(), E.toArray(), Q.toArray()]);
      if (i % 10 === 0) pulses.push({ points: [P.toArray(), E.toArray(), Q.toArray()], color });
    }
    cones.push({ rays, color });
  }
  st.cones.forEach((c, i) => c.setRays(cones[i].rays));
  st.pulses.setPaths(pulses);
  ctx.body.setSensorImage(st.showImage ? 1 : 0);
}

export default {
  id: 'light-path',
  short: 'The light path',
  title: 'The <em>light</em> path',
  sets: ['product', 'diorama', 'field'],
  preview: true,
  params: { lens: 'z50', focus: 2.5, fNumber: 1.8, pinhole: false, cameraBack: 0 },
  enter(ctx) {
    st = { sig: '', showImage: false };
    ctx.field.show({ frustum: false, focus: false, slab: false });
    st.cones = [TOP, FEET].map((c) =>
      ctx.scope.attach(ctx.stage.scene, new LightCone({ color: new THREE.Color(c[0], c[1], c[2]).getHex(), opacity: 0.16, maxVerts: 2000 })),
    );
    st.pulses = ctx.scope.attach(ctx.stage.scene, new RayBundle({ capacity: 64, dash: 0.05, gap: 0.22, speed: 0.9, width: 1.4, pulseWidth: 3.2 }));
    ctx.animate(st.pulses, ctx.scope);
    ctx.scope.add(() => {
      ctx.field.show({ frustum: true, focus: true, slab: true });
      ctx.body.setSensorImage(0);
      ctx.body.setXray(0);
      ctx.lensRig.setOpacity(1);
      ctx.store.set({ pinhole: false });
    });
  },
  update(ctx) {
    const v = ctx.store.values;
    const sig = `${v.pinhole}|${v.lens}|${v.fNumber}|${v.cameraBack}|${st.showImage}`;
    if (sig !== st.sig && st.cones) {
      st.sig = sig;
      build(ctx);
    }
  },
  steps: [
    {
      view: FAR_VIEW,
      html: `
        <p>Every point of the robot scatters light in all directions. A tiny fraction of it, a thin <strong>cone</strong>, happens
        to hit the front of the lens.</p>
        <p>Here are two of those cones: one from the tip of the antenna, one from the feet. Millions of such cones enter
        the lens at once, one for every point you can see.</p>`,
    },
    {
      view: NEAR_VIEW,
      html: `
        <p>Inside the camera, the lens bends each cone so it narrows again to a <strong>single point on the sensor</strong>.</p>
        <p>But the cones <em>cross</em>: light from the top of the antenna lands at the <strong>bottom</strong> of the sensor, the feet at the top.
        The picture on the sensor is <strong>upside-down and mirrored</strong>, just like in your eye. The camera simply reads
        the pixels in reverse order; your brain does the same trick.</p>`,
      apply(ctx, scope) {
        st.showImage = true;
        ctx.xray(0.9, 1.2, scope);
        scope.animate(1.2, (e) => ctx.lensRig.setOpacity(1 - 0.82 * e));
        scope.add(() => {
          st.showImage = false;
          ctx.body.setXray(0);
          ctx.lensRig.setOpacity(1);
        });
      },
    },
    {
      view: NEAR_VIEW,
      html: `
        <p>Do you even need glass? A <strong>pinhole</strong> also makes an image: only a hair-thin ray from each point gets through,
        so the cones can't overlap much.</p>
        <p>Switch it on and watch the simulated photo. The image is still there, but everything is soft, and so little light
        gets in that the exposure goes from <span class="num">1/250 s</span> to about <span class="num">40 s</span>.
        A lens gathers a <strong>wide</strong> cone <em>and</em> focuses it: about 10,000× more light, and sharp.</p>`,
      controls: ['pinhole'],
      examples: [
        { label: 'Glass lens', sub: 'f/1.8 · 1/250 s', params: { pinhole: false } },
        { label: 'Pinhole', sub: '≈ f/180 · 40 s', params: { pinhole: true } },
      ],
      apply(ctx, scope) {
        st.showImage = true;
        ctx.body.setXray(0.9);
        ctx.lensRig.setOpacity(0.18);
        const unsub = ctx.store.subscribe(['pinhole'], (_, v) => ctx.lensRig.setOpacity(v.pinhole ? 0.03 : 0.18));
        scope.add(() => {
          unsub();
          st.showImage = false;
          ctx.body.setXray(0);
          ctx.lensRig.setOpacity(1);
          ctx.store.set({ pinhole: false });
        });
      },
    },
  ],
  deepDive: `
    <p>For a pinhole, the sharpest possible hole balances two blurs: the size of the hole itself, and diffraction, which
    grows as the hole shrinks. The optimum is roughly</p>
    <div class="formula">d ≈ √(2.44 · λ · f) ≈ √(2.44 × 0.00055 × 50) ≈ 0.26 mm → about f/190</div>
    <p>Compared with f/1.8 that is <span class="num">(190 ÷ 1.8)² ≈ 11,000×</span> less light, about 13.4 stops.</p>`,
};
