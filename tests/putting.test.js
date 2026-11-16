import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRICTION, CUP_RADIUS, CAPTURE_SPEED, slopeFraction, greenSlope, puttSpeedFor, rollPutt,
} from '../src/sim/putting.js';
import { makeHole, greenCentre, GREEN_DIFFICULTY } from '../src/sim/hole.js';
import { greenRadius } from '../src/sim/terrain.js';

const hole = (preset = 'large', id = 1) => ({ ...makeHole('straightPar4', id), greenPreset: preset });
const unit = (v) => { const m = Math.hypot(v.x, v.y); return { x: v.x / m, y: v.y / m }; };

test('every green preset has a slope, steeper where the green is harder', () => {
  const presets = Object.keys(GREEN_DIFFICULTY).sort((a, b) => GREEN_DIFFICULTY[a] - GREEN_DIFFICULTY[b]);
  const fractions = presets.map(slopeFraction);
  for (let i = 1; i < fractions.length; i++) assert.ok(fractions[i] > fractions[i - 1], presets[i]);
  // Friction must always beat the slope, or a ball would never stop.
  for (const f of fractions) assert.ok(f > 0 && f < 1);
});

test('the slope direction belongs to the plot: same id same way, rebuilt green same way', () => {
  const a = greenSlope(hole('large', 4));
  const b = greenSlope(hole('tiered', 4));
  assert.ok(Math.abs(Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)) < 1e-9);
  assert.ok(Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y));
  const c = greenSlope(hole('large', 5));
  assert.ok(Math.abs(Math.atan2(a.y, a.x) - Math.atan2(c.y, c.x)) > 1e-6);
});

test('puttSpeedFor rolls the named distance, to within the slope', () => {
  const h = hole('large');
  const cup = greenCentre(h);
  const slope = unit(greenSlope(h));
  // Across the slope, so the slope neither helps nor hinders the length.
  const across = { x: -slope.y, y: slope.x };
  const from = { x: cup.x - across.x * 9, y: cup.y - across.y * 9 };
  const roll = rollPutt(h, from, across, puttSpeedFor(6));
  const along = (roll.end.x - from.x) * across.x + (roll.end.y - from.y) * across.y;
  assert.ok(Math.abs(along - 6) < 0.15, `rolled ${along}`);
  assert.equal(roll.holed, false);
  assert.equal(roll.offGreen, false);
});

test('a putt breaks down the slope', () => {
  const h = hole('tiered');
  const cup = greenCentre(h);
  const slope = unit(greenSlope(h));
  const across = { x: -slope.y, y: slope.x };
  const from = { x: cup.x - across.x * 5 - slope.x * 3, y: cup.y - across.y * 5 - slope.y * 3 };
  const roll = rollPutt(h, from, across, puttSpeedFor(8));
  const downhill = (roll.end.x - from.x) * slope.x + (roll.end.y - from.y) * slope.y;
  assert.ok(downhill > 0.3, `broke ${downhill} yards`);
});

test('a putt on line at a sensible pace drops, and ends exactly in the cup', () => {
  const h = hole('large');
  const cup = greenCentre(h);
  const slope = unit(greenSlope(h));
  // Straight uphill: no break to allow for.
  const from = { x: cup.x + slope.x * 3, y: cup.y + slope.y * 3 };
  const roll = rollPutt(h, from, { x: -slope.x, y: -slope.y }, puttSpeedFor(3.6));
  assert.equal(roll.holed, true);
  assert.deepEqual(roll.end, cup);
  assert.deepEqual(roll.path.at(-1), cup);
});

test('the same putt hit far too hard runs over the cup', () => {
  const h = hole('large');
  const cup = greenCentre(h);
  const slope = unit(greenSlope(h));
  const from = { x: cup.x + slope.x * 3, y: cup.y + slope.y * 3 };
  const roll = rollPutt(h, from, { x: -slope.x, y: -slope.y }, puttSpeedFor(9));
  assert.equal(roll.holed, false);
  assert.ok(Math.hypot(roll.end.x - cup.x, roll.end.y - cup.y) > CUP_RADIUS);
});

test('a putt left short stays out', () => {
  const h = hole('large');
  const cup = greenCentre(h);
  const slope = unit(greenSlope(h));
  const from = { x: cup.x + slope.x * 4, y: cup.y + slope.y * 4 };
  assert.equal(rollPutt(h, from, { x: -slope.x, y: -slope.y }, puttSpeedFor(2)).holed, false);
});

test('a putt hit off the green stops just past the edge and says so', () => {
  const h = hole('small');
  const cup = greenCentre(h);
  const roll = rollPutt(h, { x: cup.x, y: cup.y - 5 }, { x: 1, y: 0 }, puttSpeedFor(30));
  assert.equal(roll.offGreen, true);
  const out = Math.hypot(roll.end.x - cup.x, roll.end.y - cup.y);
  assert.ok(out > greenRadius(h) && out < greenRadius(h) + 1, `stopped ${out} from the centre`);
});

test('the path starts at the ball, ends where the ball ends, and is deterministic', () => {
  const h = hole('tiered');
  const cup = greenCentre(h);
  const from = { x: cup.x - 6, y: cup.y - 2 };
  const a = rollPutt(h, from, { x: 1, y: 0.2 }, puttSpeedFor(5));
  const b = rollPutt(h, from, { x: 1, y: 0.2 }, puttSpeedFor(5));
  assert.deepEqual(a, b);
  assert.deepEqual(a.path[0], from);
  assert.deepEqual(a.path.at(-1), a.end);
  assert.ok(a.seconds > 0.5 && a.seconds < 5);
});

test('the constants a putt is judged by are the ones the bot was measured at', () => {
  // The table in tools/playGolfBot.js is only true at exactly these.
  assert.equal(FRICTION, 2.5);
  assert.equal(CUP_RADIUS, 0.12);
  assert.equal(CAPTURE_SPEED, 1.8);
});
