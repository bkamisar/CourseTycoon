/**
 * Draws one frame of the play screen.
 *
 * The hole itself is `drawHole` — the same function the editor and the
 * resort map use — under the play camera's zoom. This file never paints
 * terrain of its own, so what the player sees under the ball is by
 * construction what `lieAt` will say about it.
 *
 * Everything else (cup, flag, slope arrows, reach ring, aim line, target,
 * ball) is drawn AFTER the zoom is undone, at `camera.toScreen(point)`,
 * so a ball is two crisp pixels at any zoom.
 */
import { PALETTE } from './palette.js';
import { SPRITES, drawSprite } from './sprites.js';
import { drawHole } from './holeView.js';
import { greenCentre } from '../sim/hole.js';
import { greenRadius } from '../sim/terrain.js';

/** How steep a green reads: 1 gentle, 2 firm, 3 severe — drawn as the
 * length of its slope arrows. Thresholds sit between the five green
 * presets' slopeFraction values (0.04 … 0.15). */
export function slopeMarks(fraction) {
  if (fraction < 0.07) return 1;
  if (fraction < 0.13) return 2;
  return 3;
}

/** Four points on the green, on the diagonals, clear of the cup. */
export function slopeArrowAnchors(hole) {
  const cup = greenCentre(hole);
  const d = greenRadius(hole) * 0.45;
  return [
    { x: cup.x - d, y: cup.y - d }, { x: cup.x + d, y: cup.y - d },
    { x: cup.x - d, y: cup.y + d }, { x: cup.x + d, y: cup.y + d },
  ];
}

/** Points every `step` px from `a` to `b`, both ends included. */
export function dottedPoints(a, b, step) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-6) return [{ x: a.x, y: a.y }];
  const n = Math.max(1, Math.round(length / step));
  const points = [];
  for (let i = 0; i <= n; i++) {
    points.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  return points;
}

function dot(ctx, p, size = 1) {
  ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
}

function drawCupAndFlag(ctx, camera, hole) {
  const s = camera.toScreen(greenCentre(hole));
  const sprite = SPRITES.flag;
  drawSprite(ctx, sprite, s.x - sprite[0].length / 2, s.y - sprite.length);
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 2, 2);
}

function drawSlopeArrows(ctx, camera, hole, slope, fraction) {
  const length = Math.hypot(slope.x, slope.y) || 1;
  // Screen y runs the other way from world y.
  const dir = { x: slope.x / length, y: -slope.y / length };
  const perp = { x: -dir.y, y: dir.x };
  // A steeper green gets a longer arrow: 6, 10 or 14 px of shaft.
  const shaft = 2 + slopeMarks(fraction) * 4;
  ctx.fillStyle = PALETTE.FAIRWAY_SHADOW;
  for (const anchor of slopeArrowAnchors(hole)) {
    const mid = camera.toScreen(anchor);
    const tail = { x: mid.x - (dir.x * shaft) / 2, y: mid.y - (dir.y * shaft) / 2 };
    const tip = { x: mid.x + (dir.x * shaft) / 2, y: mid.y + (dir.y * shaft) / 2 };
    for (const p of dottedPoints(tail, tip, 1)) dot(ctx, p);
    for (const back of [1, 2, 3]) {
      dot(ctx, { x: tip.x - dir.x * back + perp.x * back, y: tip.y - dir.y * back + perp.y * back });
      dot(ctx, { x: tip.x - dir.x * back - perp.x * back, y: tip.y - dir.y * back - perp.y * back });
    }
  }
}

function drawReachRing(ctx, camera, ball, reachYards) {
  const centre = camera.toScreen(ball);
  const radius = reachYards * camera.scale;
  const steps = Math.max(24, Math.round((2 * Math.PI * radius) / 5));
  ctx.fillStyle = PALETTE.UI_LIGHT;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    dot(ctx, { x: centre.x + Math.cos(a) * radius, y: centre.y + Math.sin(a) * radius });
  }
  ctx.globalAlpha = 1;
}

function drawAim(ctx, camera, ball, target) {
  const from = camera.toScreen(ball);
  const to = camera.toScreen(target);
  ctx.fillStyle = PALETTE.WHITE;
  ctx.globalAlpha = 0.75;
  for (const p of dottedPoints(from, to, 4)) dot(ctx, p);
  ctx.globalAlpha = 1;

  const x = Math.round(to.x);
  const y = Math.round(to.y);
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(x - 4, y - 1, 9, 3);
  ctx.fillRect(x - 1, y - 4, 3, 9);
  ctx.fillStyle = PALETTE.ACCENT;
  ctx.fillRect(x - 3, y, 7, 1);
  ctx.fillRect(x, y - 3, 1, 7);
}

function drawBall(ctx, camera, ball, lift) {
  const s = camera.toScreen(ball);
  const x = Math.round(s.x);
  const y = Math.round(s.y);
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(x, y, 2, 1);                       // shadow, on the ground
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fillRect(x - 1, y - 1 - Math.round(lift), 2, 2);
}

/**
 * scene = {
 *   hole, viewRect, camera,
 *   ball: { x, y },          // world yards; the animated position during flight
 *   lift,                    // px of height above the shadow (0 on the ground)
 *   target,                  // world yards, or null to hide the aim line
 *   reachYards,              // number, or null to hide the ring (hidden on the green)
 *   slope, slopeFraction,    // the green's slope, or slope null when not putting
 * }
 * `canvasWidth`/`canvasHeight` are the surface's, for the clear.
 */
export function drawPlayScene(ctx, canvasWidth, canvasHeight, scene) {
  const { hole, viewRect, camera } = scene;

  // The strip outside viewRect sits behind opaque chrome, but is cleared
  // anyway so a previous screen's last frame cannot show through a gap.
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);
  ctx.clip();

  // Beyond the hole is woods — exactly what lieAt returns out there.
  ctx.fillStyle = PALETTE.TREE;
  ctx.fillRect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);

  ctx.save();
  ctx.translate(camera.tx, camera.ty);
  ctx.scale(camera.zoom, camera.zoom);
  drawHole(ctx, hole, viewRect, { flag: false, clip: false });
  ctx.restore();

  if (scene.slope) drawSlopeArrows(ctx, camera, hole, scene.slope, scene.slopeFraction);
  drawCupAndFlag(ctx, camera, hole);
  if (scene.target) {
    if (scene.reachYards) drawReachRing(ctx, camera, scene.ball, scene.reachYards);
    drawAim(ctx, camera, scene.ball, scene.target);
  }
  drawBall(ctx, camera, scene.ball, scene.lift ?? 0);

  ctx.restore();
}
