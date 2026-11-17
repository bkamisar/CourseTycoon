import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treeSway, cloudShadows, birds, ripples } from '../src/render/ambient.js';
import { blendFrame, followFrame } from '../src/render/playCamera.js';
import { mix, withAlpha } from '../src/render/palette.js';
import { CONDITION_KEYS } from '../src/sim/weather.js';

const RECT = { x: 0, y: 20, width: 180, height: 260 };

test('a tree never leans out of its ground: under a pixel at the top of the tallest tree', () => {
  for (const key of [...CONDITION_KEYS, null]) {
    for (let ms = 0; ms < 20000; ms += 137) {
      assert.ok(Math.abs(treeSway(key, 40, 90, ms)) * 9 < 1, `${key} at ${ms}`);
    }
  }
});

test('trees move more the windier it is, and neighbours are out of step', () => {
  const peak = (key) => Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(treeSway(key, 10, 10, i * 50))));
  assert.ok(peak('blowy') > peak('breezy') && peak('breezy') > peak('clear'));
  assert.ok(peak('storm') > peak('blowy'));
  assert.notEqual(treeSway('breezy', 10, 10, 1000), treeSway('breezy', 30, 10, 1000));
});

test('cloud shadows drift with the wind and come round again, the same at the same instant', () => {
  assert.deepEqual(cloudShadows(RECT, 5000, 'fair'), cloudShadows(RECT, 5000, 'fair'));
  const a = cloudShadows(RECT, 1000, 'fair');
  const b = cloudShadows(RECT, 1100, 'fair');
  assert.ok(b.every((c, i) => c.x > a[i].x || c.x < a[i].x - RECT.width / 2), 'moved right, or wrapped');
  const moved = (key) => cloudShadows(RECT, 2000, key)[0].x - cloudShadows(RECT, 1000, key)[0].x;
  assert.ok(moved('blowy') > moved('fair'));
  for (const c of cloudShadows(RECT, 123456, 'breezy')) {
    assert.ok(c.x >= RECT.x - c.rx && c.x <= RECT.x + RECT.width + c.rx);
  }
});

test('birds come over now and then, not all the time', () => {
  let seen = 0;
  let frames = 0;
  for (let ms = 0; ms < 260000; ms += 500) {
    frames += 1;
    if (birds(RECT, ms).length) seen += 1;
  }
  assert.ok(seen > 0 && seen < frames / 2, `${seen} of ${frames}`);
});

test('rain rings the ponds, harder in a storm, and a dry day leaves them still', () => {
  assert.equal(ripples('clear', 20, 1000).length, 0);
  assert.equal(ripples('breezy', 20, 1000).length, 0);
  assert.ok(ripples('storm', 20, 1000).length > ripples('drizzle', 20, 1000).length);
  for (const ring of ripples('rain', 20, 4321)) {
    assert.ok(Math.hypot(ring.dx, ring.dy) <= 20 * 0.8 + 1e-9);
    assert.ok(ring.alpha >= 0 && ring.alpha <= 0.7);
  }
});

test('the camera blends frames: ends exact, and zooms by ratio', () => {
  const a = { cx: 0, cy: 0, width: 40, height: 40 };
  const b = { cx: 100, cy: 50, width: 160, height: 160 };
  assert.deepEqual(blendFrame(a, b, 0), a);
  assert.deepEqual(blendFrame(a, b, 1), b);
  const mid = blendFrame(a, b, 0.5);
  assert.equal(mid.cx, 50);
  assert.equal(mid.width, 80, 'halfway between 40 and 160 by ratio is 80');
  const f = followFrame({ x: 0, y: 0 }, { x: 0, y: 200 });
  assert.ok(f.cy === 100 && f.height >= 200);
});

test('palette helpers mix and fade colours that are in the palette', () => {
  assert.equal(mix('OUTLINE', 'OUTLINE', 0.5), '#14141A');
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
  assert.equal(mix('#000000', '#FFFFFF', 2), '#FFFFFF', 'clamped');
  assert.equal(withAlpha('WHITE', 0.5), 'rgba(245,245,240,0.5)');
});
