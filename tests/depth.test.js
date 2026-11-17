import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightAt, DAYLIGHT, castShadowPixels } from '../src/render/light.js';
import { plantForest, exposedTrunks } from '../src/render/forest.js';
import { computeHoleTransform } from '../src/render/holeView.js';
import { SPRITES } from '../src/render/sprites.js';
import { PALETTE } from '../src/render/palette.js';
import { lieAt, LIE } from '../src/sim/terrain.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { CONDITION_KEYS } from '../src/sim/weather.js';

// --- The light ------------------------------------------------------------

const DAY = { start: 420, end: 1080 };
const at = (fraction, extra = {}) => lightAt({
  minute: DAY.start + (DAY.end - DAY.start) * fraction, dayEnd: DAY.end, ...extra,
});
const reach = (light) => Math.hypot(light.dx, light.dy);

test('shadows are shortest in the middle of the day and long at both ends', () => {
  assert.ok(reach(at(0)) > reach(at(0.25)));
  assert.ok(reach(at(0.25)) > reach(at(0.5)));
  assert.ok(reach(at(0.75)) > reach(at(0.5)));
  assert.ok(reach(at(1)) > reach(at(0.75)));
  assert.ok(reach(at(0.5)) > 0, 'even at noon a tree stands on a shadow');
  assert.ok(reach(at(1)) >= reach(at(0.5)) * 2.5, 'the evening shadow is a long one');
});

test('a shadow never falls toward the light, at any minute of the day', () => {
  for (let f = 0; f <= 1.0001; f += 0.02) {
    const light = at(f);
    assert.ok(light.dx > 0 && light.dy > 0, `at ${f.toFixed(2)}: ${light.dx}, ${light.dy}`);
  }
});

test('the sun swings: thrown across first thing, down the screen by the close', () => {
  assert.ok(at(0).dx > at(0).dy);
  assert.ok(at(1).dy > at(1).dx);
});

test('the light is cool early, plain through the middle, and gold late', () => {
  assert.equal(at(0).tint, 'LIGHT_DAWN');
  assert.equal(at(0.5).tint, null);
  assert.equal(at(0.5).strength, 0);
  assert.equal(at(1).tint, 'LIGHT_DUSK');
  assert.ok(at(0.02).strength > at(0.15).strength, 'the morning cool fades');
  assert.ok(at(1).strength > at(0.8).strength, 'the gold deepens');
  for (let f = 0; f <= 1.0001; f += 0.05) {
    const light = at(f);
    assert.ok(light.strength >= 0 && light.strength <= 1);
    if (light.tint) assert.ok(PALETTE[light.tint], light.tint);
  }
});

test('the day ends when the day ends, however long it ran', () => {
  const long = lightAt({ minute: 1200, dayEnd: 1200 });
  assert.deepEqual(long, at(1));
  assert.deepEqual(lightAt({ minute: 5000, dayEnd: 1080 }), at(1), 'clamped past the end');
  assert.deepEqual(lightAt({ minute: 0, dayEnd: 1080 }), at(0), 'and before the start');
});

test('under rain cloud there are no shadows and the light is grey, heavier as it worsens', () => {
  const wet = ['drizzle', 'rain', 'storm'].map((weatherKey) => at(0.5, { weatherKey }));
  for (const light of wet) {
    assert.equal(light.dx, 0);
    assert.equal(light.dy, 0);
    assert.equal(light.tint, 'LIGHT_OVERCAST');
  }
  assert.ok(wet[0].strength < wet[1].strength && wet[1].strength < wet[2].strength);
  assert.deepEqual(castShadowPixels(10, 10, 8, 2, wet[1]), []);
});

test('every condition the simulation can produce has a light, and a dry one keeps the sun', () => {
  for (const weatherKey of CONDITION_KEYS) {
    const light = at(0.5, { weatherKey });
    assert.ok(Number.isFinite(light.dx) && Number.isFinite(light.dy), weatherKey);
  }
  for (const weatherKey of ['clear', 'fair', 'breezy', 'blowy']) {
    assert.deepEqual(at(0.5, { weatherKey }), at(0.5), weatherKey);
  }
});

test('a screen with no clock gets plain daylight', () => {
  assert.equal(lightAt(), DAYLIGHT);
  assert.equal(lightAt({ weatherKey: 'fair' }), DAYLIGHT);
  assert.equal(DAYLIGHT.tint, null);
  assert.ok(DAYLIGHT.dx > 0 && DAYLIGHT.dy > 0);
});

test('a cast shadow starts beside the foot, reaches where the top lands, and lists no pixel twice', () => {
  const light = { dx: 0.5, dy: 0.25 };
  const pixels = castShadowPixels(20, 30, 8, 2, light);
  assert.ok(pixels.length > 0);
  assert.equal(new Set(pixels.map((p) => `${p.x},${p.y}`)).size, pixels.length);
  assert.ok(pixels.every((p) => p.x >= 20 && p.y >= 30), 'never back toward the light');
  assert.ok(pixels.some((p) => p.x === 20 + 4 && p.y === 30 + 2), 'the top of an 8px thing lands 4 across, 2 down');
  assert.ok(castShadowPixels(20, 30, 16, 2, light).length > pixels.length, 'taller casts longer');
});

// --- The forest -----------------------------------------------------------

const EDITOR_RECT = { x: 0, y: 24, width: 180, height: 250 };
const MAP_CELL = { x: 4, y: 30, width: 54, height: 78 };

function plotFor(hole, rect, unbounded) {
  return { hole, rect, t: computeHoleTransform(hole, rect), unbounded };
}

/** Every painted pixel of a tree, on the canvas. */
function pixelsOf(tree) {
  const sprite = SPRITES[tree.name];
  const pixels = [];
  sprite.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch !== '.') pixels.push({ x: tree.left + dx, y: tree.top + dy });
    });
  });
  return pixels;
}

function assertOnlyOnTrees(trees, plot, label) {
  const { rect, t, hole } = plot;
  for (const tree of trees) {
    for (const p of pixelsOf(tree)) {
      if (!plot.unbounded && (p.x < rect.x || p.x >= rect.x + rect.width
        || p.y < rect.y || p.y >= rect.y + rect.height)) continue;
      const lie = lieAt(hole, t.toWorld({ x: p.x + 0.5, y: p.y + 0.5 }));
      assert.equal(lie, LIE.TREES, `${label}: a ${tree.name} at ${tree.x},${tree.y} puts a pixel on ${lie}`);
    }
  }
}

test('THE RULE: no pixel of any tree is drawn on ground the simulation does not call trees', () => {
  TEMPLATE_NAMES.forEach((name, i) => {
    const hole = makeHole(name, i + 1);
    for (const [rect, where] of [[EDITOR_RECT, 'editor'], [MAP_CELL, 'map cell']]) {
      const plot = plotFor(hole, rect, true);
      const trees = plantForest({ area: rect, plots: [plot] });
      assert.ok(trees.length > 10, `${name} ${where}: only ${trees.length} trees`);
      assertOnlyOnTrees(trees, plot, `${name} ${where}`);
    }
  });
});

test('the rule holds for a hole the player has rearranged, hazards and all', () => {
  const hole = makeHole('doglegPar4', 3);
  hole.corridorWidth += 14;
  hole.features.push(
    { type: 'pond', x: hole.corridor[1].x + 60, y: hole.corridor[1].y, size: 26 },
    { type: 'bunker', x: hole.corridor[0].x - 70, y: hole.corridor[0].y + 60, size: 15 },
    { type: 'trees', x: hole.corridor[0].x + 4, y: hole.corridor[0].y + 90, size: 20 },
  );
  const plot = plotFor(hole, EDITOR_RECT, true);
  assertOnlyOnTrees(plantForest({ area: EDITOR_RECT, plots: [plot] }), plot, 'rearranged');
});

test('a clump of trees out on the fairway gets a tree standing in it', () => {
  const hole = makeHole('straightPar4', 2);
  const mid = { x: hole.corridor[0].x, y: (hole.corridor[0].y + hole.corridor[hole.corridor.length - 1].y) / 2 };
  assert.equal(lieAt(hole, mid), LIE.FAIRWAY, 'the test wants bare fairway to start with');
  const before = plantForest({ area: EDITOR_RECT, plots: [plotFor(hole, EDITOR_RECT, true)] });
  const clump = { type: 'trees', x: mid.x, y: mid.y, size: 16 };
  hole.features.push(clump);
  const plot = plotFor(hole, EDITOR_RECT, true);
  const after = plantForest({ area: EDITOR_RECT, plots: [plot] });
  const inClump = after.filter((tree) => {
    const w = plot.t.toWorld({ x: tree.x + 0.5, y: tree.y + 0.5 });
    return Math.hypot(w.x - clump.x, w.y - clump.y) <= clump.size;
  });
  assert.ok(inClump.length >= 1, 'nothing is standing in the clump');
  assert.ok(after.length > before.length);
  assertOnlyOnTrees(after, plot, 'clump');
});

test('the forest is the same forest every time, back row first', () => {
  const hole = makeHole('waterPar3', 4);
  const spec = () => ({ area: EDITOR_RECT, plots: [plotFor(hole, EDITOR_RECT, true)] });
  const a = plantForest(spec());
  assert.deepEqual(a, plantForest(spec()));
  for (let i = 1; i < a.length; i++) assert.ok(a[i].y >= a[i - 1].y, 'sorted so nearer trees overlap farther ones');
});

test('where a full tree would overhang the rough, a smaller one is planted instead', () => {
  const hole = makeHole('straightPar4', 2);
  const trees = plantForest({ area: EDITOR_RECT, plots: [plotFor(hole, EDITOR_RECT, true)] });
  const names = new Set(trees.map((t) => t.name));
  assert.ok(names.has('treeRound') && names.has('treePine'), 'both kinds of full tree');
  assert.ok(names.has('treeRoundSmall') || names.has('treeSapling'), 'and fill-ins at the edge');
});

test('on the map, one forest covers the gaps and the unbuilt plots and keeps off every hole', () => {
  const area = { x: 0, y: 26, width: 180, height: 170 };
  const left = { x: 4, y: 30, width: 54, height: 78 };
  const right = { x: 62, y: 30, width: 54, height: 78 };
  const unbuilt = { x: 120, y: 30, width: 54, height: 78 };
  const plots = [
    plotFor(makeHole('shortPar3', 1), left, false),
    plotFor(makeHole('longPar5', 2), right, false),
  ];
  const trees = plantForest({ area, plots });
  for (const plot of plots) assertOnlyOnTrees(trees, plot, 'map');

  const inside = (tree, r) => tree.x >= r.x && tree.x < r.x + r.width && tree.y >= r.y && tree.y < r.y + r.height;
  assert.ok(trees.some((tree) => tree.x >= 58 && tree.x < 62 && tree.y > 30 && tree.y < 108), 'trees in the gap between plots');
  const onUnbuilt = trees.filter((tree) => inside(tree, unbuilt)).length;
  const onBuilt = trees.filter((tree) => inside(tree, left)).length;
  assert.ok(onUnbuilt > onBuilt, 'an unbuilt plot is solid woods');
  assert.ok(trees.some((tree) => tree.left < left.x + left.width && tree.left + SPRITES[tree.name][0].length > left.x + left.width),
    'a tree straddles a plot edge: it is one tree, checked against the plot it leans into');
});

test('a trunk shows only where there is open floor in front of it', () => {
  const area = { x: 0, y: 0, width: 40, height: 40 };
  const tree = (x, y) => ({ x, y, name: 'treeRound', left: x - 3, top: y - 7 });
  assert.deepEqual(exposedTrunks([tree(20, 20)], area), [true], 'a tree on its own');
  // A second tree standing just in front: its crown is over the first one's foot.
  assert.deepEqual(exposedTrunks([tree(20, 20), tree(20, 25)], area), [false, true]);
  // Two rows that leave a one-pixel chink at the back tree's foot: not a clearing.
  assert.deepEqual(exposedTrunks([tree(20, 20), tree(16, 26), tree(24, 26)], area)[0], false);
  assert.deepEqual(exposedTrunks([tree(20, 39)], area), [false], 'no floor to be seen below the edge of the picture');
});

test('in a planted wood most trunks are hidden, and the ones that show are along its front', () => {
  const hole = makeHole('straightPar4', 2);
  const plot = plotFor(hole, EDITOR_RECT, true);
  const trees = plantForest({ area: EDITOR_RECT, plots: [plot] });
  const shows = exposedTrunks(trees, EDITOR_RECT);
  const count = shows.filter(Boolean).length;
  assert.ok(count > 0, 'no trunks at all');
  assert.ok(count < trees.length * 0.25, `${count} of ${trees.length} trunks showing reads as static`);
});

test('a plot with no hole on it does not stop the forest being planted', () => {
  const area = { x: 0, y: 0, width: 60, height: 60 };
  const trees = plantForest({ area, plots: [{ hole: { corridor: [], features: [] }, rect: area, t: null }] });
  assert.ok(trees.length > 50);
});
