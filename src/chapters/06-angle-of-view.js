import { aov, formatDistance } from '../optics/photo-math.js';

// Framing by content: camera on its tripod, the robot, and the first distance posts.
const CAMERA_AND_ROBOT = [
  [0, 0.08, 0.1],
  [0, -1.3, 0.3],
  [0, 0.3, -2.5],
  [0, -1.3, -2.7],
  [-1.05, -1.3, -3],
];
export const FIELD = {
  side: { fit: CAMERA_AND_ROBOT, dir: [1, -0.42, -0.12] },
  behind: { pos: [0.75, 0.42, 1.25], target: [0, -0.15, -3.2] },
  top: { fit: [[0, 0.05, 0.1], [0, -1.3, 0.2], [0.7, -1.3, -2.8], [-1.05, -1.3, -4.2]], dir: [0.4, -0.82, -0.4], pad: 0.82 },
  dof: { fit: [[-1.05, -1.3, -1.6], [-1.05, -0.7, -3.6], [0.75, 0.3, -2.5], [0, -1.3, -2.5], [0, 0.2, -1.8]], dir: [0.75, -0.42, -0.5], pad: 0.9 },
  close: { pos: [-0.34, 0.14, -0.3], target: [0, 0, -0.07] },
  shoulder: { fit: CAMERA_AND_ROBOT, dir: [0.42, -0.4, -0.81], pad: 0.92 },
};

function readout(ctx) {
  const d = ctx.d;
  const a = aov(d.focal);
  ctx.panel.setReadout(`
    <div class="cell"><span class="k">Focal length</span><span class="v acc">${Math.round(d.focal)} mm</span></div>
    <div class="cell"><span class="k">Horizontal</span><span class="v">${a.h.toFixed(1)}°</span></div>
    <div class="cell"><span class="k">Diagonal</span><span class="v">${a.d.toFixed(1)}°</span></div>
    <div class="cell wide"><span class="k">Width covered at the robot</span><span class="v">${formatDistance((((2.5 + ctx.store.values.cameraBack) * 35.9) / d.focal) * 1000)}</span></div>`);
}

const chip = (f, label, sub) => ({ label, sub: `${f} mm · ${sub}`, params: { focal: f } });

export default {
  id: 'angle-of-view',
  short: 'Angle of view',
  title: 'Focal length & <em>angle of view</em>',
  sets: ['product', 'diorama', 'field'],
  preview: true,
  params: { lens: 'free', focal: 50, focus: 2.5, fNumber: 4, cameraBack: 0 },
  enter(ctx) {
    ctx.field.show({ frustum: true, focus: false, slab: false });
    ctx.scope.add(() => {
      ctx.field.show({ frustum: true, focus: true, slab: true });
      ctx.store.set({ cameraBack: 0 });
    });
  },
  update(ctx) {
    readout(ctx);
  },
  steps: [
    {
      view: FIELD.side,
      html: `
        <p>Back outside. The white wedge is everything this camera can see: its <strong>angle of view</strong>.</p>
        <p>The focal length decides how wide that wedge is. A long focal length projects a <em>bigger</em> image of the scene onto
        the same 36 × 24 mm sensor, so less of the scene fits. The result: a narrow angle and a “zoomed-in” photo.</p>
        <p>Try the examples and watch both the wedge and the simulated photo.</p>`,
      controls: ['focal'],
      examples: [
        chip(14, 'Ultra-wide', 'interiors, big skies'),
        chip(24, 'Wide', 'landscapes, travel'),
        chip(50, 'Normal', 'close to our eye'),
        chip(85, 'Portrait', 'flattering faces'),
        chip(200, 'Telephoto', 'sports, stage'),
        chip(400, 'Super-tele', 'wildlife, birds'),
      ],
    },
    {
      view: FIELD.close,
      params: { lens: 'z24120', focal: 24 },
      html: `
        <p>A <strong>zoom lens</strong> changes its focal length continuously. Turn the zoom ring and groups of elements slide
        inside the barrel, changing how strongly the whole system bends light. That's why this 24–120 mm lens <em>grows</em> when you zoom in.</p>
        <p>A <strong>prime</strong> lens has one fixed focal length. It is simpler inside, so it is usually smaller, sharper and
        brighter (f/1.8 instead of f/4). You “zoom” by walking.</p>`,
      controls: ['focal'],
      controlOverrides: { focal: { min: 24, max: 120 } },
      examples: [
        { label: 'Zoom out', sub: '24 mm', params: { focal: 24 } },
        { label: 'Middle', sub: '50 mm', params: { focal: 50 } },
        { label: 'Zoom in', sub: '120 mm', params: { focal: 120 } },
      ],
    },
    {
      view: FIELD.top,
      params: { lens: 'free', focal: 24, cameraBack: 0, focus: 2.5 },
      html: `
        <p>A myth: “telephoto lenses compress perspective.” Try it. Each example keeps the robot the <strong>same size</strong>
        by stepping back as the focal length grows.</p>
        <p>The robot stays the same, but the houses and lights behind it grow dramatically. That's not the lens: it's
        <strong>distance</strong>. From farther away, the robot and the background are at more similar distances, so they look
        more similar in size. The focal length only decides how much of that view you crop.</p>`,
      controls: ['focal', 'cameraBack'],
      controlOverrides: { cameraBack: { max: 20 } },
      examples: [
        { label: 'Close & wide', sub: '24 mm from 2.5 m', params: { focal: 24, cameraBack: 0, focus: 2.5 } },
        { label: 'Normal', sub: '50 mm from 5.2 m', params: { focal: 50, cameraBack: 2.71, focus: 5.21 } },
        { label: 'Portrait', sub: '85 mm from 8.9 m', params: { focal: 85, cameraBack: 6.35, focus: 8.85 } },
        { label: 'Far & long', sub: '200 mm from 20.8 m', params: { focal: 200, cameraBack: 18.3, focus: 20.8 } },
      ],
    },
  ],
  deepDive: `
    <p>The angle of view follows from simple geometry: half the sensor size over the focal length.</p>
    <div class="formula">angle = 2 · atan( sensor size ÷ (2 · f) )</div>
    <p>For the 36 mm-wide full-frame sensor: 24 mm → <span class="num">73.7°</span>, 50 mm → <span class="num">39.6°</span>,
    200 mm → <span class="num">10.3°</span> horizontally. On a smaller APS-C (DX) sensor the same lens sees about 1.5× less. That is the “crop factor”.</p>`,
};
