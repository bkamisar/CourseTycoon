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
 * so a ball and a golfer are the same size at any zoom.
 */
import { PALETTE, withAlpha } from './palette.js';
import { drawFigure, shirtColour } from './figures.js';
import { drawWeather } from './weatherFx.js';
import { setLight, lightAt, applyLight, drawCastShadow } from './light.js';
import { drawHole, fillWoods, paintFlag } from './holeView.js';
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

function dot(ctx, p, r = 0.6) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawCupAndFlag(ctx, camera, hole) {
  const s = camera.toScreen(greenCentre(hole));
  paintFlag(ctx, s.x, s.y, 1.5);
}

function drawSlopeArrows(ctx, camera, hole, slope, fraction) {
  const length = Math.hypot(slope.x, slope.y) || 1;
  // Screen y runs the other way from world y.
  const dir = { x: slope.x / length, y: -slope.y / length };
  const perp = { x: -dir.y, y: dir.x };
  // A steeper green gets a longer arrow: 6, 10 or 14 px of shaft.
  const shaft = 2 + slopeMarks(fraction) * 4;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, colour] of [[2, withAlpha('WHITE', 0.35)], [1, PALETTE.FAIRWAY_SHADOW]]) {
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    for (const anchor of slopeArrowAnchors(hole)) {
      const mid = camera.toScreen(anchor);
      const tail = { x: mid.x - (dir.x * shaft) / 2, y: mid.y - (dir.y * shaft) / 2 };
      const tip = { x: mid.x + (dir.x * shaft) / 2, y: mid.y + (dir.y * shaft) / 2 };
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.moveTo(tip.x - dir.x * 3 + perp.x * 2.6, tip.y - dir.y * 3 + perp.y * 2.6);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(tip.x - dir.x * 3 - perp.x * 2.6, tip.y - dir.y * 3 - perp.y * 2.6);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawReachRing(ctx, camera, ball, reachYards) {
  const centre = camera.toScreen(ball);
  const radius = reachYards * camera.scale;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = withAlpha('UI_LIGHT', 0.6);
  ctx.stroke();
  ctx.restore();
}

function drawAim(ctx, camera, ball, target) {
  const from = camera.toScreen(ball);
  const to = camera.toScreen(target);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([1.6, 2.4]);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = withAlpha('WHITE', 0.85);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // The target: a ring and a cross, dark under bright so it reads on anything.
  for (const [width, colour] of [[2, withAlpha('OUTLINE', 0.75)], [0.9, PALETTE.ACCENT]]) {
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.arc(to.x, to.y, 3.2, 0, Math.PI * 2);
    ctx.moveTo(to.x - 5, to.y);
    ctx.lineTo(to.x - 1.6, to.y);
    ctx.moveTo(to.x + 1.6, to.y);
    ctx.lineTo(to.x + 5, to.y);
    ctx.moveTo(to.x, to.y - 5);
    ctx.lineTo(to.x, to.y - 1.6);
    ctx.moveTo(to.x, to.y + 1.6);
    ctx.lineTo(to.x, to.y + 5);
    ctx.stroke();
  }
  ctx.restore();
}

/** How long the burst where a ball came down stays on screen. */
export const IMPACT_MS = 520;

const IMPACT_STYLE = {
  // colour, particles, how far they spread (px), how high they jump (px)
  water: { colour: 'WATER_LIGHT', count: 9, spread: 9, jump: 6 },
  sand: { colour: 'SAND_LIGHT', count: 8, spread: 7, jump: 4 },
  turf: { colour: 'UI_LIGHT', count: 5, spread: 4, jump: 2 },
  cup: { colour: 'ACCENT', count: 10, spread: 10, jump: 7 },
};

/**
 * Where the particles of an impact are, `age` ms after it. Pure, so the
 * shape of a splash is a fact that can be tested rather than a look that
 * can only be squinted at: a ring that widens, flattened to read as lying
 * on the ground, with every particle jumping up and coming back down.
 */
export function impactParticles(kind, age) {
  const style = IMPACT_STYLE[kind];
  if (!style || age < 0 || age >= IMPACT_MS) return [];
  const t = age / IMPACT_MS;
  const reach = 1 + style.spread * t;
  const jump = Math.sin(Math.PI * t) * style.jump;
  const particles = [];
  for (let i = 0; i < style.count; i++) {
    const angle = (i / style.count) * Math.PI * 2 + 0.4;
    particles.push({ dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach * 0.55 - jump });
  }
  return particles;
}

function drawImpact(ctx, camera, impact) {
  const style = IMPACT_STYLE[impact.kind];
  if (!style) return;
  const s = camera.toScreen(impact);
  const fade = 1 - impact.age / IMPACT_MS;
  ctx.save();
  // A ripple, or a scuff, on the ground where it landed.
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 2 + style.spread * (1 - fade), (2 + style.spread * (1 - fade)) * 0.55, 0, 0, Math.PI * 2);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = withAlpha(style.colour, 0.6 * fade);
  ctx.stroke();
  ctx.fillStyle = withAlpha(style.colour, 0.4 + 0.6 * fade);
  for (const p of impactParticles(impact.kind, impact.age)) dot(ctx, { x: s.x + p.dx, y: s.y + p.dy }, 0.7);
  ctx.restore();
}

const FIGURE_SCALE = 1.6;

/** The player's golfer, standing to the left of where the ball is (or
 * was) struck from, so the club at address meets the ball. Fixed size at
 * any zoom, like the flag — a marker for "you are here", not scenery. */
function drawGolfer(ctx, camera, golfer) {
  const s = camera.toScreen(golfer.at);
  const fx = s.x - 3.3 * FIGURE_SCALE;
  const fy = s.y + 0.2;
  drawCastShadow(ctx, fx - 1.2 * FIGURE_SCALE, fy, 7 * FIGURE_SCALE, 2.4 * FIGURE_SCALE);
  drawFigure(ctx, fx, fy, { shirt: shirtColour(0), scale: FIGURE_SCALE, pose: golfer.pose ?? 'address' });
}

/** The last few places the ball was, oldest first and faintest: the tail
 * that makes a white dot crossing green stripes readable as a shot. */
function drawTrail(ctx, camera, trail) {
  ctx.save();
  trail.forEach((p, i) => {
    const s = camera.toScreen(p);
    const k = (i + 1) / trail.length;
    ctx.fillStyle = withAlpha('WHITE', 0.15 + 0.6 * k);
    dot(ctx, { x: s.x, y: s.y - (p.lift ?? 0) }, 0.4 + 0.5 * k);
  });
  ctx.restore();
}

function drawBall(ctx, camera, ball, lift) {
  const s = camera.toScreen(ball);
  // The shadow stays on the ground and shrinks and fades as the ball climbs.
  const high = Math.min(1, lift / 25);
  ctx.beginPath();
  ctx.ellipse(s.x + 0.4 + lift * 0.15, s.y + 0.3, 1.3 - 0.5 * high, 0.7 - 0.25 * high, 0, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha('OUTLINE', 0.45 - 0.25 * high);
  ctx.fill();
  const y = s.y - lift;
  ctx.beginPath();
  ctx.arc(s.x, y - 0.6, 1.1, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(s.x - 0.4, y - 1, 0, s.x, y - 0.6, 1.1);
  g.addColorStop(0, PALETTE.WHITE);
  g.addColorStop(1, PALETTE.UI_LIGHT);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.3;
  ctx.strokeStyle = withAlpha('OUTLINE', 0.6);
  ctx.stroke();
}

/**
 * scene = {
 *   hole, viewRect, camera,
 *   ball: { x, y },          // world yards; the animated position during flight
 *   lift,                    // px of height above the shadow (0 on the ground)
 *   target,                  // world yards, or null to hide the aim line
 *   reachYards,              // number, or null to hide the ring (hidden on the green)
 *   slope, slopeFraction,    // the green's slope, or slope null when not putting
 *   golfer,                  // { at: {x,y}, pose } or null
 *   trail,                   // [{ x, y, lift }] oldest first, or []
 *   impact,                  // { x, y, kind, age } or null
 *   weatherKey, timeMs,      // today's condition and the animation clock
 * }
 * `canvasWidth`/`canvasHeight` are the surface's, for the clear.
 */
/** How far past the hole's own rectangle the forest is planted, in
 * un-zoomed pixels: the camera follows a ball into the woods, and the
 * woods it finds there should have trees in them. */
const FOREST_BEYOND = 48;

export function drawPlayScene(ctx, canvasWidth, canvasHeight, scene) {
  const { hole, viewRect, camera } = scene;

  // No clock on this screen, so a dry day is plain daylight; a wet one is
  // overcast, shadowless and grey, the same as it is on the map.
  setLight(lightAt({ weatherKey: scene.weatherKey }));

  // The strip outside viewRect sits behind opaque chrome, but is cleared
  // anyway so a previous screen's last frame cannot show through a gap.
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);
  ctx.clip();

  ctx.save();
  ctx.translate(camera.tx, camera.ty);
  ctx.scale(camera.zoom, camera.zoom);
  // Beyond the hole is woods — exactly what lieAt returns out there —
  // painted under the same zoom as the hole, so the forest floor outside
  // the hole's own rectangle is the same size as the floor inside it. The
  // rectangle filled is the view, mapped back through the zoom.
  const inView = {
    x: (viewRect.x - camera.tx) / camera.zoom,
    y: (viewRect.y - camera.ty) / camera.zoom,
    width: viewRect.width / camera.zoom,
    height: viewRect.height / camera.zoom,
  };
  fillWoods(ctx, inView);
  drawHole(ctx, hole, viewRect, {
    flag: false,
    clip: false,
    visible: inView,
    cover: {
      x: viewRect.x - FOREST_BEYOND,
      y: viewRect.y - FOREST_BEYOND,
      width: viewRect.width + FOREST_BEYOND * 2,
      height: viewRect.height + FOREST_BEYOND * 2,
    },
  });
  ctx.restore();

  if (scene.slope) drawSlopeArrows(ctx, camera, hole, scene.slope, scene.slopeFraction);
  drawCupAndFlag(ctx, camera, hole);
  if (scene.target) {
    if (scene.reachYards) drawReachRing(ctx, camera, scene.ball, scene.reachYards);
    drawAim(ctx, camera, scene.ball, scene.target);
  }
  if (scene.impact) drawImpact(ctx, camera, scene.impact);
  if (scene.golfer) drawGolfer(ctx, camera, scene.golfer);
  if (scene.trail?.length) drawTrail(ctx, camera, scene.trail);
  drawBall(ctx, camera, scene.ball, scene.lift ?? 0);
  // The colour of the light goes over everything on the ground and under
  // the rain, which is in the air in front of it.
  applyLight(ctx, viewRect);
  if (scene.weatherKey) drawWeather(ctx, viewRect, scene.weatherKey, scene.timeMs ?? 0);

  ctx.restore();
}
