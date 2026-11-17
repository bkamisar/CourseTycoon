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
import { SPRITES, drawSprite, drawSpriteOutlined } from './sprites.js';
import { drawWeather } from './weatherFx.js';
import { setLight, lightAt, applyLight, drawCastShadow } from './light.js';
import { drawHole, fillWoods } from './holeView.js';
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
  drawCastShadow(ctx, Math.round(s.x) - 1, Math.round(s.y) - 1, sprite.length + 2, 2);
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
  ctx.fillStyle = PALETTE[style.colour];
  for (const p of impactParticles(impact.kind, impact.age)) dot(ctx, { x: s.x + p.dx, y: s.y + p.dy });
}

const GOLFER_POSE = { address: 'golferAddress', backswing: 'golferBackswing', finish: 'golferFinish' };

/** The player's golfer, standing to the left of where the ball is (or
 * was) struck from, feet level with it. Fixed size at any zoom, like the
 * flag and the tee — he is a marker for "you are here", not scenery. */
function drawGolfer(ctx, camera, golfer) {
  const sprite = SPRITES[GOLFER_POSE[golfer.pose] ?? GOLFER_POSE.address];
  const s = camera.toScreen(golfer.at);
  drawCastShadow(ctx, Math.round(s.x) - sprite[0].length + 1, Math.round(s.y) + 1, sprite.length, 4);
  drawSpriteOutlined(ctx, sprite, s.x - sprite[0].length - 1, s.y - (sprite.length - 2));
}

/** The last few places the ball was, oldest first and faintest: the tail
 * that makes a white dot crossing green stripes readable as a shot. */
function drawTrail(ctx, camera, trail) {
  trail.forEach((p, i) => {
    const s = camera.toScreen(p);
    ctx.fillStyle = i < trail.length / 2 ? PALETTE.UI_LIGHT : PALETTE.WHITE;
    ctx.fillRect(Math.round(s.x), Math.round(s.y) - Math.round(p.lift ?? 0), 1, 1);
  });
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
  fillWoods(ctx, {
    x: (viewRect.x - camera.tx) / camera.zoom,
    y: (viewRect.y - camera.ty) / camera.zoom,
    width: viewRect.width / camera.zoom,
    height: viewRect.height / camera.zoom,
  });
  drawHole(ctx, hole, viewRect, {
    flag: false,
    clip: false,
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
