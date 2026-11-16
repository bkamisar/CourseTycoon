import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PX_PER_YARD, frameAround, shotFrame, makePlayCamera } from '../src/render/playCamera.js';
import { computeHoleTransform } from '../src/render/holeView.js';
import { makeHole, greenCentre } from '../src/sim/hole.js';
import { greenRadius, LIE } from '../src/sim/terrain.js';
import { startHole, defaultTarget } from '../src/sim/playGolf.js';

const VIEW = { x: 0, y: 30, width: 180, height: 230 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('frameAround pads the points and never frames less than the minimum span', () => {
  const f = frameAround([{ x: 0, y: 0 }, { x: 10, y: 200 }]);
  near(f.cx, 5);
  near(f.cy, 100);
  near(f.width, 60);
  near(f.height, 250);
  const tight = frameAround([{ x: 3, y: 3 }], { pad: 2, minSpan: 40 });
  near(tight.width, 40);
  near(tight.height, 40);
});

test('toScreen and toWorld are exact inverses at every zoom', () => {
  const hole = makeHole('longPar5', 1);
  for (const frame of [
    { cx: 0, cy: 100, width: 60, height: 250 },
    { cx: -55, cy: 520, width: 40, height: 40 },
    { cx: 0, cy: 260, width: 2000, height: 2000 },
  ]) {
    const cam = makePlayCamera(hole, VIEW, frame);
    for (const p of [{ x: 0, y: 0 }, { x: -55, y: 520 }, { x: 31.5, y: 222.25 }]) {
      const back = cam.toWorld(cam.toScreen(p));
      near(back.x, p.x);
      near(back.y, p.y);
    }
  }
});

test('the frame centre lands on the centre of the view when zoomed in', () => {
  const hole = makeHole('straightPar4', 1);
  const frame = { cx: 0, cy: 300, width: 60, height: 120 };
  const cam = makePlayCamera(hole, VIEW, frame);
  assert.ok(cam.zoom > 1);
  const s = cam.toScreen({ x: 0, y: 300 });
  near(s.x, VIEW.x + VIEW.width / 2);
  near(s.y, VIEW.y + VIEW.height / 2);
});

test('a frame fits inside the view: its corners are on the canvas', () => {
  const hole = makeHole('straightPar4', 1);
  const frame = { cx: 0, cy: 300, width: 60, height: 120 };
  const cam = makePlayCamera(hole, VIEW, frame);
  const topLeft = cam.toScreen({ x: -30, y: 360 });
  const bottomRight = cam.toScreen({ x: 30, y: 240 });
  assert.ok(topLeft.x >= VIEW.x - 1e-6 && topLeft.y >= VIEW.y - 1e-6);
  assert.ok(bottomRight.x <= VIEW.x + VIEW.width + 1e-6 && bottomRight.y <= VIEW.y + VIEW.height + 1e-6);
});

test('green is up the screen: a point nearer the green has a smaller y', () => {
  const hole = makeHole('straightPar4', 1);
  const cam = makePlayCamera(hole, VIEW, { cx: 0, cy: 200, width: 80, height: 200 });
  assert.ok(cam.toScreen({ x: 0, y: 250 }).y < cam.toScreen({ x: 0, y: 150 }).y);
  assert.ok(cam.toScreen({ x: 10, y: 200 }).x > cam.toScreen({ x: 0, y: 200 }).x);
});

test('a frame bigger than the hole is exactly the editor view, not a shifted copy of it', () => {
  const hole = makeHole('straightPar4', 1);
  const cam = makePlayCamera(hole, VIEW, { cx: 500, cy: -500, width: 5000, height: 5000 });
  const base = computeHoleTransform(hole, VIEW);
  assert.equal(cam.zoom, 1);
  assert.equal(cam.tx, 0);
  assert.equal(cam.ty, 0);
  assert.deepEqual(cam.toScreen({ x: 0, y: 100 }), base.toScreen({ x: 0, y: 100 }));
});

test('the camera never zooms in past MAX_PX_PER_YARD', () => {
  const hole = makeHole('shortPar3', 1);
  const cam = makePlayCamera(hole, VIEW, { cx: 0, cy: 155, width: 2, height: 2 });
  near(cam.scale, MAX_PX_PER_YARD);
  near(cam.zoom, MAX_PX_PER_YARD / computeHoleTransform(hole, VIEW).scale);
});

test('the zoom handed to the canvas agrees with toScreen', () => {
  const hole = makeHole('doglegPar4', 1);
  const cam = makePlayCamera(hole, VIEW, { cx: 40, cy: 300, width: 90, height: 140 });
  const base = computeHoleTransform(hole, VIEW);
  const p = { x: 52, y: 300 };
  const viaCanvas = { x: cam.tx + cam.zoom * base.toScreen(p).x, y: cam.ty + cam.zoom * base.toScreen(p).y };
  near(viaCanvas.x, cam.toScreen(p).x);
  near(viaCanvas.y, cam.toScreen(p).y);
});

test('on the tee of a par 4 the frame holds the ball, the target and the cup', () => {
  const hole = makeHole('straightPar4', 1);
  const play = startHole(hole);
  const frame = shotFrame(hole, play, defaultTarget(hole, play));
  const cup = greenCentre(hole);
  assert.ok(frame.cy - frame.height / 2 <= 0 && frame.cy + frame.height / 2 >= cup.y);
});

test('on the tee of a long par 5 the cup is too far to be worth showing', () => {
  const hole = makeHole('longPar5', 1);
  const play = startHole(hole);
  const frame = shotFrame(hole, play, defaultTarget(hole, play));
  assert.ok(frame.cy + frame.height / 2 < greenCentre(hole).y);
});

test('on the green the frame is the green and a little fringe, and the green fills the view', () => {
  const hole = makeHole('shortPar3', 1);
  const cup = greenCentre(hole);
  const play = { ...startHole(hole), ball: { x: cup.x + 3, y: cup.y - 4 }, lie: LIE.GREEN, strokes: 1 };
  const frame = shotFrame(hole, play, cup);
  near(frame.cx, cup.x);
  near(frame.cy, cup.y);
  near(frame.width, (greenRadius(hole) + 4) * 2);
  const cam = makePlayCamera(hole, VIEW, frame);
  const widthPx = greenRadius(hole) * 2 * cam.scale;
  assert.ok(widthPx > 100, `the green is only ${widthPx}px across`);
});
