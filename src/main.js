import * as THREE from 'three';
import { createStage, MM } from './core/stage.js';
import { Tweens, smoothstep } from './core/tween.js';
import { createStore, PARAMS, derive, LENSES } from './state.js';
import { makeDoubleGauss } from './optics/designs.js';
import { focusShift } from './optics/tracer.js';
import { createCameraBody } from './models/camera-body.js';
import { createLensRig, exteriorSpec } from './models/lens-exterior.js';
import { createLensCutaway } from './models/lens-cutaway.js';
import { FLANGE_Z } from './models/camera-body.js';
import { withStop, stopRadiusFor, cloneSystem } from './optics/tracer.js';
import { createDiorama } from './models/diorama.js';
import { createFieldHelpers } from './models/field-helpers.js';
import { createSensorPreview } from './preview/sensor-preview.js';
import { createBench } from './models/bench.js';
import { createHotspots } from './ui/hotspots.js';
import { createTour } from './ui/tour.js';
import { chapters } from './chapters/index.js';

function fatal(msg) {
  document.getElementById('fatal-msg').textContent = msg;
  document.getElementById('fatal').hidden = false;
  document.getElementById('loader').classList.add('gone');
  window.__lensReady = true;
}

function boot() {
  const canvas = document.getElementById('gl');
  if (!canvas.getContext('webgl2')) {
    fatal('Your browser or GPU does not support WebGL 2, which this 3D tour needs. Try a recent Chrome, Safari, Edge or Firefox with hardware acceleration on.');
    return;
  }
  const tweens = new Tweens();
  const stage = createStage({ canvas, labelsHost: document.getElementById('labels') });
  const store = createStore(PARAMS, tweens);

  const designs = { z50: makeDoubleGauss(50), z85: makeDoubleGauss(85) };
  const shiftCache = new Map();
  const focusShiftFor = (id, focusM) => {
    if (!designs[id] || !Number.isFinite(focusM)) return 0;
    const key = `${id}|${focusM.toFixed(4)}`;
    if (!shiftCache.has(key)) {
      if (shiftCache.size > 500) shiftCache.clear();
      shiftCache.set(key, focusShift(designs[id].sys, focusM * 1000));
    }
    return shiftCache.get(key);
  };

  // Camera + lens live in one mm-scaled rig at the world origin; the sensor is at z = 0.
  const camRig = new THREE.Group();
  camRig.name = 'camRig';
  camRig.scale.setScalar(MM);
  stage.scene.add(camRig);
  const body = createCameraBody(stage.envMap);
  camRig.add(body.group);
  // Direct x-ray changes win over any x-ray animation still running.
  const setXrayRaw = body.setXray;
  let xrayTween = null;
  body.setXray = (a) => {
    xrayTween?.cancel();
    xrayTween = null;
    setXrayRaw(a);
  };
  const lensRig = createLensRig({ envMap: stage.envMap, designs, focusShiftFor });
  camRig.add(lensRig.group);

  stage.registerSet('product', (v) => {
    camRig.visible = v;
  });

  // Cutaways exist for the traced primes; zoom/free lenses fall back to the 50 mm.
  const cutawayRoot = new THREE.Group();
  camRig.add(cutawayRoot);
  const cutaways = {};
  const primeId = () => (designs[store.values.lens] ? store.values.lens : 'z50');
  function getCutaway(id = primeId()) {
    if (!cutaways[id]) {
      const spec = exteriorSpec(id, { design: designs[id] });
      cutaways[id] = createLensCutaway({ envMap: stage.envMap, design: designs[id], outerR: spec.r, frontZ: FLANGE_Z - spec.length });
      cutawayRoot.add(cutaways[id].group);
    }
    for (const [k, c] of Object.entries(cutaways)) c.group.visible = k === id;
    return cutaways[id];
  }
  let cutawayOn = false;
  stage.registerSet('cutaway', (v) => {
    cutawayOn = v;
    cutawayRoot.visible = v;
    if (v) getCutaway();
    lensRig.group.visible = !v;
  });
  const stopCache = new Map();
  function stopRadius(id, N) {
    const key = `${id}|${N}`;
    if (!stopCache.has(key)) stopCache.set(key, stopRadiusFor(designs[id].sys, N));
    return stopCache.get(key);
  }
  // Current traced system: stop set for the f-number, shifted for focus (unit focusing).
  function opticsState(overrides = {}) {
    const id = primeId();
    const d = derive({ ...store.values, lens: id, ...overrides });
    const stopR = stopRadius(id, d.N);
    const delta = focusShiftFor(id, d.focusM);
    const sys = cloneSystem(withStop(designs[id].sys, stopR), -(Number.isFinite(delta) ? delta : 0));
    sys.imageZ = 0;
    return { id, sys, stopR, maxStopR: stopRadius(id, 1.8), delta, d, design: designs[id] };
  }

  const animated = new Set();
  function animate(obj, scope) {
    animated.add(obj);
    scope?.add(() => animated.delete(obj));
    return obj;
  }

  const bench = createBench({ envMap: stage.envMap });
  stage.scene.add(bench.group);
  stage.registerSet('bench', (v) => {
    bench.group.visible = v;
  });

  const diorama = createDiorama();
  stage.scene.add(diorama.group);
  const field = createFieldHelpers();
  stage.scene.add(field.group);
  stage.registerSet('field', (v) => {
    field.group.visible = v;
    diorama.labels.visible = v;
  });

  // 'aside' parks the lens beside the body (to show the sensor); 'pull' draws it straight off for a swap.
  function setDetach(t, mode = 'aside') {
    const twist = smoothstep(0, 0.35, t);
    const slide = smoothstep(0.3, 1, t);
    if (mode === 'pull') {
      lensRig.group.rotation.set(0, 0, -twist * 0.75);
      lensRig.group.position.set(0, 0, -slide * 95);
      return;
    }
    lensRig.group.rotation.set(0, -slide * 0.55, -twist * 0.75);
    lensRig.group.position.set(slide * 88, slide * 6, -slide * 64);
  }

  let swapping = false;
  // Resolves true once the new lens is mounted, false if skipped or the chapter changed meanwhile.
  async function swapLens(id) {
    if (swapping) return false;
    if (store.values.lens === id) return true;
    swapping = true;
    const chapter = ctx.chapter;
    await tweens.add({ duration: 0.75, update: (e) => setDetach(e, 'pull') }).promise;
    if (ctx.chapter !== chapter) {
      setDetach(0);
      swapping = false;
      return false;
    }
    store.set({ lens: id, ...(LENSES[id].kind === 'zoom' ? { focal: 50 } : {}) });
    await tweens.add({ duration: 0.85, update: (e) => setDetach(1 - e, 'pull') }).promise;
    setDetach(0);
    swapping = false;
    return ctx.chapter === chapter;
  }

  let pendingCapture = null;
  // Must run right after rendering, while the drawing buffer is still valid.
  function flushCapture() {
    if (!pendingCapture) return;
    pendingCapture(preview.capture());
    pendingCapture = null;
  }
  function takePhoto() {
    const shutter = document.getElementById('vf-shutter');
    shutter.classList.remove('fire');
    void shutter.offsetWidth;
    shutter.classList.add('fire');
    const b = body.shutterButton;
    const y0 = b.position.y;
    tweens.add({ duration: 0.3, update: (e, k) => (b.position.y = y0 - Math.sin(Math.PI * k) * 1.4) });
    return new Promise((resolve) => (pendingCapture = resolve));
  }

  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  const preview = createSensorPreview({ renderer: stage.renderer, scene: stage.scene, stage, diorama });
  body.setPreviewTexture(preview.texture);

  const ctx = {
    THREE,
    stage,
    tweens,
    store,
    designs,
    body,
    lensRig,
    camRig,
    bench,
    diorama,
    field,
    preview,
    setDetach,
    swapLens,
    takePhoto,
    toast,
    getCutaway,
    opticsState,
    animate,
    ensurePrime(message = 'Showing the 50 mm prime: it is easier to follow than a zoom.') {
      if (!designs[store.values.lens]) {
        store.set({ lens: 'z50' });
        toast(message);
      }
    },
    xray(target, duration = 1.2, scope = ctx.scope) {
      xrayTween?.cancel();
      const from = body.xray;
      xrayTween = scope.animate(duration, (e) => setXrayRaw(from + (target - from) * e));
      return xrayTween.promise;
    },
    focusShiftFor,
    flyTo: (view) => stage.flyTo(view),
    d: derive(store.values),
  };
  ctx.hotspots = createHotspots({ popover: document.getElementById('popover'), onNavigate: (id) => tour.goId(id) });
  const tour = createTour({ chapters, ctx });
  ctx.tour = tour;

  document.getElementById('reset-view').addEventListener('click', () => {
    const ch = ctx.chapter;
    const view = ch?.steps[ctx.stepIndex]?.view ?? ch?.view;
    if (view) stage.flyTo(view);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' && !(e.target instanceof HTMLInputElement)) document.getElementById('reset-view').click();
  });

  // Not connected to document visibility: rAF already pauses in hidden tabs and dt is clamped.
  const timer = new THREE.Timer();
  let first = true;
  stage.renderer.setAnimationLoop((time) => {
    timer.update(time);
    const rawDt = timer.getDelta();
    const dt = Math.min(rawDt, 0.05);
    try {
      frame(dt, rawDt);
    } catch (err) {
      if (!loopError) console.error(err);
      if (!loopError) window.__errors?.push(`frame: ${err.message}`);
      loopError = true;
    }
    stage.render();
    preview.blit();
    flushCapture();
    if (first) {
      first = false;
      window.__lensReady = true;
      clearTimeout(window.__lensBoot);
      setTimeout(() => document.getElementById('loader').classList.add('gone'), 150);
    }
  });

  let loopError = false;
  function frame(dt, rawDt = dt) {
    tweens.update(dt);
    const v = store.values;
    ctx.d = derive(v);
    camRig.position.z = v.cameraBack;
    lensRig.update(ctx.d);
    if (cutawayOn) {
      const id = primeId();
      const c = getCutaway(id);
      const shift = focusShiftFor(id, ctx.d.focusM);
      c.setFocusShift(Number.isFinite(shift) ? shift : 0);
      if (!c.iris.locked) c.iris.set(stopRadius(id, Math.max(v.fNumber, 1.8)), v.blades, v.rounded);
    }
    for (const o of animated) o.update(dt);
    tour.update(dt);
    stage.update(dt, rawDt);
    if (field.group.visible) field.update(ctx.d, v.cameraBack);
    preview.update(ctx.d, v);
    preview.render(ctx.d);
  }

  // Debug/testing: step the simulation without rAF (e.g. in a background tab).
  ctx.advance = (seconds = 1, fps = 30) => {
    for (let i = 0; i < Math.ceil(seconds * fps); i++) frame(1 / fps);
    stage.render();
    preview.blit();
    flushCapture();
  };

  if (new URLSearchParams(location.search).has('debug')) setupDebug(ctx);

  // Build the mounted lens before any step (deep links included) looks at it.
  lensRig.update(ctx.d);
  tour.start();
  window.lens = ctx;
}

// ?debug: FPS panel + a small GUI over the shared params (stats.js and lil-gui ship with three).
async function setupDebug(ctx) {
  const [{ default: Stats }, { GUI }] = await Promise.all([import('three/addons/libs/stats.module.js'), import('three/addons/libs/lil-gui.module.min.js')]);
  const stats = new Stats();
  stats.dom.style.cssText = 'position:fixed;left:70px;top:64px;z-index:60';
  document.body.append(stats.dom);
  ctx.animate({ update: () => stats.update() });
  const gui = new GUI({ title: 'Lens Lab debug' });
  gui.domElement.style.cssText = 'position:fixed;left:70px;top:120px;z-index:60';
  const proxy = { ...ctx.store.values };
  const bind = (key, ...args) => gui.add(proxy, key, ...args).onChange((v) => ctx.store.set({ [key]: v })).listen();
  bind('fNumber', 1.4, 22, 0.1);
  bind('focus', 0.3, 60, 0.01);
  bind('focal', 14, 400, 1);
  bind('blades', [5, 7, 9]);
  bind('rounded');
  bind('catEye');
  bind('blurMap');
  bind('cropView');
  ctx.store.subscribe(null, (_, v) => Object.assign(proxy, v));
  gui.add({ dpr: ctx.stage.renderer.getPixelRatio() }, 'dpr').listen().disable();
}

try {
  boot();
} catch (err) {
  console.error(err);
  fatal(`Something went wrong while starting the 3D view: ${err.message}`);
}
