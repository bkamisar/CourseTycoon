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

  // Exact inverse of toScreen, so a caller reading a pointer position (the
  // hole editor's drag handling) can recover the hole-yard point under the
  // finger without re-deriving this layout math a second time.
  function toWorld(point) {
    return {
      x: (point.x - offsetX) / scale + bounds.minX,
      y: bounds.minY + (bottomY - point.y) / scale,
    };
  }

  return { toScreen, toWorld, scale, bounds };
}

// --- Texture: fairway/rough shading, and hazard depth/depression -------
//
// `drawBand`'s stroke is the exact geometric region `lieAt` tests as
// fairway or rough, so texture painted as the STROKE STYLE ITSELF (a tiled
// CanvasPattern, in place of a flat colour) rides along for free: the
// browser only ever paints the pattern inside the stroke's own shape,
// round caps/joins included, with no separate clip math to keep in sync
// and no way for it to disagree with the band underneath it.
//
// Patterns and gradients need a live `document`/canvas, so nothing here
// runs at module load — only on first actual draw, in a browser. Every
// caller (resortView.js, the hole editor) only ever runs in one, but
// `tests/holeView.test.js` imports this module in plain Node for
// `computeHoleTransform`, and that import must not touch `document`.

let fairwayPattern = null;
let roughPattern = null;

/** 4x4 tile: solid `base`, with a 2px band of `stripe` across the top —
 * tiled, this reads as mowed fairway stripes, matching what the palette
 * already names FAIRWAY_SHADOW for. */
function makeStripeTile(base, stripe) {
  const tile = document.createElement('canvas');
  tile.width = 4;
  tile.height = 4;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = base;
  tctx.fillRect(0, 0, 4, 4);
  tctx.fillStyle = stripe;
  tctx.fillRect(0, 0, 4, 2);
  return tile;
}

/** 4x4 tile: solid `base` with a few single-pixel `speckle` flecks at
 * fixed (not random — this is redrawn every frame, and a random tile
 * would shimmer) offsets — coarser and patchier than the fairway's clean
 * stripes, so rough keeps reading as visually distinct from fairway the
 * way the palette requires, texture included. */
function makeSpeckleTile(base, speckle) {
  const tile = document.createElement('canvas');
  tile.width = 4;
  tile.height = 4;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = base;
  tctx.fillRect(0, 0, 4, 4);
  tctx.fillStyle = speckle;
  tctx.fillRect(0, 1, 1, 1);
  tctx.fillRect(2, 3, 1, 1);
  tctx.fillRect(3, 0, 1, 1);
  return tile;
}

function fairwayFill(ctx) {
  if (!fairwayPattern) fairwayPattern = ctx.createPattern(makeStripeTile(PALETTE.FAIRWAY, PALETTE.FAIRWAY_SHADOW), 'repeat');
  return fairwayPattern;
}

function roughFill(ctx) {
  if (!roughPattern) roughPattern = ctx.createPattern(makeSpeckleTile(PALETTE.ROUGH, PALETTE.ROUGH_SHADOW), 'repeat');
  return roughPattern;
}

/** Radial gradient reading as a pond's surface-to-depth falloff: deep
 * water at the centre, lightening toward the shore. Same circle `lieAt`
 * tests as water either way — only the fill style changes. */
function pondFill(ctx, p, r) {
  const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  gradient.addColorStop(0, PALETTE.WATER_DEEP);
  gradient.addColorStop(1, PALETTE.WATER);
  return gradient;
}

/** Radial gradient reading as a bunker's bowl: shaded and recessed
 * through the middle, catching light only at the rim — the same
 * "lighter edge, darker centre" language `pondFill` uses for depth,
 * applied to sand instead of water. */
function bunkerFill(ctx, p, r) {
  const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  gradient.addColorStop(0, PALETTE.SAND_SHADOW);
  gradient.addColorStop(0.75, PALETTE.SAND_SHADOW);
  gradient.addColorStop(1, PALETTE.SAND);
  return gradient;
}

function drawBand(ctx, t, corridor, widthYards, style) {
  if (corridor.length < 2) return;
  ctx.beginPath();
  const p0 = t.toScreen(corridor[0]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < corridor.length; i++) {
    const p = t.toScreen(corridor[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = style;
  ctx.lineWidth = Math.max(1, widthYards * t.scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * Fills a circle at `centre` (hole-yard coordinates) with `style` — a
 * flat colour, or a function `(ctx, screenPoint, screenRadius) => style`
 * for a gradient that needs to know where on screen it's centred. Returns
 * the resolved screen point/radius so a caller (tree clumps, in
 * particular) can clip further drawing to the exact same circle.
 */
function drawCircle(ctx, t, centre, radiusYards, style) {
  const p = t.toScreen(centre);
  const r = Math.max(0.5, radiusYards * t.scale);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = typeof style === 'function' ? style(ctx, p, r) : style;
  ctx.fill();
  return { p, r };
}

/** Fixed (not random, for the same never-jitter reason as the rough
 * speckle tile) relative offsets for a tree clump's canopy blobs — a
 * handful of overlapping circles rather than one flat disc. Clipped to
 * the clump's own outer circle by the caller, so despite a couple of
 * these mathematically poking past the radius at their own offset+size,
 * nothing they draw can ever land outside it: the promise `lieAt`'s
 * radius test depends on is enforced by the clip, not by these numbers
 * being carefully tuned to stay inside on their own. */
const TREE_CANOPY_BLOBS = [
  { dx: -0.35, dy: -0.3, dr: 0.55 },
  { dx: 0.4, dy: -0.15, dr: 0.5 },
  { dx: -0.05, dy: 0.4, dr: 0.5 },
  { dx: 0.35, dy: 0.3, dr: 0.4 },
];

function drawTreeClump(ctx, t, feature) {
  const { p, r } = drawCircle(ctx, t, feature, feature.size, PALETTE.TREE);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = PALETTE.TREE_SHADOW;
  for (const b of TREE_CANOPY_BLOBS) {
    ctx.beginPath();
    ctx.arc(p.x + b.dx * r, p.y + b.dy * r, b.dr * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The tee sprite at the corridor's start. Like `drawFlag`, this is placed
 * unrotated at a fixed pixel size regardless of hole scale or corridor
 * direction — `lieAt` has no opinion about the tee (`LIE.TEE` is never
 * actually returned; see the file-level comment), so unlike the corridor
 * band, hazards and green, there is no geometry here that has to agree
 * with anything the simulation resolves shots against. Fixed-size is also
 * simply what already reads correctly at both hole-editor scale and the
 * much smaller overview-plot scale, per the flag it's drawn the same way
 * as.
 */
function drawTeeBox(ctx, t, hole) {
  const start = hole.corridor[0];
  const p = t.toScreen(start);
  const sprite = SPRITES.tee;
  const w = sprite[0].length;
  const h = sprite.length;
  drawSprite(ctx, sprite, p.x - w / 2, p.y - h / 2);
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

  drawBand(ctx, t, hole.corridor, hole.corridorWidth + ROUGH_MARGIN * 2, roughFill(ctx));
  drawBand(ctx, t, hole.corridor, hole.corridorWidth, fairwayFill(ctx));

  const gc = greenCentre(hole);
  const gr = greenRadius(hole);
  drawCircle(ctx, t, gc, gr, PALETTE.GREEN_SURFACE);

  // Hazards paint over the green/fairway/rough wherever they overlap,
  // matching lieAt checking them before anything else.
  for (const f of hole.features) {
    if (f.type === 'pond') drawCircle(ctx, t, f, f.size, pondFill);
  }
  for (const f of hole.features) {
    if (f.type === 'bunker') drawCircle(ctx, t, f, f.size, bunkerFill);
  }
  for (const f of hole.features) {
    if (f.type === 'trees') drawTreeClump(ctx, t, f);
  }

  drawTeeBox(ctx, t, hole);
  drawFlag(ctx, t, gc);

  ctx.restore();
}
