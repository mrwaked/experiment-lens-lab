import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { LAYERS } from '../core/stage.js';
import { clamp } from '../core/tween.js';
import { interaction } from '../ui/controls.js';
import { SENSOR, airyDiameter, aberrationBlur, formatDistance } from '../optics/photo-math.js';
import { QUAD_VERT, COC_FRAG, BOKEH_FRAG, FINAL_FRAG } from './shaders.js';

const W = 720;
const H = 480;
const MAX_BLUR = 34;

function target(depth = false) {
  const rt = new THREE.WebGLRenderTarget(W, H, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: depth,
  });
  if (depth) rt.depthTexture = new THREE.DepthTexture(W, H);
  return rt;
}

function quad(fragmentShader, uniforms) {
  return new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false }));
}

// Simulated photo: the diorama seen from the entrance pupil with physical blur, shaped bokeh and lens character.
export function createSensorPreview({ renderer, scene, stage, diorama }) {
  const camera = new THREE.PerspectiveCamera(27, W / H, 0.05, 400);
  camera.layers.set(LAYERS.DIORAMA);
  scene.add(camera);

  const rtScene = target(true);
  const rtCoc = target();
  const rtBlur = target();
  const rtFinal = target();

  const cocPass = quad(COC_FRAG, {
    tColor: { value: rtScene.texture },
    tDepth: { value: rtScene.depthTexture },
    cameraNear: { value: camera.near },
    cameraFar: { value: camera.far },
    uK: { value: 0 },
    uInvS: { value: 0 },
    uMaxBlur: { value: MAX_BLUR },
  });
  const bokehPass = quad(BOKEH_FRAG, {
    tCoc: { value: rtCoc.texture },
    uTexel: { value: new THREE.Vector2(1 / W, 1 / H) },
    uMaxBlur: { value: MAX_BLUR },
    uRadScale: { value: 0.8 },
    uBlades: { value: 9 },
    uRot: { value: 0.3 },
    uRound: { value: 1 },
    uCatEye: { value: 0 },
    uAspect: { value: W / H },
    uBase: { value: 0 },
  });
  const finalPass = quad(FINAL_FRAG, {
    tBlur: { value: rtBlur.texture },
    tCoc: { value: rtCoc.texture },
    uExposure: { value: 1 },
    uVignette: { value: 0 },
    uDistortion: { value: 0 },
    uCA: { value: 0.0006 },
    uGhost: { value: 0 },
    uGlare: { value: 0 },
    uAspect: { value: W / H },
    uBlurMap: { value: 0 },
    uBlurSharp: { value: 0.3 },
  });
  const blitPass = new FullScreenQuad(new THREE.MeshBasicMaterial({ map: rtFinal.texture, toneMapped: false, depthTest: false, depthWrite: false }));

  const frameEl = document.getElementById('vf-frame');
  const figure = document.getElementById('viewfinder');
  const top = document.getElementById('vf-top');
  const bottom = document.getElementById('vf-bottom');
  const caption = document.getElementById('vf-caption');
  const af = document.getElementById('vf-af');
  const badge = document.getElementById('vf-badge');
  document.getElementById('vf-size').addEventListener('click', () => {
    figure.classList.toggle('big');
    dirty = true;
  });

  let visible = false;
  let dirty = true;
  let lastSig = '';
  let settleFrames = 0;
  const overrides = {};
  const tmp = new THREE.Vector3();

  function uniformsFrom(d, v) {
    const crop = !!v.cropView;
    const pxPerMm = crop ? 1 / SENSOR.pitch : W / SENSOR.width;
    const f = d.focal;
    const N = d.N;
    const s = d.sMm;
    const sFactor = Number.isFinite(s) ? s / (s - f) : 1;
    let k = d.pinhole ? 0 : ((f * f) / N) * sFactor * 0.5 * pxPerMm / 1000;
    const invS = Number.isFinite(s) ? 1000 / s : 0;
    let base = 0;
    if (d.pinhole) {
      const hole = Math.sqrt(2.44 * 0.00055 * f);
      base = 0.5 * Math.hypot(hole, airyDiameter(N)) * pxPerMm;
    } else if (crop) {
      base = 0.5 * Math.hypot(aberrationBlur(N), airyDiameter(N)) * pxPerMm;
    }
    k *= overrides.blurScale ?? 1;
    const stopsDown = Math.max(0, Math.log2(N / d.lens.maxN));
    const rounded = !!v.rounded;
    const roundT = clamp((stopsDown * 2) / (rounded ? 3.5 : 1), 0, 1);
    const roundness = 1 - roundT * (rounded ? 0.8 : 1);
    const catEye = v.catEye ? 0.95 * clamp(1 - stopsDown / 1.6, 0, 1) : 0;
    const vignette = v.vignetting ? 0.5 * clamp(1 - stopsDown / 2.2, 0.12, 1) : 0;
    let distortion = 0;
    if (v.distortion) distortion = f < 40 ? 0.1 * clamp((40 - f) / 16, 0, 1) : f > 70 ? -0.06 * clamp((f - 70) / 50, 0, 1) : 0;
    const ghost = { none: 0.12, single: 0.04, multi: 0.007 }[v.coating];
    const glare = { none: 0.018, single: 0.006, multi: 0.0 }[v.coating];
    return {
      k,
      invS,
      base,
      blades: v.blades,
      roundness,
      catEye,
      vignette,
      distortion,
      ghost,
      glare,
      exposure: 2 ** d.exposureStops * (overrides.exposure ?? 1),
      blurMap: v.blurMap ? 1 : 0,
      crop,
    };
  }

  function placeCamera(d, v, crop) {
    const back = v.cameraBack ?? 0;
    camera.position.set(0, 0, back - d.pupilM);
    const halfW = crop ? (W * SENSOR.pitch) / 2 : SENSOR.width / 2;
    camera.fov = (2 * Math.atan(halfW / (W / H) / d.focal) * 180) / Math.PI;
    camera.updateProjectionMatrix();
    if (crop) camera.lookAt(diorama.chartCenter);
    else camera.lookAt(0, 0, back - 100);
  }

  function update(d, v) {
    const u = uniformsFrom(d, v);
    const sig = JSON.stringify([u, d.focal, d.pupilM, v.cameraBack, figure.classList.contains('big'), overrides]);
    if (sig !== lastSig) {
      lastSig = sig;
      dirty = true;
      settleFrames = 2;
      placeCamera(d, v, u.crop);
      const cu = cocPass.material.uniforms;
      cu.uK.value = u.k;
      cu.uInvS.value = u.invS;
      const bu = bokehPass.material.uniforms;
      bu.uBlades.value = u.blades;
      bu.uRound.value = u.roundness;
      bu.uCatEye.value = u.catEye;
      bu.uBase.value = u.base;
      bu.uRot.value = u.blades === 9 ? 0.35 : u.blades === 7 ? Math.PI / 2 : -Math.PI / 2;
      const fu = finalPass.material.uniforms;
      fu.uExposure.value = u.exposure;
      fu.uVignette.value = u.vignette;
      fu.uDistortion.value = u.distortion;
      fu.uGhost.value = u.ghost;
      fu.uGlare.value = u.glare;
      fu.uBlurMap.value = u.blurMap;
      fu.uBlurSharp.value = 0.5 * 0.03 * (u.crop ? 1 / SENSOR.pitch : W / SENSOR.width);
      updateHud(d, v, u);
    }
    if (interaction.active && performance.now() > interaction.until) {
      interaction.active = false;
      dirty = true;
    }
  }

  function updateHud(d, v, u) {
    const fl = `${Math.round(d.focal)} mm`;
    top.innerHTML = `<span>${fl}</span><span>${d.pinhole ? 'pinhole f/180' : d.fLabel}</span><span>${d.shutter.label}</span><span>ISO ${d.iso}</span>`;
    const focus = Number.isFinite(d.focusM) ? formatDistance(d.focusM * 1000) : '∞';
    const far = Number.isFinite(d.dof.farM) ? formatDistance(d.dof.farM * 1000) : '∞';
    bottom.innerHTML = d.pinhole
      ? '<span>no focus: everything equally soft</span>'
      : `<span>focus <b>${focus}</b></span><span>sharp ${formatDistance(d.dof.nearM * 1000)} – ${far}</span>`;
    caption.textContent = `${d.lens.kind === 'free' ? '' : `${d.lens.short} · `}${fl} · ${d.pinhole ? 'f/180' : d.fLabel}`;
    badge.textContent = u.crop ? '100% crop · test chart' : d.pinhole ? 'Pinhole' : u.blurMap ? 'Blur map' : '';
    badge.classList.toggle('on', !!badge.textContent);
  }

  function updateAf(d) {
    if (!visible) return;
    tmp.copy(diorama.afTarget).project(camera);
    const inside = Math.abs(tmp.x) < 0.95 && Math.abs(tmp.y) < 0.9 && tmp.z < 1 && !d.pinhole && !lastSig.includes('"crop":true');
    af.classList.toggle('on', inside);
    if (inside) {
      af.style.left = `${(tmp.x * 0.5 + 0.5) * 100}%`;
      af.style.top = `${(0.5 - tmp.y * 0.5) * 100}%`;
    }
  }

  function render(d) {
    if (settleFrames > 0) {
      settleFrames--;
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(rtCoc);
    cocPass.render(renderer);
    bokehPass.material.uniforms.uRadScale.value = interaction.active ? 1.6 : 0.75;
    renderer.setRenderTarget(rtBlur);
    bokehPass.render(renderer);
    renderer.setRenderTarget(rtFinal);
    finalPass.render(renderer);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    updateAf(d);
  }

  function blit() {
    if (!visible) return;
    const r = frameEl.getBoundingClientRect();
    if (r.width < 2) return;
    const y = stage.size.h - r.bottom;
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.setScissor(r.left, y, r.width, r.height);
    renderer.setScissorTest(true);
    blitPass.render(renderer);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, stage.size.w, stage.size.h);
  }

  return {
    camera,
    texture: rtFinal.texture,
    update,
    render,
    blit,
    markDirty() {
      dirty = true;
    },
    setVisible(v) {
      visible = v;
      figure.hidden = !v;
      dirty = true;
    },
    get visible() {
      return visible;
    },
    setOverrides(o) {
      Object.assign(overrides, o);
      for (const k of Object.keys(o)) if (o[k] == null) delete overrides[k];
    },
    capture() {
      const canvas = document.createElement('canvas');
      const r = frameEl.getBoundingClientRect();
      const dpr = renderer.getPixelRatio();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.getContext('2d').drawImage(renderer.domElement, r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr, 0, 0, canvas.width, canvas.height);
      return canvas;
    },
  };
}
