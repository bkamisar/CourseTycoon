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
 * rather than anything hand-tuned to merely look right. Decoration goes
 * INSIDE a region (a darker rim on the fairway is drawn inside the
 * fairway band, a pond's shoreline inside its circle), never across an
 * edge.
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
 * a tee box (`LIE.TEE` is never actually returned) and a flagpole is set
 * dressing — so both are painted last, on top of everything else.
 *
 * Since build 2026-11-16e this is not pixel art. The canvas is drawn at
 * the device's real resolution (pixel.js) and the geometry here is exact,
 * not rounded to a pixel grid: smoother, and more honest, because a shape
 * rounded to the grid is a shape a little different from the one `lieAt`
 * tests.
 */
import { PALETTE, mix, withAlpha } from './palette.js';
import { animationTime } from './animClock.js';
import { resolution } from './paint.js';
import { drawForest } from './forest.js';
import { drawCastShadow } from './light.js';
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

// --- Textures ----------------------------------------------------------
//
// `drawBand`'s stroke is the exact region `lieAt` tests as fairway or
// rough, so texture laid down as the STROKE STYLE ITSELF (a tiled
// CanvasPattern in place of a flat colour) rides along for free: the
// browser only ever paints the pattern inside the stroke's own shape.
//
// A tile is built once, at device resolution (N logical px of tile is
// N * resolution() real pixels), with a seeded generator — nothing is
// random at draw time, so the ground never shimmers — and its pattern is
// given the inverse scale, so one tile pixel is one device pixel.
//
// Patterns need a live `document`, so nothing here runs at module load:
// `tests/holeView.test.js` imports this file in plain Node for
// `computeHoleTransform`.

const textures = new Map();
let textureCtx = null;

/** A fixed sequence of numbers in 0–1 from `seed`: the same every run. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The pattern called `name`: a `size`×`size` logical tile, painted once by
 * `paint(tctx, size, random)` in logical units. `paint` may draw past the
 * edges; `wrapped` helps it draw a shape so it tiles.
 */
function texture(name, size, paint) {
  const res = resolution();
  const key = `${name}@${res}`;
  let pattern = textures.get(key);
  if (pattern) return pattern;
  const tile = document.createElement('canvas');
  tile.width = Math.max(1, Math.round(size * res));
  tile.height = tile.width;
  const tctx = tile.getContext('2d');
  tctx.scale(tile.width / size, tile.height / size);
  paint(tctx, size, seeded(name.length * 7919 + size * 104729));
  textureCtx ??= document.createElement('canvas').getContext('2d');
  pattern = textureCtx.createPattern(tile, 'repeat');
  pattern.setTransform(new DOMMatrix().scale(size / tile.width));
  textures.set(key, pattern);
  return pattern;
}

/** Calls `draw(dx, dy)` at the nine offsets that make a shape near a
 * tile's edge reappear on the opposite edge. */
function wrapped(size, draw) {
  for (const dy of [-size, 0, size]) for (const dx of [-size, 0, size]) draw(dx, dy);
}

function blob(tctx, x, y, r, colour, alpha) {
  const g = tctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(colour, alpha));
  g.addColorStop(1, withAlpha(colour, 0));
  tctx.fillStyle = g;
  tctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** The forest floor: dark ground with soft patches of undergrowth and
 * shade. Under the trees, and in every tree clump. */
function floorFill() {
  return texture('floor', 24, (t, size, random) => {
    t.fillStyle = PALETTE.TREE_SHADOW;
    t.fillRect(0, 0, size, size);
    for (let i = 0; i < 16; i++) {
      const x = random() * size;
      const y = random() * size;
      const r = 2 + random() * 4;
      const light = i % 3 !== 0;
      wrapped(size, (dx, dy) => blob(t, x + dx, y + dy, r, light ? PALETTE.TREE : PALETTE.OUTLINE, light ? 0.55 : 0.3));
    }
  });
}

/** Rough: soft patches of longer and shorter grass. Laid over ROUGH. */
function roughMottle() {
  return texture('roughMottle', 20, (t, size, random) => {
    for (let i = 0; i < 14; i++) {
      const x = random() * size;
      const y = random() * size;
      const r = 1.5 + random() * 3.5;
      const dark = i % 2 === 0;
      wrapped(size, (dx, dy) => blob(t, x + dx, y + dy, r, dark ? PALETTE.ROUGH_SHADOW : PALETTE.FAIRWAY, dark ? 0.35 : 0.18));
    }
  });
}

/** Fine grain: single blades catching or losing the light. Laid over any
 * grass, so no surface reads as flat plastic. */
function grain() {
  return texture('grain', 12, (t, size, random) => {
    for (let i = 0; i < 70; i++) {
      const x = random() * size;
      const y = random() * size;
      t.fillStyle = withAlpha(i % 2 ? PALETTE.WHITE : PALETTE.OUTLINE, 0.07);
      t.fillRect(x, y, 0.35, 0.7);
    }
  });
}

/** Mown fairway: diagonal bands of the same grass cut in opposite
 * directions. Close in colour — a sheen on one surface, not two surfaces. */
function fairwayStripes() {
  return texture('fairwayStripes', 8, (t, size) => {
    t.fillStyle = PALETTE.FAIRWAY;
    t.fillRect(0, 0, size, size);
    t.fillStyle = PALETTE.FAIRWAY_MOWN;
    const half = size / 2;
    for (const c of [-size, 0, size]) {
      t.beginPath();
      t.moveTo(c, 0);
      t.lineTo(c + half, 0);
      t.lineTo(c + half - size, size);
      t.lineTo(c - size, size);
      t.closePath();
      t.fill();
    }
  });
}

/** The putting surface's fine cut: narrow alternate stripes, faint. */
function greenStripes() {
  return texture('greenStripes', 3, (t, size) => {
    t.fillStyle = withAlpha(PALETTE.GREEN_MOWN, 0.55);
    t.fillRect(0, 0, size / 2, size);
  });
}

/**
 * Paints the forest floor over `rect`. Exported for callers that draw
 * ground the hole itself does not cover — the resort map between its
 * plots, the play screen beyond the hole's own rectangle — so the floor
 * there is the same floor as the one `drawHole` paints. The trees that
 * stand on it are `drawForest`'s.
 */
export function fillWoods(ctx, rect) {
  ctx.fillStyle = floorFill();
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

// --- Shapes ------------------------------------------------------------

function bandPath(ctx, t, corridor) {
  ctx.beginPath();
  const p0 = t.toScreen(corridor[0]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < corridor.length; i++) {
    const p = t.toScreen(corridor[i]);
    ctx.lineTo(p.x, p.y);
  }
}

/** Strokes the corridor `widthYards` wide with each style in turn, the
 * n-th `inset[n]` logical px narrower: all inside the band `lieAt` tests. */
function drawBand(ctx, t, corridor, widthYards, layers) {
  if (corridor.length < 2) return;
  const width = widthYards * t.scale;
  bandPath(ctx, t, corridor);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const { style, inset = 0, alpha = 1 } of layers) {
    const w = width - inset;
    if (w <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A filled circle at screen point `p`, radius `r`. */
function disc(ctx, x, y, r, style) {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = style;
  ctx.fill();
}

/** Where a circular feature (a hazard or the green) lands on screen. */
function circleOf(t, centre, radiusYards) {
  return { p: t.toScreen(centre), r: Math.max(0.5, radiusYards * t.scale) };
}

/** Runs `draw` clipped to the circle at `p`/`r` — the feature's own
 * `lieAt` radius — so no decoration can put sand or water where the
 * simulation says there is none. */
function insideCircle(ctx, p, r, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.clip();
  draw();
  ctx.restore();
}

/**
 * A pond: deep in the middle and shallow at the edge, a pale line of
 * shore just inside the water's edge, and the far bank's shade along the
 * top left. The light that moves on it is `drawPondGlints`, kept separate
 * so the resort map can cache the still water and add the light per frame.
 */
function drawPond(ctx, t, feature) {
  const { p, r } = circleOf(t, feature, feature.size);
  insideCircle(ctx, p, r, () => {
    const g = ctx.createRadialGradient(p.x + r * 0.15, p.y + r * 0.2, 0, p.x, p.y, r);
    g.addColorStop(0, PALETTE.WATER_DEEP);
    g.addColorStop(0.55, mix('WATER_DEEP', 'WATER', 0.7));
    g.addColorStop(0.85, PALETTE.WATER);
    g.addColorStop(1, mix('WATER', 'WATER_LIGHT', 0.45));
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    // The bank's shadow on the water, on the side away from the sun.
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, Math.PI * 0.95, Math.PI * 1.6);
    ctx.lineWidth = Math.max(0.6, r * 0.16);
    ctx.strokeStyle = withAlpha('OUTLINE', 0.25);
    ctx.stroke();
    if (r >= 2) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r - 0.45, 0, Math.PI * 2);
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = withAlpha('WATER_LIGHT', 0.75);
      ctx.stroke();
    }
  });
}

/** Where the glints sit on a pond, as fractions of its radius:
 * `[x, y, length, phase]`. */
const GLINTS = [[-0.4, -0.3, 0.32, 0], [0.18, -0.5, 0.24, 2.1], [0.28, 0.12, 0.28, 4.2], [-0.15, 0.32, 0.2, 1.3]];

/** Light on every pond of `hole` drawn into `rect`: short bright strokes
 * that drift and fade on the shared animation clock. */
export function drawPondGlints(ctx, hole, rect, t = computeHoleTransform(hole, rect)) {
  const now = animationTime() / 1000;
  for (const f of hole.features) {
    if (f.type !== 'pond') continue;
    const { p, r } = circleOf(t, f, f.size);
    if (r < 2) continue;
    insideCircle(ctx, p, r, () => {
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.4, Math.min(0.9, r * 0.06));
      for (const [gx, gy, len, phase] of GLINTS) {
        const a = 0.5 + 0.5 * Math.sin(now * 1.3 + phase);
        const drift = Math.sin(now * 0.6 + phase) * r * 0.06;
        const x = p.x + gx * r + drift;
        const y = p.y + gy * r;
        ctx.strokeStyle = withAlpha('WHITE', 0.15 + 0.6 * a);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len * r, y);
        ctx.stroke();
      }
    });
  }
}

/**
 * A bunker: a hollow, lit from the top left — so the near (top-left) wall
 * is in shade and the floor brightens toward the far side — with a thin
 * lip and a couple of faint rake lines.
 */
function drawBunker(ctx, t, feature) {
  const { p, r } = circleOf(t, feature, feature.size);
  insideCircle(ctx, p, r, () => {
    const g = ctx.createRadialGradient(p.x + r * 0.3, p.y + r * 0.3, 0, p.x + r * 0.1, p.y + r * 0.1, r * 1.15);
    g.addColorStop(0, PALETTE.SAND_LIGHT);
    g.addColorStop(0.55, PALETTE.SAND);
    g.addColorStop(1, PALETTE.SAND_SHADOW);
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    if (r >= 3) {
      ctx.lineWidth = 0.35;
      ctx.strokeStyle = withAlpha('SAND_SHADOW', 0.35);
      for (const k of [0.45, 0.7]) {
        ctx.beginPath();
        ctx.arc(p.x - r * 0.6, p.y + r * 0.9, r * (0.9 + k), -Math.PI * 0.5, -Math.PI * 0.05);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r - 0.3, 0, Math.PI * 2);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = withAlpha('OUTLINE', 0.22);
    ctx.stroke();
  });
}

/** A clump of trees inside the hole: forest floor (it is the same lie as
 * the woods), with a dark ring of shade just inside its edge. The trees
 * that stand in it are planted by `drawForest`. */
function drawTreeClump(ctx, t, feature) {
  const { p, r } = circleOf(t, feature, feature.size);
  disc(ctx, p.x, p.y, r, floorFill());
  if (r >= 2) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r - 0.5, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha('OUTLINE', 0.35);
    ctx.stroke();
  }
}

/**
 * The green: brighter toward the light, a faint fine cut, and a collar of
 * slightly longer grass just inside the edge — inside, so the edge of the
 * green is still exactly where a ball stops being on the putting surface.
 */
function drawGreen(ctx, t, centre, radiusYards) {
  const { p, r } = circleOf(t, centre, radiusYards);
  const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, 0, p.x, p.y, r);
  g.addColorStop(0, mix('GREEN_SURFACE', 'WHITE', 0.3));
  g.addColorStop(0.6, PALETTE.GREEN_SURFACE);
  g.addColorStop(1, mix('GREEN_SURFACE', 'FAIRWAY', 0.35));
  disc(ctx, p.x, p.y, r, g);
  insideCircle(ctx, p, r, () => {
    ctx.fillStyle = greenStripes();
    ctx.globalAlpha = 0.6;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  });
  if (r >= 2) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r - 0.6, 0, Math.PI * 2);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha('FAIRWAY_SHADOW', 0.55);
    ctx.stroke();
  }
}

/** The tee: a small mown pad, with a marker at each end. Fixed size at
 * any hole scale — `lieAt` has no opinion about it. */
function drawTeeBox(ctx, t, hole) {
  const p = t.toScreen(hole.corridor[0]);
  const w = 6;
  const h = 3.6;
  ctx.beginPath();
  roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 1.2);
  ctx.fillStyle = mix('FAIRWAY', 'WHITE', 0.18);
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = withAlpha('FAIRWAY_SHADOW', 0.7);
  ctx.stroke();
  for (const dx of [-1.9, 1.9]) {
    disc(ctx, p.x + dx, p.y, 0.75, PALETTE.OUTLINE);
    disc(ctx, p.x + dx, p.y - 0.15, 0.55, PALETTE.WHITE);
  }
}

/** A rounded rectangle path, with a fallback for browsers without one. */
export function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const k = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/**
 * The cup, the pole and a flag that stirs in the breeze, with the pole's
 * foot at (`x`, `y`) in the current units. `size` 1 is the hole-view
 * flag; the play screen draws the same flag bigger.
 */
export function paintFlag(ctx, x, y, size = 1) {
  const pole = 9 * size;
  drawCastShadow(ctx, x - 0.3 * size, y, pole, 0.7 * size);
  ctx.beginPath();
  ctx.ellipse(x, y, 1.3 * size, 0.75 * size, 0, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.65 * size;
  ctx.strokeStyle = PALETTE.WHITE;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - pole);
  ctx.stroke();
  const stir = Math.sin(animationTime() / 170) * 0.5 * size;
  const top = y - pole + 0.2 * size;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.quadraticCurveTo(x + 2.4 * size, top + 0.6 * size + stir * 0.5, x + 4.6 * size, top + 1.5 * size + stir);
  ctx.lineTo(x, top + 3.1 * size);
  ctx.closePath();
  ctx.fillStyle = PALETTE.FLAG;
  ctx.fill();
  ctx.lineWidth = 0.3 * size;
  ctx.strokeStyle = withAlpha('OUTLINE', 0.5);
  ctx.stroke();
}

function drawFlag(ctx, t, greenCentrePoint) {
  const p = t.toScreen(greenCentrePoint);
  paintFlag(ctx, p.x, p.y, 1);
}

/**
 * The tee and the flag of a hole drawn into `rect`, for a caller that
 * asked `drawHole` for neither. The resort map does: it plants one forest
 * across all nine plots after the holes are down, and the tee and flag
 * have to go on after the trees, as they do inside `drawHole`.
 */
export function drawTeeAndFlag(ctx, hole, rect) {
  if (!hole || !hole.corridor || hole.corridor.length < 2) return;
  const t = computeHoleTransform(hole, rect);
  drawTeeBox(ctx, t, hole);
  drawFlag(ctx, t, greenCentre(hole));
}

/**
 * Draws one hole into `{x, y, width, height}` of `ctx`. Does nothing for
 * an unbuilt plot (no corridor) — callers drawing a resort map handle
 * empty plots themselves, with their own placeholder treatment.
 *
 * Options: `flag: false` and `tee: false` leave those out; `glints: false`
 * leaves the moving light off the ponds (for a caller caching the still
 * ground); `clip: false` draws past `rect` (the play screen zooms, clips
 * to its own view and draws its own flag); `forest: false` leaves the
 * standing trees out, for a caller planting one forest over several
 * holes; `cover` is the rectangle to plant when it is more than `rect`,
 * and `visible` the part of it actually on screen (the play screen
 * again, which can see past the hole's own rectangle, under a zoom).
 */
export function drawHole(ctx, hole, rect, {
  flag = true, tee = true, glints = true, clip = true, forest = true, cover = null, visible = null,
} = {}) {
  if (!hole || !hole.corridor || hole.corridor.length < 2) return;

  const t = computeHoleTransform(hole, rect);

  ctx.save();
  // The play screen draws the hole under a zoom, with its own clip to its
  // own view. Clipping to `rect` there would cut the rough's rounded ends
  // off along a straight line and show woods where lieAt says rough.
  if (clip) {
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
  }

  // Everything beyond the rough band is exactly what lieAt's catch-all
  // returns: trees / out-of-bounds woods.
  fillWoods(ctx, rect);

  const roughWidth = hole.corridorWidth + ROUGH_MARGIN * 2;
  drawBand(ctx, t, hole.corridor, roughWidth, [
    { style: mix('ROUGH', 'ROUGH_SHADOW', 0.75) },
    { style: PALETTE.ROUGH, inset: 1.4 },
    { style: roughMottle(), inset: 1.4 },
    { style: grain(), inset: 1.4 },
  ]);
  drawBand(ctx, t, hole.corridor, hole.corridorWidth, [
    { style: mix('FAIRWAY', 'FAIRWAY_SHADOW', 0.4) },
    { style: fairwayStripes(), inset: 1 },
    { style: grain(), inset: 1 },
  ]);

  const gc = greenCentre(hole);
  drawGreen(ctx, t, gc, greenRadius(hole));

  // Hazards paint over the green/fairway/rough wherever they overlap,
  // matching lieAt checking them before anything else.
  for (const f of hole.features) if (f.type === 'pond') drawPond(ctx, t, f);
  if (glints) drawPondGlints(ctx, hole, rect, t);
  for (const f of hole.features) if (f.type === 'bunker') drawBunker(ctx, t, f);
  for (const f of hole.features) if (f.type === 'trees') drawTreeClump(ctx, t, f);

  // Trees last of the terrain: they stand on top of the ground, and their
  // shadows fall across whatever the ground next to them is. `unbounded`
  // because this hole is the only thing here — every tree is checked
  // against it, not only the ones inside `rect`.
  if (forest) {
    drawForest(ctx, { area: cover ?? rect, visible, plots: [{ hole, rect, t, unbounded: true }] });
  }

  if (tee) drawTeeBox(ctx, t, hole);
  // The play screen draws the hole under a zoom and wants the flag at its
  // ordinary size on top, so it asks for the hole without one.
  if (flag) drawFlag(ctx, t, gc);

  ctx.restore();
}
