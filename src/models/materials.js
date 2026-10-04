import * as THREE from 'three';

export function canvasTexture(w, h, draw, { srgb = true, repeat = null, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function leatherTexture() {
  return canvasTexture(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, w, h);
      const r = rand(7);
      for (let i = 0; i < 5200; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 2 + r() * 4.5;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        const v = 150 + r() * 70;
        grd.addColorStop(0, `rgba(${v},${v},${v},0.9)`);
        grd.addColorStop(1, 'rgba(60,60,60,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    },
    { srgb: false, repeat: [3, 3] },
  );
}

// Vertical ribs, repeated around a lathe's circumference (u).
export function ribTexture(count = 96) {
  return canvasTexture(
    256,
    16,
    (g, w, h) => {
      for (let x = 0; x < w; x++) {
        const t = (x / w) * 4;
        const v = Math.round(128 + 110 * Math.sin(t * Math.PI * 2) ** 3);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, 0, 1, h);
      }
    },
    { srgb: false, repeat: [count / 4, 1] },
  );
}

export function knurlTexture() {
  return canvasTexture(
    128,
    128,
    (g, w, h) => {
      g.fillStyle = '#7a7a7a';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#dcdcdc';
      g.lineWidth = 3;
      for (let i = -w; i < w * 2; i += 16) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + h, h);
        g.moveTo(i + h, 0);
        g.lineTo(i, h);
        g.stroke();
      }
    },
    { srgb: false, repeat: [24, 1] },
  );
}

// Circular engraving for a lens front ring (planar UVs of a RingGeometry).
export function ringTextTexture(text, { color = '#cfcac0', accent = '#ffe100', accentText = '' } = {}) {
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#0c0c0d';
    g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.font = '500 30px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const radius = w * 0.435;
    const full = accentText ? `${text}   ${accentText}` : text;
    const chars = [...full];
    const step = 0.032;
    let angle = -Math.PI / 2 - (chars.length * step) / 2;
    chars.forEach((ch, i) => {
      g.save();
      g.rotate(angle + i * step + Math.PI / 2);
      g.fillStyle = accentText && i >= chars.length - accentText.length ? accent : color;
      g.fillText(ch, 0, -radius);
      g.restore();
    });
  });
}

export function hatchTexture() {
  return canvasTexture(
    64,
    64,
    (g, w, h) => {
      g.fillStyle = '#3a3c42';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#5c5f68';
      g.lineWidth = 3;
      for (let i = -w; i < w * 2; i += 12) {
        g.beginPath();
        g.moveTo(i, h);
        g.lineTo(i + h, 0);
        g.stroke();
      }
    },
    { repeat: [1, 1] },
  );
}

let cached = null;

export function createMaterials(envMap) {
  if (cached) return cached;
  const leather = leatherTexture();
  const ribs = ribTexture(110);
  const knurl = knurlTexture();
  const shared = (m) => {
    m.userData.shared = true;
    return m;
  };
  cached = {
    textures: { leather, ribs, knurl },
    body: () =>
      new THREE.MeshPhysicalMaterial({ color: 0x1d1e21, roughness: 0.48, metalness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.4, envMap, envMapIntensity: 0.8 }),
    leather: () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.82, bumpMap: leather, bumpScale: 2.2, envMap, envMapIntensity: 0.35 }),
    rubber: (tex = ribs) => new THREE.MeshStandardMaterial({ color: 0x131315, roughness: 0.62, bumpMap: tex, bumpScale: 4, envMap, envMapIntensity: 0.5 }),
    metal: () => new THREE.MeshStandardMaterial({ color: 0x2b2c30, metalness: 0.85, roughness: 0.32, envMap }),
    satin: () => new THREE.MeshStandardMaterial({ color: 0x46484e, metalness: 0.9, roughness: 0.28, envMap }),
    chrome: () => new THREE.MeshStandardMaterial({ color: 0xe8eaee, metalness: 1, roughness: 0.14, envMap, envMapIntensity: 1.2 }),
    gold: () => new THREE.MeshStandardMaterial({ color: 0xd7a94f, metalness: 1, roughness: 0.28, envMap }),
    black: () => new THREE.MeshStandardMaterial({ color: 0x040405, roughness: 0.96, metalness: 0 }),
    paint: () => new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 }),
    accent: () => new THREE.MeshStandardMaterial({ color: 0xffe100, roughness: 0.45, emissive: 0x2b2600 }),
    glassDark: () =>
      new THREE.MeshPhysicalMaterial({ color: 0x07090c, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMap, envMapIntensity: 1.4 }),
    frontGlass: () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x0b0e14,
        roughness: 0.02,
        metalness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        iridescence: 1,
        iridescenceIOR: 1.38,
        iridescenceThicknessRange: [260, 420],
        envMap,
        envMapIntensity: 2.2,
      }),
    sensor: () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x2c2150,
        emissive: 0x1c1238,
        roughness: 0.12,
        metalness: 0.5,
        iridescence: 1,
        iridescenceIOR: 1.9,
        iridescenceThicknessRange: [320, 900],
        envMap,
        envMapIntensity: 4,
      }),
    shared,
  };
  return cached;
}
