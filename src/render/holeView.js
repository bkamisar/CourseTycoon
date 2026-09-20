/**
 * Draws one hole into a rectangle of the canvas: tee at the bottom, green
 * at the top (portrait suits a golf hole better than landscape).
 *
 * The one rule that matters more than anything else in this file: a pixel
 * drawn here must read the same lie that `terrain.js#lieAt` would compute
 * for the corresponding yard point. So every shape drawn is the exact
 * geometric region `lieAt` tests against — a stroked polyline with round
 * caps/joins for the corridor band (which is exactly what a clamped
 * point-to-segment distance test describes), and a filled circle for every
 * hazard and the green (which is exactly what a radius test describes) —
 * rather than anything hand-tuned to merely look right.
 *
 * Draw order follows `lieAt`'s own priority, not the reading order a plain
 * English description might suggest: hazards (water, sand, tree clumps)
 * are checked before the green in `lieAt`, so they must be painted after
 * it here, or an overlap (a bunker guarding a green's edge, which happens
 * on two of the six templates) would render as green over sand instead of
 * sand over green — a hole that looks different from how it plays, which
 * is the one thing this file must never do.
 *
 * The tee box and the flag are decorative — `lieAt` has no opinion about
 * a tee box (`LIE.TEE` is never actually returned) and a flagpole is a few
 * pixels of set dressing — so both are painted last, on top of everything
 * else, and are not part of the terrain the simulation resolves shots
 * against.
 */
import { PALETTE } from './palette.js';
import { SPRITES, drawSprite } from './sprites.js';
import { greenCentre } from '../sim/hole.js';
import { greenRadius } from '../sim/terrain.js';

/** Yards of rough beyond the fairway band, mirroring terrain.js#lieAt. */
const ROUGH_MARGIN = 22;

/** Extra yard headroom behind the tee and above the green, for framing. */
const TEE_HEADROOM = 10;
const GREEN_HEADROOM = 14;

/** Tee box footprint in yards, purely cosmetic. */
const TEE_DEPTH_YARDS = 8;
const TEE_WIDTH_YARDS = 16;

function computeBounds(hole) {
  const halfBand = hole.corridorWidth / 2 + ROUGH_MARGIN;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const p of hole.corridor) {
    minX = Math.min(minX, p.x - halfBand);
    maxX = Math.max(maxX, p.x + halfBand);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const gc = greenCentre(hole);
  const gr = greenRadius(hole);
  minX = Math.min(minX, gc.x - gr);
  maxX = Math.max(maxX, gc.x + gr);
  minY = Math.min(minY, gc.y - gr);
  maxY = Math.max(maxY, gc.y + gr);

  for (const f of hole.features) {
    minX = Math.min(minX, f.x - f.size);
    maxX = Math.max(maxX, f.x + f.size);
    minY = Math.min(minY, f.y - f.size);
    maxY = Math.max(maxY, f.y + f.size);
  }

  minY -= TEE_HEADROOM;
  maxY += GREEN_HEADROOM;

  return { minX, maxX, minY, maxY };
}

/**
 * Maps a hole's yard coordinates onto a screen rectangle, fitting the
 * whole corridor (plus rough, hazards and framing headroom) with a margin,
 * tee at the bottom and green at the top. Exported so a caller drawing
 * many small holes (the resort overview) can reuse the exact same mapping
 * `drawHole` uses, rather than re-deriving it.
 */
export function computeHoleTransform(hole, { x, y, width, height }) {
  const bounds = computeBounds(hole);
  const xRange = Math.max(1, bounds.maxX - bounds.minX);
  const yRange = Math.max(1, bounds.maxY - bounds.minY);

  const marginPx = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  const availW = width - marginPx * 2;
  const availH = height - marginPx * 2;
  const scale = Math.max(0.01, Math.min(availW / xRange, availH / yRange));

  const drawnW = xRange * scale;
  const drawnH = yRange * scale;
  const offsetX = x + marginPx + (availW - drawnW) / 2;
  const bottomY = y + height - marginPx - (availH - drawnH) / 2;

  function toScreen(point) {
    return {
      x: offsetX + (point.x - bounds.minX) * scale,
      y: bottomY - (point.y - bounds.minY) * scale,
    };
  }

  return { toScreen, scale, bounds };
}

function drawBand(ctx, t, corridor, widthYards, color) {
  if (corridor.length < 2) return;
  ctx.beginPath();
  const p0 = t.toScreen(corridor[0]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < corridor.length; i++) {
    const p = t.toScreen(corridor[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, widthYards * t.scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawCircle(ctx, t, centre, radiusYards, color) {
  const p = t.toScreen(centre);
  const r = Math.max(0.5, radiusYards * t.scale);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** A small rect at the corridor's start, oriented toward the first bend. */
function drawTeeBox(ctx, t, hole) {
  const start = hole.corridor[0];
  const next = hole.corridor[1] ?? { x: start.x, y: start.y + 1 };
  const dx = next.x - start.x;
  const dy = next.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;

  const p = t.toScreen(start);
  // Yard direction (dirX, dirY) maps to screen direction (dirX, -dirY)
  // under toScreen's y-flip; rotate the local frame to match.
  const angle = Math.atan2(-dirY, dirX);

  const depthPx = TEE_DEPTH_YARDS * t.scale;
  const widthPx = Math.min(TEE_WIDTH_YARDS, hole.corridorWidth * 0.7) * t.scale;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.fillStyle = PALETTE.TEE;
  // Sits mostly behind the corridor's start point, not centred on it, so
  // it reads as the platform the corridor leads away from.
  ctx.fillRect(-depthPx * 0.75, -widthPx / 2, depthPx, widthPx);
  ctx.restore();
}

function drawFlag(ctx, t, greenCentrePoint) {
  const p = t.toScreen(greenCentrePoint);
  const sprite = SPRITES.flag;
  const w = sprite[0].length;
  const h = sprite.length;
  // Base of the pole sits at the green's centre; sprite drawn upward and
  // centred from there.
  drawSprite(ctx, sprite, p.x - w / 2, p.y - h);
}

/**
 * Draws one hole into `{x, y, width, height}` of `ctx`. Does nothing for
 * an unbuilt plot (no corridor) — callers drawing a resort map handle
 * empty plots themselves, with their own placeholder treatment.
 */
export function drawHole(ctx, hole, rect) {
  if (!hole || !hole.corridor || hole.corridor.length < 2) return;

  const t = computeHoleTransform(hole, rect);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  // Everything beyond the rough band is exactly what lieAt's catch-all
  // returns: trees / out-of-bounds woods.
  ctx.fillStyle = PALETTE.TREE;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  drawBand(ctx, t, hole.corridor, hole.corridorWidth + ROUGH_MARGIN * 2, PALETTE.ROUGH);
  drawBand(ctx, t, hole.corridor, hole.corridorWidth, PALETTE.FAIRWAY);

  const gc = greenCentre(hole);
  const gr = greenRadius(hole);
  drawCircle(ctx, t, gc, gr, PALETTE.GREEN_SURFACE);

  // Hazards paint over the green/fairway/rough wherever they overlap,
  // matching lieAt checking them before anything else.
  for (const f of hole.features) {
    if (f.type !== 'pond') continue;
    drawCircle(ctx, t, f, f.size, PALETTE.WATER);
    drawCircle(ctx, t, f, f.size * 0.55, PALETTE.WATER_DEEP);
  }
  for (const f of hole.features) {
    if (f.type === 'bunker') drawCircle(ctx, t, f, f.size, PALETTE.SAND);
  }
  for (const f of hole.features) {
    if (f.type === 'trees') drawCircle(ctx, t, f, f.size, PALETTE.TREE);
  }

  drawTeeBox(ctx, t, hole);
  drawFlag(ctx, t, gc);

  ctx.restore();
}
