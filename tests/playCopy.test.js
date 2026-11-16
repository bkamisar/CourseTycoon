import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerLines, caddieLine, strokeLine, finishLine, roundLine, meterHint } from '../src/ui/playCopy.js';
import { makeHole, greenCentre } from '../src/sim/hole.js';
import { LIE } from '../src/sim/terrain.js';
import { startHole, planShot, MAX_STROKES } from '../src/sim/playGolf.js';

const hole = makeHole('straightPar4', 4);                 // tee (0,0), cup (0,390)
const cup = greenCentre(hole);
const play = (over = {}) => ({ ...startHole(hole), ...over });
const out = (over = {}) => ({ kind: 'swing', from: { x: 0, y: 0 }, to: { x: 0, y: 238 }, lie: LIE.FAIRWAY, penalty: null, holed: false, ...over });

test('the header names the hole, the stroke about to be played, and how far is left', () => {
  const h = headerLines({ hole, par: 4, lengthYards: 390.4, play: play(), best: null, weatherShort: 'Fair', round: '' });
  assert.equal(h.title, 'Hole 4 · Par 4 · 390y');
  assert.equal(h.status, 'Stroke 1 · 390y · Tee');
  assert.equal(h.right, '');
  assert.equal(h.weather, 'Fair');
});

test('the header shows the best score and the round when there is one', () => {
  const h = headerLines({ hole, par: 4, lengthYards: 390, play: play(), best: 3, weatherShort: 'Breezy', round: 'Round: +1 thru 2' });
  assert.equal(h.right, 'Best 3 · Round: +1 thru 2');
});

test('on the green the distance is in feet', () => {
  const onGreen = play({ ball: { x: cup.x, y: cup.y - 5 }, lie: LIE.GREEN, strokes: 2 });
  const h = headerLines({ hole, par: 4, lengthYards: 390, play: onGreen, best: null, weatherShort: 'Fair', round: '' });
  assert.equal(h.status, 'Stroke 3 · 15 ft · Green');
});

test('the caddie names the club and the distance', () => {
  const p = play();
  assert.equal(caddieLine(planShot(hole, p, { x: 0, y: 250 })), 'Driver · 250y');
  const onGreen = play({ ball: { x: cup.x, y: cup.y - 5 }, lie: LIE.GREEN });
  assert.equal(caddieLine(planShot(hole, onGreen, cup)), 'Putter · 15 ft');
});

test('a result line says where the ball is and how far is left', () => {
  const after = play({ ball: { x: 0, y: 238 }, lie: LIE.FAIRWAY, strokes: 1 });
  assert.equal(strokeLine(hole, out(), after, { perfect: false }), 'Fairway. 152y to the pin.');
  assert.equal(strokeLine(hole, out({ lie: LIE.SAND }), { ...after, lie: LIE.SAND }, { perfect: false }), 'In the bunker. 152y to the pin.');
  assert.equal(strokeLine(hole, out({ lie: LIE.ROUGH }), { ...after, lie: LIE.ROUGH }, { perfect: false }), 'In the rough. 152y to the pin.');
  assert.equal(strokeLine(hole, out({ lie: LIE.TREES }), { ...after, lie: LIE.TREES }, { perfect: false }), 'In the trees. 152y to the pin.');
});

test('a perfect strike is called one, but only when it did some good', () => {
  const after = play({ ball: { x: 0, y: 238 }, lie: LIE.FAIRWAY, strokes: 1 });
  assert.equal(strokeLine(hole, out(), after, { perfect: true }), 'Perfect strike. Fairway. 152y to the pin.');
  const wet = strokeLine(hole, out({ lie: LIE.WATER, penalty: 'water' }), play({ strokes: 2 }), { perfect: true });
  assert.equal(wet, 'In the water. One-stroke penalty — play it again.');
});

test('penalties say what they cost', () => {
  assert.equal(strokeLine(hole, out({ lie: LIE.TREES, penalty: 'lost' }), play({ strokes: 2 }), { perfect: false }),
    'Lost in the woods. One-stroke penalty — play it again.');
});

test('reaching the green and missing a putt are both given in feet', () => {
  const after = play({ ball: { x: cup.x, y: cup.y - 6 }, lie: LIE.GREEN, strokes: 2 });
  assert.equal(strokeLine(hole, out({ lie: LIE.GREEN }), after, { perfect: false }), 'On the green, 18 feet.');
  const missed = play({ ball: { x: cup.x, y: cup.y - 0.2 }, lie: LIE.GREEN, strokes: 3 });
  assert.equal(strokeLine(hole, out({ kind: 'putt', lie: LIE.GREEN }), missed, { perfect: false }), '1 foot left.');
  const longer = play({ ball: { x: cup.x, y: cup.y - 2 }, lie: LIE.GREEN, strokes: 3 });
  assert.equal(strokeLine(hole, out({ kind: 'putt', lie: LIE.GREEN }), longer, { perfect: true }), '6 feet left.');
});

test('the finish line names the score, and a new best', () => {
  assert.equal(finishLine(play({ strokes: 3, holed: true }), 4, true), 'Birdie — 3 on a par 4. New best.');
  assert.equal(finishLine(play({ strokes: 5, holed: true }), 4, false), 'Bogey — 5 on a par 4.');
  assert.equal(finishLine(play({ strokes: 1, holed: true }), 3, true), 'Hole in one — 1 on a par 3. New best.');
  assert.equal(finishLine(play({ strokes: MAX_STROKES, pickedUp: true }), 4, false), `Picked up after ${MAX_STROKES}. It happens.`);
});

test('the round line adds up against par', () => {
  assert.equal(roundLine([]), '');
  assert.equal(roundLine([{ strokes: 4, par: 4 }]), 'Round: E thru 1');
  assert.equal(roundLine([{ strokes: 5, par: 4 }, { strokes: 2, par: 3 }, { strokes: 6, par: 5 }]), 'Round: +1 thru 3');
  assert.equal(roundLine([{ strokes: 3, par: 4 }, { strokes: 2, par: 3 }]), 'Round: -2 thru 2');
});

test('the meter hint follows the swing', () => {
  assert.equal(meterHint('rising'), 'Tap at the mark');
  assert.equal(meterHint('falling'), 'Tap on the line');
  assert.equal(meterHint('done'), '');
});
