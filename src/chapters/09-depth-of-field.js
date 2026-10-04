import { FIELD } from './06-angle-of-view.js';
import { formatDistance, hyperfocal, COC } from '../optics/photo-math.js';

const fmt = (m) => (Number.isFinite(m) ? formatDistance(m * 1000) : '∞');

function readout(ctx) {
  const d = ctx.d;
  const total = Number.isFinite(d.dof.farM) ? d.dof.farM - d.dof.nearM : Infinity;
  const totalTxt = !Number.isFinite(total) ? '∞' : total < 1 ? `${Math.round(total * 1000) / 10} cm` : `${total.toFixed(2)} m`;
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Near limit</span><span class="v">${fmt(d.dof.nearM)}</span></div>
    <div class="cell"><span class="k">Far limit</span><span class="v">${fmt(d.dof.farM)}</span></div>
    <div class="cell"><span class="k">Depth of field</span><span class="v acc">${totalTxt}</span></div>
    <div class="cell wide"><span class="k">Hyperfocal distance (focus here → sharp to ∞)</span><span class="v">${fmt(d.hyperfocalM)}</span></div>`);
}

export default {
  id: 'depth-of-field',
  short: 'Depth of field',
  title: 'Depth of <em>field</em>',
  sets: ['product', 'diorama', 'field'],
  preview: true,
  params: { lens: 'z50', fNumber: 1.8, focus: 2.5, cameraBack: 0, blurMap: false },
  enter(ctx) {
    ctx.field.show({ frustum: true, focus: true, slab: true });
    ctx.scope.add(() => ctx.store.set({ blurMap: false }));
  },
  update(ctx) {
    readout(ctx);
  },
  steps: [
    {
      view: FIELD.dof,
      params: { blurMap: false },
      html: `
        <p>A lens can only focus at <strong>one distance</strong> at a time: the <span class="hl">yellow plane</span>. Everything else
        is a little blurred. But “a little” is often invisible, so there's a zone around the focus plane that <em>looks</em> sharp:
        the <span class="g">green slab</span>, the <strong>depth of field</strong>.</p>
        <p>Right now, at <span class="num">f/1.8</span> focused on the robot, it's only about a quarter of a metre deep. Use the distance posts to read it.</p>`,
      controls: ['fNumber', 'focus'],
    },
    {
      view: FIELD.shoulder,
      params: { blurMap: true },
      html: `
        <p>Why a zone and not a plane? A point that isn't exactly in focus lands on the sensor as a small <strong>disc</strong>
        instead of a point: the <em>circle of confusion</em>. If that disc is smaller than about <span class="num">0.03 mm</span>
        (for full frame), your eye can't tell it from a point in a normal-sized print.</p>
        <p>The simulated photo now shows a <strong>blur map</strong>: <span class="g">green</span> = acceptably sharp,
        <span class="b">blue</span> = blurred in front, <span class="r">red</span> = blurred behind. Change the aperture and watch the green zone grow.</p>`,
      controls: ['fNumber', 'blurMap'],
    },
    {
      view: FIELD.side,
      params: { blurMap: false, lens: 'free', focal: 50 },
      html: `
        <p>Three things control depth of field:</p>
        <ul>
          <li><strong>Aperture</strong>: smaller opening (higher f-number) → deeper.</li>
          <li><strong>Distance</strong>: focusing farther away → much deeper.</li>
          <li><strong>Magnification</strong>: a longer lens or getting closer → shallower.</li>
        </ul>
        <p>Photographers juggle these. Portraits want a thin slice so the background melts away; landscapes want everything
        sharp from the flowers at your feet to the mountains.</p>`,
      controls: ['focal', 'fNumber', 'focus'],
      examples: [
        { label: 'Portrait', sub: '85 mm · f/1.8 · 2 m', params: { focal: 85, fNumber: 1.8, focus: 2.0 } },
        { label: 'Group photo', sub: '35 mm · f/5.6 · 4 m', params: { focal: 35, fNumber: 5.6, focus: 4.0 } },
        {
          label: 'Landscape',
          sub: '24 mm · f/8 · hyperfocal',
          run: (ctx) => ctx.store.set({ focal: 24, fNumber: 8, focus: hyperfocal(24, 8) / 1000 + 0.04 }, { animate: 1.2 }),
        },
        { label: 'Close-up', sub: '85 mm · f/1.8 · 0.8 m', params: { focal: 85, fNumber: 1.8, focus: 0.8 } },
      ],
    },
  ],
  deepDive: `
    <p>With focal length <em>f</em>, f-number <em>N</em>, circle of confusion <em>c</em> (<span class="num">${COC} mm</span>) and
    focus distance <em>s</em>:</p>
    <div class="formula">H = f² ÷ (N·c) + f &nbsp;&nbsp;(hyperfocal distance)</div>
    <div class="formula">near = s(H − f) ÷ (H + s − 2f) &nbsp;·&nbsp; far = s(H − f) ÷ (H − s)</div>
    <p>Example: 85 mm at f/1.8, focused at 2 m → near <span class="num">1.97 m</span>, far <span class="num">2.03 m</span>,
    only <span class="num">5.7 cm</span> deep: enough for the eyes, not for the ears. 24 mm at f/8 focused at H = 2.42 m →
    everything from <span class="num">1.21 m</span> to infinity is sharp.</p>`,
};
