import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { ease, clamp, reducedMotion } from './tween.js';

export const LAYERS = { MAIN: 0, DIORAMA: 1 };
export const MM = 0.001;

export function setLayerDeep(object, layer) {
  object.traverse((o) => o.layers.set(layer));
}

const BACKDROP_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BACKDROP_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
void main() {
  float y = vDir.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.7, y));
  col = mix(col, uBottom, smoothstep(0.0, -0.35, y));
  float glow = pow(max(0.0, 1.0 - abs(y) * 2.4), 3.0) * 0.06;
  gl_FragColor = vec4(col + glow, 1.0);
  #include <colorspace_fragment>
}`;

const FLOOR_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.15, 1.0, d)) * 0.9;
  float ring = smoothstep(0.004, 0.0, abs(d - 0.62)) * 0.25 + smoothstep(0.003, 0.0, abs(d - 0.36)) * 0.15;
  gl_FragColor = vec4(uColor + ring * vec3(1.0, 0.88, 0.0) * 0.5, a);
  #include <colorspace_fragment>
}`;

export function createStage({ canvas, labelsHost }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x0a0b0d, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.005, 300);
  camera.position.set(-0.3, 0.12, -0.34);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.minDistance = 0.02;
  controls.maxDistance = 40;
  controls.target.set(0, 0, -0.03);
  controls.autoRotateSpeed = 0.45;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();

  const labels = new CSS2DRenderer({ element: labelsHost });

  // --- studio (product shots) -------------------------------------------------------------
  const studio = new THREE.Group();
  studio.name = 'studio';
  scene.add(studio);

  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(30, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERT,
      fragmentShader: BACKDROP_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x0b0c0f) },
        uHorizon: { value: new THREE.Color(0x1b1d22) },
        uBottom: { value: new THREE.Color(0x070708) },
      },
    }),
  );
  backdrop.renderOrder = -10;
  studio.add(backdrop);

  const floorY = -0.0386;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: FLOOR_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0x17191d) } },
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, floorY - 0.0003, -0.04);
  floor.renderOrder = -5;
  studio.add(floor);

  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.ShadowMaterial({ opacity: 0.55 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.set(0, floorY, -0.04);
  shadowCatcher.receiveShadow = true;
  studio.add(shadowCatcher);

  const studioLights = new THREE.Group();
  const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
  key.position.set(-0.35, 0.55, -0.35);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -0.22, right: 0.22, top: 0.22, bottom: -0.22, near: 0.1, far: 1.5 });
  const fill = new THREE.DirectionalLight(0xbcd2ff, 0.7);
  fill.position.set(0.5, 0.15, -0.3);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(0.25, 0.4, 0.6);
  const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x1a1512, 0.35);
  studioLights.add(key, key.target, fill, rim, hemi);
  scene.add(studioLights);

  // --- named sets -------------------------------------------------------------------------
  const sets = new Map();
  function registerSet(name, show) {
    sets.set(name, show);
  }
  registerSet('studio', (v) => {
    studio.visible = v;
    studioLights.visible = v;
  });
  registerSet('diorama', (v) => {
    if (v) camera.layers.enable(LAYERS.DIORAMA);
    else camera.layers.disable(LAYERS.DIORAMA);
  });
  let activeSets = [];
  function applySets(names) {
    activeSets = names;
    for (const [name, show] of sets) show(names.includes(name));
  }

  // --- camera flights ---------------------------------------------------------------------
  let flight = null;
  const up = new THREE.Vector3(0, 1, 0);
  function cancelFlight() {
    if (flight) {
      flight.resolve(false);
      flight = null;
    }
  }
  // Height (px) the viewfinder inset occupies at the bottom-left, from its final (not animating) size.
  function viewfinderBand() {
    const vf = document.getElementById('viewfinder');
    if (!vf || vf.hidden || size.w < 820) return 0;
    const w = vf.classList.contains('big') ? Math.min(size.w * 0.56, 840) : Math.min(Math.max(280, size.w * 0.27), 430);
    return w / 1.5 + 44;
  }

  // Camera pose framing `points` along `dir` inside the free area (left of the card, above the viewfinder).
  function fitView(points, dir, pad = 1.08) {
    const sphere = new THREE.Sphere().setFromPoints(points.map((p) => new THREE.Vector3().fromArray(p)));
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const top = 64;
    const band = viewfinderBand();
    const usableH = Math.max(160, size.h - top - band - 16);
    const usableW = size.w - viewShift() * 2;
    const vEff = Math.atan(Math.tan(vHalf) * (usableH / size.h));
    const hHalf = Math.atan(Math.tan(vHalf) * (usableW / size.h));
    const dist = (sphere.radius * pad) / Math.sin(Math.min(vEff, hHalf));
    const d = new THREE.Vector3().fromArray(dir).normalize();
    const right = new THREE.Vector3().crossVectors(d, up).normalize();
    const camUp = new THREE.Vector3().crossVectors(right, d).normalize();
    const offPx = size.h / 2 - (top + usableH / 2);
    const worldPerPx = (2 * dist * Math.tan(vHalf)) / size.h;
    const target = sphere.center.clone().addScaledVector(camUp, -offPx * worldPerPx);
    return { pos: target.clone().addScaledVector(d, -dist).toArray(), target: target.toArray() };
  }

  function flyTo(view) {
    const { duration = 1.6, arc = 0.12 } = view;
    const { pos, target } = view.fit ? fitView(view.fit, view.dir, view.pad) : view;
    cancelFlight();
    const to = new THREE.Vector3().fromArray(pos);
    const toT = new THREE.Vector3().fromArray(target);
    const from = camera.position.clone();
    const fromT = controls.target.clone();
    const dist = from.distanceTo(to);
    if (dist < 1e-5 && fromT.distanceTo(toT) < 1e-5) return Promise.resolve(true);
    const d = reducedMotion ? Math.min(duration, 0.35) : duration;
    return new Promise((resolve) => {
      flight = { t: 0, d, from, to, fromT, toT, lift: dist * arc, resolve };
    });
  }
  function stepFlight(dt) {
    if (!flight) return;
    flight.t += dt;
    const k = Math.min(1, flight.t / flight.d);
    const e = ease.inOutCubic(k);
    camera.position.lerpVectors(flight.from, flight.to, e).addScaledVector(up, Math.sin(Math.PI * e) * flight.lift);
    controls.target.lerpVectors(flight.fromT, flight.toT, e);
    if (k >= 1) {
      const f = flight;
      flight = null;
      f.resolve(true);
    }
  }
  controls.addEventListener('start', () => {
    cancelFlight();
    controls.autoRotate = false;
  });

  // --- size / loop helpers ----------------------------------------------------------------
  const size = { w: 1, h: 1 };
  // Shift the projection centre so the subject sits in the free area left of the tutorial card.
  function viewShift() {
    const card = document.getElementById('card');
    if (!card || size.w < 820) return 0;
    const r = card.getBoundingClientRect();
    return Math.max(0, size.w - r.left) * 0.5 - 20;
  }
  function resize() {
    size.w = window.innerWidth;
    size.h = window.innerHeight;
    renderer.setSize(size.w, size.h, false);
    const shift = viewShift();
    camera.aspect = (size.w + shift * 2) / size.h;
    if (shift > 0) camera.setViewOffset(size.w + shift * 2, size.h, shift * 2, 0, size.w, size.h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    labels.setSize(size.w, size.h);
  }
  window.addEventListener('resize', resize);
  resize();

  let frameAvg = 16;
  let slowFrames = 0;
  // rawDt is the unclamped frame time; hidden tabs and long hitches say nothing about GPU load.
  function adaptQuality(rawDt) {
    if (document.hidden || rawDt > 0.25) return;
    frameAvg = frameAvg * 0.95 + rawDt * 1000 * 0.05;
    if (frameAvg > 30 && dpr > 1) {
      if (++slowFrames > 90) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        resize();
        slowFrames = 0;
      }
    } else slowFrames = 0;
  }

  let lastNear = 0;
  let lastFar = 0;
  function update(dt, rawDt = dt) {
    stepFlight(dt);
    controls.update(dt);
    const dist = camera.position.distanceTo(controls.target);
    const near = clamp(dist * 0.01, 0.002, 0.1);
    const far = camera.layers.isEnabled(LAYERS.DIORAMA) ? 400 : 60;
    if (Math.abs(near - lastNear) > 1e-4 || far !== lastFar) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
      lastNear = near;
      lastFar = far;
    }
    adaptQuality(rawDt);
  }

  function render() {
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    envMap,
    labels,
    studio,
    studioLights,
    floorY,
    size,
    registerSet,
    applySets,
    get activeSets() {
      return activeSets;
    },
    flyTo,
    fitView,
    cancelFlight,
    update,
    render,
    resize,
  };
}
