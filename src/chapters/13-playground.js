import { FIELD } from './06-angle-of-view.js';
import { hyperfocal } from '../optics/photo-math.js';
import { LENSES } from '../state.js';

let st = {};

function addThumb(ctx, canvas) {
  if (!st.strip?.isConnected) {
    const host = ctx.panel.figureHost();
    host.innerHTML = '<div class="chart-head"><span class="chart-title">Your photos</span><span class="chart-sub">Click one to download it</span></div><div class="thumbs"></div>';
    st.strip = host.querySelector('.thumbs');
  }
  const d = ctx.d;
  const name = `lens-lab-${Math.round(d.focal)}mm-${d.fLabel.replace('/', '')}.jpg`;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/jpeg', 0.92);
  a.download = name;
  a.title = `${Math.round(d.focal)} mm · ${d.fLabel} · ${d.shutter.label}`;
  a.className = 'thumb';
  a.innerHTML = `<img alt="${a.title}" src="${a.href}"><span>${Math.round(d.focal)} mm · ${d.fLabel}</span>`;
  st.strip.prepend(a);
  while (st.strip.children.length > 6) st.strip.lastChild.remove();
}

const lensChip = (id) => ({
  label: `Mount the ${LENSES[id].short}`,
  sub: LENSES[id].kind === 'zoom' ? 'zoom · swaps the lens' : 'prime · swaps the lens',
  run: (ctx) => ctx.swapLens(id),
});

export default {
  id: 'playground',
  short: 'Playground',
  title: 'The <em>playground</em>',
  sets: ['product', 'diorama', 'field'],
  preview: true,
  params: { lens: 'z50', fNumber: 1.8, focus: 2.5, cameraBack: 0, blurMap: false, cropView: false },
  enter(ctx) {
    st = {};
    document.getElementById('viewfinder').classList.add('big');
    ctx.field.show({ frustum: true, focus: true, slab: true });
    ctx.scope.add(() => document.getElementById('viewfinder').classList.remove('big'));
  },
  steps: [
    {
      view: FIELD.shoulder,
      html: `
        <p>Everything you've learned, in one place. Mount a lens, set the aperture and the focus, then press
        <strong>Take a photo</strong>. Try the scenarios for ideas.</p>
        <p class="note">Keyboard: ← → move through the tour, R resets the view. Drag the scene to look around.</p>`,
      controls: ['focal', 'fNumber', 'focus', 'blades', 'rounded', 'catEye', 'lockShutter', 'vignetting', 'distortion', 'coating', 'blurMap'],
      examples: [
        { label: '📸 Take a photo', sub: 'shutter + download', run: (ctx) => ctx.takePhoto().then((c) => addThumb(ctx, c)) },
        lensChip('z24120'),
        lensChip('z50'),
        lensChip('z85'),
        {
          label: 'Portrait',
          sub: '85 mm · f/1.8 · robot',
          run: async (ctx) => {
            if (!(await ctx.swapLens('z85'))) return;
            ctx.store.set({ fNumber: 1.8, focus: 2.5, blades: 9, rounded: true }, { animate: 1 });
          },
        },
        {
          label: 'Landscape',
          sub: '24 mm · f/8 · hyperfocal',
          run: async (ctx) => {
            if (!(await ctx.swapLens('z24120'))) return;
            ctx.store.set({ focal: 24, fNumber: 8, focus: hyperfocal(24, 8) / 1000 + 0.075 }, { animate: 1 });
          },
        },
        {
          label: 'Close-up',
          sub: '50 mm · f/1.8 · the plant',
          run: async (ctx) => {
            if (!(await ctx.swapLens('z50'))) return;
            ctx.store.set({ fNumber: 1.8, focus: 1.15 }, { animate: 1 });
          },
        },
        {
          label: 'Distant lights',
          sub: '120 mm · f/4 · ∞',
          run: async (ctx) => {
            if (!(await ctx.swapLens('z24120'))) return;
            ctx.store.set({ focal: 120, fNumber: 4, focus: 60 }, { animate: 1 });
          },
        },
      ],
    },
    {
      view: FIELD.top,
      html: `
        <p>That's the whole journey of light through a lens:</p>
        <ul>
          <li><a href="#refraction">Glass bends light</a> because light slows down in it.</li>
          <li><a href="#focal-length">Curved glass</a> gathers light into a focal point; the focal length sets <a href="#angle-of-view">how much you see</a>.</li>
          <li><a href="#inside-the-lens">Many elements</a> share the work and cancel each other's errors.</li>
          <li><a href="#focusing">Focusing</a> moves glass so the image lands on the sensor.</li>
          <li><a href="#aperture">The aperture</a> controls light, <a href="#depth-of-field">depth of field</a> and the shape of <a href="#bokeh">bokeh</a>.</li>
          <li><a href="#sharpness">Aberrations and diffraction</a> set the limits of sharpness; <a href="#coatings">coatings</a> keep contrast high.</li>
        </ul>
        <p>Now go outside and take some photos. <span class="hl">◎</span></p>`,
      controls: ['fNumber', 'focus'],
    },
  ],
  deepDive: `
    <p>The simulated photo is rendered in four passes: the scene, a per-pixel <em>blur size</em> from the thin-lens
    circle-of-confusion formula, a gather blur that only accepts light inside the shape of your aperture (that's where the
    polygons and cat's eyes come from), and a final pass with vignetting, distortion, colour fringing, ghosts and exposure.</p>
    <p>It uses the Z5 II's real sensor size, so blur sizes match what a real full-frame camera would record, give or take
    a lens's personality.</p>`,
};
