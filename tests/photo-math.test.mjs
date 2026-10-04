import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aov,
  angleOfView,
  depthOfField,
  hyperfocal,
  blurDiameter,
  airyDiameter,
  stopsBetween,
  SENSOR,
  sweetSpot,
  shutterFor,
  nearestShutter,
} from '../src/optics/photo-math.js';

const close = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} vs ${expected}`);

test('depth of field, 85 mm f/1.8 at 2 m', () => {
  const d = depthOfField(85, 1.8, 2000);
  close(d.near, 1971.8, 0.5, 'near');
  close(d.far, 2029.0, 0.5, 'far');
  close(d.total, 57.3, 0.3, 'total');
});

test('depth of field, 50 mm f/1.8 at 2.5 m', () => {
  const d = depthOfField(50, 1.8, 2500);
  close(d.near, 2374, 1.5, 'near');
  close(d.far, 2640, 1.5, 'far');
});

test('hyperfocal, 24 mm f/8', () => {
  close(hyperfocal(24, 8), 2424, 0.01, 'H');
  const d = depthOfField(24, 8, 2424);
  close(d.near, 1212, 0.5, 'near at H = H/2');
  assert.equal(d.far, Infinity);
});

test('angle of view on 36 × 24 mm', () => {
  const full = { width: 36, height: 24 };
  const a50 = aov(50, full);
  close(a50.h, 39.6, 0.01, '50 h');
  close(a50.v, 26.99, 0.01, '50 v');
  close(a50.d, 46.79, 0.01, '50 d');
  close(aov(24, full).h, 73.74, 0.01, '24 h');
  close(aov(120, full).h, 17.06, 0.01, '120 h');
  close(aov(14, full).d, 114.18, 0.01, '14 d');
  close(angleOfView(50, SENSOR.width), 39.5, 0.02, '50 on 35.9');
});

test('blur disc of a background at infinity', () => {
  close(blurDiameter(85, 1.8, 2000, Infinity), 2.096, 0.001, 'blur');
});

test('diffraction and pixel pitch', () => {
  close(airyDiameter(8) * 1000, 10.74, 0.01, 'airy f/8');
  close(SENSOR.pitch * 1000, 5.936, 0.001, 'pitch');
});

test('exposure', () => {
  close(stopsBetween(1.8, 4), 2.3, 0.01, 'stops');
  close(shutterFor(8), (1 / 250) * (8 / 1.8) ** 2, 1e-12, 'shutter');
  assert.equal(nearestShutter(shutterFor(8)).label, '1/13');
});

test('sharpness sweet spot sits a few stops down', () => {
  const N = sweetSpot();
  assert.ok(N >= 2.8 && N <= 8, `sweet spot ${N}`);
});
