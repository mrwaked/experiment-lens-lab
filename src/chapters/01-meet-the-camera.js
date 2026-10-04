import { LENSES } from '../state.js';
import { reducedMotion } from '../core/tween.js';

const VIEW = {
  hero: { pos: [0.27, 0.105, -0.37], target: [0.004, 0.004, -0.03] },
  rear: { pos: [0.19, 0.2, 0.26], target: [0.004, 0.01, 0.006] },
  mount: { pos: [-0.03, 0.07, -0.3], target: [0.035, 0.0, -0.035] },
  lens: { pos: [-0.17, 0.07, -0.2], target: [0.0, 0.0, -0.045] },
};

function bodyHotspots(ctx, list) {
  const { body, hotspots } = ctx;
  list.forEach(([key, title, text, extra], i) => hotspots.add(body.group, body.anchors[key], { title, text, number: i + 1, ...extra }));
}

export default {
  id: 'meet-the-camera',
  short: 'Meet the camera',
  title: 'Meet the <em>camera</em>',
  sets: ['studio', 'product'],
  preview: true,
  params: { lens: 'z50', focus: 2.5, fNumber: 1.8, pinhole: false, lockShutter: false },
  steps: [
    {
      view: VIEW.hero,
      html: `
        <p>Every photo starts with light bouncing off the world. A camera such as the <strong>Nikon Z5 II</strong> is, at heart, a
        light-tight box with a <strong>sensor</strong> at the back and a <strong>lens</strong> at the front.</p>
        <p>The lens collects a cone of light from every point of the scene and bends it so that the whole cone lands on
        <em>one</em> point of the sensor. Do that for millions of points at once and you get a sharp picture.</p>
        <div class="callout"><b>How to use this tour</b>Click <span class="hl">Next</span> (or press →) to go step by step.
        Drag to orbit, scroll to zoom. Pulsing dots in the scene are clickable. The small window bottom-left is a
        <em>simulated photo</em>: what this camera would capture right now.</div>`,
      apply(ctx) {
        ctx.stage.controls.autoRotate = !reducedMotion;
        ctx.scope.add(() => (ctx.stage.controls.autoRotate = false));
      },
    },
    {
      view: VIEW.rear,
      html: `
        <p>The body is the lens's partner. It holds the sensor steady, reads it out, and shows you the result.
        Click the dots to see what each part does.</p>
        <p class="note">This is a generic model with the proportions of the Z5 II (134 × 100 × 72 mm). No logos, but the
        same layout you'd find on most full-frame mirrorless cameras.</p>`,
      apply(ctx) {
        bodyHotspots(ctx, [
          ['evf', 'Viewfinder', 'An electronic viewfinder: a tiny <span class="num">3.69 M-dot</span> OLED screen, up to <span class="num">3000 nits</span>. It shows exactly what the sensor sees, including exposure and depth of field.'],
          ['lcd', 'Vari-angle screen', 'A <span class="num">3.2″</span> touchscreen that flips out. It is showing the live simulated photo from this tour.', { side: 'left' }],
          ['shutter', 'Shutter button', 'Half-press to focus, full press to take the picture. The shutter in front of the sensor then opens for exactly the exposure time you set.'],
          ['modeDial', 'Mode dial', 'P, S, A, M… decides whether you or the camera chooses aperture and shutter speed. You will meet both later in the tour.', { side: 'left' }],
        ]);
      },
    },
    {
      view: VIEW.mount,
      html: `
        <p>Twist the lens off and you can see the <strong>sensor</strong>: a rainbow-shimmering rectangle, <span class="num">35.9 × 23.9 mm</span>.
        That is “full frame”, the same size as a frame of classic 35 mm film.</p>
        <p>Its <span class="num">6048 × 4032</span> light-sensitive pixels are each only <span class="num">5.9 µm</span> wide, about a tenth of a
        human hair. Everything the lens does is about putting the right light on the right pixel.</p>`,
      apply(ctx, scope) {
        scope.animate(1.6, (e) => ctx.setDetach(e));
        scope.add(() => ctx.setDetach(0));
        bodyHotspots(ctx, [
          ['sensor', 'Image sensor', '24.5 MP BSI-CMOS. It floats on a stabilising mount (IBIS) that shifts it to cancel hand shake, worth up to <span class="num">7.5 stops</span>.'],
          ['mount', 'Z mount', 'A bayonet <span class="num">55 mm</span> wide and only <span class="num">16 mm</span> from the sensor. The wide, short throat lets designers place big glass close to the sensor, which helps bright, sharp lenses.', { side: 'left' }],
        ]);
      },
    },
    {
      view: VIEW.lens,
      controls: ['lens'],
      html: `
        <p>Now the star of the show: the <strong>lens</strong>. From the outside it is a tube with rings; inside, it is a stack of
        precisely shaped glass elements, an adjustable hole called the <strong>aperture</strong>, and motors that move glass to focus.</p>
        <p>Try the three lenses below. Notice how the barrel and the simulated photo change.</p>`,
      examples: Object.values(LENSES)
        .filter((l) => !l.hidden)
        .map((l) => ({ label: l.name, sub: l.blurb.split(':')[0].split('.')[0], params: { lens: l.id }, animate: 0 })),
      apply(ctx) {
        const ext = ctx.lensRig.exterior;
        const add = (parent, pos, title, text, extra = {}) => ctx.hotspots.add(parent, pos, { title, text, ...extra });
        add(ext.front, ext.anchors.front, 'Front element', 'The first glass the light meets. The purple-green sheen is the anti-reflection <em>coating</em> (chapter 12).', { number: 1, side: 'left' });
        add(ext.group, ext.anchors.focus, 'Focus ring', 'Turning it moves glass inside the lens to focus nearer or farther (chapter 7).', { number: 2, chapter: 'focusing', chapterLabel: 'Jump to Focusing' });
        add(ext.group, ext.anchors.control, 'Control ring', 'A customisable ring, often set to aperture or exposure compensation.', { number: 3, side: 'left' });
      },
    },
  ],
  deepDive: `
    <p><strong>Why “full frame” matters.</strong> A bigger sensor needs a longer focal length for the same framing. That gives
    shallower depth of field at the same f-number and collects more total light, so there is less noise.</p>
    <div class="formula">crop factor = 43.3 mm ÷ sensor diagonal &nbsp;·&nbsp; FX = 1.0×, DX ≈ 1.5×</div>
    <p><strong>Flange distance.</strong> Mirrorless mounts don't need room for a flipping mirror, so the lens can sit much closer to
    the sensor: <span class="num">16 mm</span> for Z, versus <span class="num">46.5 mm</span> for Nikon's older F mount.</p>`,
};
