import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setAnimationTime, animationTime, animationFrame } from '../src/render/animClock.js';
import { rainDrops, windStreaks } from '../src/render/weatherFx.js';
import { impactParticles, IMPACT_MS } from '../src/render/playView.js';
import { SPRITES, SPRITE_CHARS, SHIRT_KEYS, shirted } from '../src/render/sprites.js';
import { PALETTE } from '../src/render/palette.js';
import { CONDITION_KEYS } from '../src/sim/weather.js';

const RECT = { x: 10, y: 20, width: 160, height: 240 };

// --- The animation clock --------------------------------------------------

test('the animation clock says what it was told, and frames step on the period', () => {
  setAnimationTime(0);
  assert.equal(animationTime(), 0);
  assert.equal(animationFrame(260, 2), 0);
  setAnimationTime(259);
  assert.equal(animationFrame(260, 2), 0);
  setAnimationTime(260);
  assert.equal(animationFrame(260, 2), 1);
  assert.equal(animationFrame(260, 2, 1), 0, 'an offset staggers the step');
  setAnimationTime(520);
  assert.equal(animationFrame(260, 2), 0);
  setAnimationTime(0);
});

// --- Weather --------------------------------------------------------------

test('every condition the simulation can produce is safe to draw', () => {
  for (const key of CONDITION_KEYS) {
    assert.ok(Array.isArray(rainDrops(key, RECT, 1234)), key);
    assert.ok(Array.isArray(windStreaks(key, RECT, 1234)), key);
  }
  assert.deepEqual(rainDrops('no-such-weather', RECT, 0), []);
});

test('a clear or fair day draws nothing', () => {
  for (const key of ['clear', 'fair']) {
    assert.equal(rainDrops(key, RECT, 500).length, 0);
    assert.equal(windStreaks(key, RECT, 500).length, 0);
  }
});

test('it rains harder as the weather worsens, and only wind on a dry windy day', () => {
  const drizzle = rainDrops('drizzle', RECT, 0).length;
  const rain = rainDrops('rain', RECT, 0).length;
  const storm = rainDrops('storm', RECT, 0).length;
  assert.ok(drizzle > 0 && rain > drizzle && storm > rain);
  assert.equal(rainDrops('blowy', RECT, 0).length, 0);
  assert.ok(windStreaks('blowy', RECT, 0).length > windStreaks('breezy', RECT, 0).length);
  assert.ok(windStreaks('storm', RECT, 0).length > 0, 'a storm blows as well as rains');
});

test('every drop and streak stays inside the rectangle it was asked for, at any time', () => {
  for (const ms of [0, 333, 5000, 123456, 9999999]) {
    for (const key of ['drizzle', 'rain', 'storm']) {
      for (const d of rainDrops(key, RECT, ms)) {
        assert.ok(d.x >= RECT.x && d.x < RECT.x + RECT.width, `${key} drop x ${d.x} at ${ms}`);
        assert.ok(d.y >= RECT.y && d.y < RECT.y + RECT.height, `${key} drop y ${d.y} at ${ms}`);
      }
    }
    for (const key of ['breezy', 'blowy', 'storm']) {
      for (const s of windStreaks(key, RECT, ms)) {
        assert.ok(s.x >= RECT.x && s.x < RECT.x + RECT.width, `${key} streak x ${s.x} at ${ms}`);
      }
    }
  }
});

test('the same instant is the same picture, and rain falls downward as time passes', () => {
  assert.deepEqual(rainDrops('rain', RECT, 777), rainDrops('rain', RECT, 777));
  const before = rainDrops('rain', RECT, 1000);
  const after = rainDrops('rain', RECT, 1016);
  let fell = 0;
  before.forEach((d, i) => { if (after[i].y > d.y) fell += 1; });
  // All but the few that wrapped from the bottom back to the top.
  assert.ok(fell >= before.length - 3, `${fell} of ${before.length} drops moved down`);
});

// --- Impacts --------------------------------------------------------------

test('an impact is a ring that widens, lifts, and is gone after IMPACT_MS', () => {
  const early = impactParticles('water', 40);
  const late = impactParticles('water', IMPACT_MS - 40);
  const mid = impactParticles('water', IMPACT_MS / 2);
  const widest = (ps) => Math.max(...ps.map((p) => Math.abs(p.dx)));
  assert.ok(early.length > 0);
  assert.ok(widest(late) > widest(early));
  const meanDy = (ps) => ps.reduce((s, p) => s + p.dy, 0) / ps.length;
  assert.ok(meanDy(mid) < meanDy(early) && meanDy(mid) < meanDy(late), 'highest in the middle (screen y is down)');
  assert.deepEqual(impactParticles('water', IMPACT_MS), []);
  assert.deepEqual(impactParticles('water', -1), []);
  assert.deepEqual(impactParticles('nothing', 100), []);
});

test('a splash is bigger than a divot', () => {
  const reach = (kind) => Math.max(...impactParticles(kind, IMPACT_MS - 1).map((p) => Math.abs(p.dx)));
  assert.ok(reach('water') > reach('turf'));
  assert.ok(impactParticles('water', 100).length > impactParticles('turf', 100).length);
});

// --- Sprites --------------------------------------------------------------

test('every sprite is rectangular and uses only colours that exist', () => {
  for (const [name, sprite] of Object.entries(SPRITES)) {
    const width = sprite[0].length;
    for (const row of sprite) {
      assert.equal(row.length, width, `${name} has a ragged row`);
      for (const ch of row) {
        // `s` is the shirt placeholder that shirted() recolours.
        if (ch === '.' || ch === 's') continue;
        assert.ok(SPRITE_CHARS[ch], `${name} uses "${ch}", which is not a sprite colour`);
        assert.ok(PALETTE[SPRITE_CHARS[ch]], `${name}: "${ch}" maps to a colour the palette lacks`);
      }
    }
  }
});

test('a shirted golfer has no placeholder left, and neighbours wear different shirts', () => {
  const a = shirted(SPRITES.miniGolferWalk1, 0);
  const b = shirted(SPRITES.miniGolferWalk1, 1);
  assert.ok(!a.join('').includes('s'));
  assert.notDeepEqual(a, b);
  assert.equal(shirted(SPRITES.miniGolferWalk1, 0), a, 'cached: the same array every frame');
  assert.deepEqual(shirted(SPRITES.miniGolferWalk1, SHIRT_KEYS.length), a, 'shirts wrap round');
  for (const key of SHIRT_KEYS) assert.ok(PALETTE[SPRITE_CHARS[key]], `shirt ${key}`);
});

test('the two walk frames and the three swing poses are the same size', () => {
  assert.equal(SPRITES.miniGolferWalk1.length, SPRITES.miniGolferWalk2.length);
  for (const pose of ['golferAddress', 'golferBackswing', 'golferFinish']) {
    assert.equal(SPRITES[pose].length, 12, pose);
    assert.equal(SPRITES[pose][0].length, 8, pose);
  }
});
