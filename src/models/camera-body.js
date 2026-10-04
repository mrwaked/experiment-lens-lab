// Generic Z5 II–proportioned body in mm: +x = photographer's right, lens along −z, sensor at z = 0, flange at z = −16.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMaterials } from './materials.js';

export const FLANGE_Z = -16;
export const SENSOR_W = 35.9;
export const SENSOR_H = 23.9;

function lathe(points, segments = 96, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(
    points.map(([r, z]) => new THREE.Vector2(r, z)),
    segments,
    phiStart,
    phiLength,
  );
  g.rotateX(Math.PI / 2);
  return g;
}

function cylinderAlongZ(r, h, segments = 48) {
  const g = new THREE.CylinderGeometry(r, r, h, segments);
  g.rotateX(Math.PI / 2);
  return g;
}

export function createCameraBody(envMap) {
  const M = createMaterials(envMap);
  const mats = {
    body: M.body(),
    leather: M.leather(),
    rubber: M.rubber(M.textures.knurl),
    chrome: M.chrome(),
    metal: M.metal(),
    satin: M.satin(),
    black: M.black(),
    gold: M.gold(),
    glassDark: M.glassDark(),
    paint: M.paint(),
    sensor: M.sensor(),
  };

  const group = new THREE.Group();
  group.name = 'cameraBody';
  const shell = new THREE.Group();
  group.add(shell);
  const add = (geom, mat, pos = [0, 0, 0], parent = shell) => {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Main shell: a beveled extrusion with a real opening for the mount throat.
  const shellShape = new THREE.Shape();
  const [x0, x1, y0, y1, rc] = [5 - 61.5, 5 + 61.5, 2 - 36.5, 2 + 36.5, 6];
  shellShape.moveTo(x0 + rc, y0);
  shellShape.lineTo(x1 - rc, y0);
  shellShape.quadraticCurveTo(x1, y0, x1, y0 + rc);
  shellShape.lineTo(x1, y1 - rc);
  shellShape.quadraticCurveTo(x1, y1, x1 - rc, y1);
  shellShape.lineTo(x0 + rc, y1);
  shellShape.quadraticCurveTo(x0, y1, x0, y1 - rc);
  shellShape.lineTo(x0, y0 + rc);
  shellShape.quadraticCurveTo(x0, y0, x0 + rc, y0);
  shellShape.holes.push(new THREE.Path().absarc(0, 0, 31, 0, Math.PI * 2, true));
  const mainGeo = new THREE.ExtrudeGeometry(shellShape, { depth: 37, bevelEnabled: true, bevelSize: 3.5, bevelThickness: 3.5, bevelSegments: 4, curveSegments: 48 });
  mainGeo.computeBoundingBox();
  mainGeo.translate(0, 0, -14 - mainGeo.boundingBox.min.z);
  const main = add(mainGeo, mats.body);

  // Grip (top-view outline extruded upwards)
  const gripShape = new THREE.Shape();
  gripShape.moveTo(38, 12);
  gripShape.bezierCurveTo(40, 30, 46, 40, 58, 42);
  gripShape.bezierCurveTo(68, 43, 72, 36, 72, 24);
  gripShape.lineTo(71, 12);
  gripShape.closePath();
  const gripGeo = new THREE.ExtrudeGeometry(gripShape, { depth: 72, bevelEnabled: true, bevelSize: 3.5, bevelThickness: 3.5, bevelSegments: 4, curveSegments: 24 });
  gripGeo.rotateX(-Math.PI / 2);
  gripGeo.translate(-1.5, -36, 0);
  add(gripGeo, mats.leather);

  // Front leatherette patch on the left
  add(new RoundedBoxGeometry(22, 62, 1.6, 2, 0.7), mats.leather, [-47, 0, -14.4]);

  // EVF hump
  const evfShape = new THREE.Shape();
  evfShape.moveTo(-31, 40);
  evfShape.lineTo(31, 40);
  evfShape.lineTo(23, 60);
  evfShape.quadraticCurveTo(0, 63.5, -23, 60);
  evfShape.closePath();
  const evfGeo = new THREE.ExtrudeGeometry(evfShape, { depth: 34, bevelEnabled: true, bevelSize: 2.2, bevelThickness: 2.2, bevelSegments: 3, curveSegments: 16 });
  evfGeo.translate(0, 0, -9);
  const evf = add(evfGeo, mats.body);
  add(new RoundedBoxGeometry(24, 2.4, 19, 1, 0.6), mats.satin, [0, 63.2, 7]);
  add(new RoundedBoxGeometry(48, 30, 11, 4, 4.5), mats.rubber, [0, 50, 31]);
  add(new THREE.PlaneGeometry(22, 16), mats.glassDark, [0, 50, 36.6]);

  // Z mount: chrome bayonet ring, black throat, gold contacts
  const mount = new THREE.Group();
  shell.add(mount);
  add(lathe([[27.5, FLANGE_Z], [33.2, FLANGE_Z], [34, FLANGE_Z + 0.8], [34, -14]]), mats.chrome, [0, 0, 0], mount);
  add(lathe([[27.5, -13], [27.5, FLANGE_Z]]), mats.chrome, [0, 0, 0], mount);
  const throat = add(lathe([[27.4, -1.2], [27.4, -13]], 64), mats.black, [0, 0, 0], mount);
  throat.material.side = THREE.DoubleSide;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const tab = add(new THREE.BoxGeometry(14, 2.4, 1.2), mats.chrome, [Math.cos(a) * 26.2, Math.sin(a) * 26.2, -13.4], mount);
    tab.rotation.z = a + Math.PI / 2;
  }
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i - 5) * 0.075;
    const c = add(new THREE.BoxGeometry(1.4, 1.1, 1.8), mats.gold, [Math.cos(a) * 25.3, Math.sin(a) * 25.3, -12], mount);
    c.rotation.z = a;
  }
  add(cylinderAlongZ(4, 3.2), mats.satin, [-37, -14, -14.8]);
  add(cylinderAlongZ(1.1, 0.6, 16), mats.paint, [-24, 23.5, -14.1]);

  // Sensor with IBIS carrier
  add(new RoundedBoxGeometry(48, 36, 2.4, 2, 0.8), mats.metal, [0, 0, 0.9]);
  const sensorGeo = new THREE.PlaneGeometry(SENSOR_W, SENSOR_H);
  sensorGeo.rotateY(Math.PI);
  const sensor = add(sensorGeo, mats.sensor, [0, 0, -0.35]);
  sensor.castShadow = false;

  // Projected (inverted) image on the sensor, driven by the preview.
  const imgGeo = new THREE.PlaneGeometry(SENSOR_W, SENSOR_H);
  const uv = imgGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  imgGeo.rotateY(Math.PI);
  const sensorImage = new THREE.Mesh(
    imgGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
  );
  sensorImage.position.set(0, 0, -0.45);
  sensorImage.visible = false;
  group.add(sensorImage);

  // Top plate controls
  add(new THREE.CylinderGeometry(13, 13, 7, 48), mats.rubber, [-42, 45.5, 8]);
  add(new THREE.CylinderGeometry(11.5, 12, 1, 48), mats.satin, [-42, 49.4, 8]);
  add(new THREE.CylinderGeometry(9, 9, 3, 40), mats.satin, [57, 40.5, -27]);
  add(new THREE.CylinderGeometry(5.2, 5.4, 3.2, 32), mats.metal, [57, 43, -27]);
  add(new THREE.BoxGeometry(6, 2.5, 5), mats.satin, [66, 40.5, -21]);
  const shutterButton = shell.children[shell.children.length - 2];
  for (const [x, z] of [[49, -6], [58, -6]]) add(new THREE.CylinderGeometry(3.4, 3.4, 1.6, 24), mats.metal, [x, 42.6, z]);
  const rearDial = add(new THREE.CylinderGeometry(10.5, 10.5, 5, 48), mats.rubber, [58, 37, 28]);
  rearDial.rotation.x = 0.35;
  add(new THREE.CylinderGeometry(8, 8, 4.5, 40), mats.rubber, [50, 27, -39]);

  // Rear: vari-angle screen, thumb rest, buttons
  add(new RoundedBoxGeometry(84, 58, 5, 3, 3), mats.body, [-8, -5, 32.5]);
  const lcd = add(new THREE.PlaneGeometry(71.5, 47.6), mats.glassDark, [-8, -5, 35.05]);
  const lcdImage = new THREE.Mesh(
    new THREE.PlaneGeometry(71.5, 47.6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  );
  lcdImage.position.set(-8, -5, 35.1);
  lcdImage.visible = false;
  group.add(lcdImage);
  add(new RoundedBoxGeometry(20, 40, 4, 2, 2), mats.rubber, [59, 12, 31]);
  for (const [x, y] of [[50, -14], [60, -14], [50, -26], [60, -26], [44, 30]]) {
    add(cylinderAlongZ(2.6, 1.6, 20), mats.metal, [x, y, 30.6]);
  }
  add(cylinderAlongZ(3, 3.5, 20), mats.satin, [52, 2, 31]);

  // Strap lugs and tripod socket
  for (const x of [-60.5, 70.5]) {
    const lug = add(new THREE.TorusGeometry(3.2, 1.1, 10, 24), mats.satin, [x, 32, 6]);
    lug.rotation.y = Math.PI / 2;
  }
  const socket = add(new THREE.TorusGeometry(4, 1, 10, 24), mats.satin, [0, -38.2, 8]);
  socket.rotation.x = Math.PI / 2;


  // X-ray: fade shell to a ghost and show crisp edges.
  const edges = new THREE.Group();
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0, depthWrite: false });
  for (const mesh of new Set([main, evf, ...shell.children.filter((m) => m.geometry?.type === 'ExtrudeGeometry')])) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), edgeMat);
    e.position.copy(mesh.position);
    e.rotation.copy(mesh.rotation);
    edges.add(e);
  }
  edges.visible = false;
  group.add(edges);

  const shellMeshes = [];
  shell.traverse((o) => o.isMesh && shellMeshes.push(o));
  const shellMats = [...new Set(shellMeshes.map((m) => m.material))].filter((m) => m && m !== mats.sensor);
  let xray = 0;
  function setXray(a) {
    xray = a;
    const ghost = a > 0.001;
    for (const m of shellMats) {
      if (m.transparent !== ghost) {
        m.transparent = ghost;
        m.needsUpdate = true;
      }
      m.opacity = 1 - a * 0.93;
      m.depthWrite = a < 0.5;
    }
    edges.visible = ghost;
    edgeMat.opacity = a * 0.55;
    for (const m of shellMeshes) m.castShadow = a < 0.5;
  }

  function setPreviewTexture(tex) {
    lcdImage.material.map = tex;
    lcdImage.material.needsUpdate = true;
    sensorImage.material.map = tex;
    sensorImage.material.needsUpdate = true;
    lcdImage.visible = !!tex;
    lcd.visible = !tex;
  }

  function setSensorImage(opacity) {
    sensorImage.visible = opacity > 0.001;
    sensorImage.material.opacity = opacity;
  }

  const anchors = {
    sensor: new THREE.Vector3(9, 6, -2),
    mount: new THREE.Vector3(-22, 22, -17),
    evf: new THREE.Vector3(0, 62, 4),
    shutter: new THREE.Vector3(57, 45, -27),
    grip: new THREE.Vector3(72, -6, -26),
    lcd: new THREE.Vector3(-8, -5, 36),
    modeDial: new THREE.Vector3(-42, 50, 8),
  };

  return {
    group,
    mats,
    sensor,
    sensorImage,
    lcdImage,
    shutterButton,
    anchors,
    setXray,
    get xray() {
      return xray;
    },
    setPreviewTexture,
    setSensorImage,
  };
}
