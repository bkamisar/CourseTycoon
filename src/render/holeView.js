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
import { animationFrame } from './animClock.js';
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

// The texture rules, which are the 8-bit rules:
//
//   - every pixel is one exact palette colour — tiles are painted pixel by
//     pixel, never with an anti-aliased arc or a gradient;
//   - nothing is random at draw time — a tile is built once and reused, or
//     the picture would shimmer on every frame;
//   - the only thing that moves is what is meant to: light on water,
//     driven by the shared animation clock (animClock.js).

const patterns = {};

/** Builds a `size`×`size` tile by calling `paint(put)`, where
 * `put(x, y, colour)` sets one pixel and wraps at the tile's edges, so a
 * shape can straddle the seam and still tile. */
function makeTile(size, base, paint) {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = base;
  tctx.fillRect(0, 0, size, size);
  paint((x, y, colour) => {
    tctx.fillStyle = colour;
    tctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, 1, 1);
  });
  return tile;
}

function pattern(ctx, name, build) {
  if (!patterns[name]) patterns[name] = ctx.createPattern(build(), 'repeat');
  return patterns[name];
}

/** Mown fairway: four-pixel bands of the same grass cut in opposite
 * directions. The two greens are deliberately close — the stripes should
 * read as a sheen on one surface, not as two surfaces. */
function fairwayFill(ctx) {
  return pattern(ctx, 'fairway', () => makeTile(8, PALETTE.FAIRWAY, (put) => {
    for (let y = 4; y < 8; y++) for (let x = 0; x < 8; x++) put(x, y, PALETTE.FAIRWAY_MOWN);
  }));
}

/** Rough: the same base everywhere, broken up by tufts at fixed offsets —
 * coarser and patchier than the fairway's clean bands, so the two keep
 * reading as different grass by texture as well as by colour. */
const ROUGH_TUFTS = [[1, 1], [2, 0], [5, 2], [6, 3], [3, 5], [0, 6], [7, 6], [4, 7]];
function roughFill(ctx) {
  return pattern(ctx, 'rough', () => makeTile(8, PALETTE.ROUGH, (put) => {
    for (const [x, y] of ROUGH_TUFTS) put(x, y, PALETTE.ROUGH_SHADOW);
  }));
}

/** The putting surface: a fine two-pixel check, the tightest pattern on
 * the hole, because it is the most closely mown thing on it. */
function greenFill(ctx) {
  return pattern(ctx, 'green', () => makeTile(4, PALETTE.GREEN_SURFACE, (put) => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if ((x < 2) !== (y < 2)) put(x, y, PALETTE.GREEN_MOWN);
      }
    }
  }));
}

/** Treetops seen from above, on a 16px tile: `[x, y, radius]`. Staggered
 * and of mixed sizes so the repeat does not read as a grid. */
const CANOPIES = [[3, 3, 3], [11, 2, 2], [8, 9, 3], [14, 12, 3], [2, 11, 2], [6, 15, 2], [13, 6, 2]];

/**
 * Woods: dark ground showing between round canopies, each lit from the
 * top left. Used for BOTH the out-of-bounds woods and every tree clump,
 * because `lieAt` calls both of them trees — one lie, one texture.
 */
function woodsFill(ctx) {
  return pattern(ctx, 'woods', () => makeTile(16, PALETTE.TREE_SHADOW, (put) => {
    for (const [cx, cy, r] of CANOPIES) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + 1) continue;
          // The sunlit shoulder: the top-left third of the crown.
          const lit = dx + dy <= -r && dx * dx + dy * dy < r * r;
          put(cx + dx, cy + dy, lit ? PALETTE.TREE_LIGHT : PALETTE.TREE);
        }
      }
    }
  }));
}

/**
 * Paints woods over `rect`. Exported for callers that draw ground the
 * hole itself does not cover — the resort map between its plots, the play
 * screen beyond the hole's own rectangle — so the woods there are the
 * same woods, tile for tile, as the ones `drawHole` paints.
 */
export function fillWoods(ctx, rect) {
  ctx.fillStyle = woodsFill(ctx);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

/** Below this many pixels of radius a hazard is too small to carry any
 * detail: it is drawn as one flat disc, which is all an overview plot
 * has room for. */
const DETAIL_MIN_RADIUS = 4;

/** A disc on whole-pixel coordinates, in screen space. */
function disc(ctx, x, y, r, style) {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = style;
  ctx.fill();
}

/** Runs `draw` with everything clipped to the circle at `p`/`r` — the
 * hazard's own `lieAt` radius — so no amount of decoration can put a
 * pixel of sand or water where the simulation says there is none. */
function insideCircle(ctx, p, r, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.clip();
  draw();
  ctx.restore();
}

/** Where the glints on a pond sit, as fractions of its radius, in two
 * alternating sets so the light appears to move across the water. */
const POND_GLINTS = [
  [[-0.45, -0.35, 0.3], [0.15, -0.55, 0.22], [0.3, 0.1, 0.26]],
  [[-0.25, -0.45, 0.26], [0.35, -0.3, 0.3], [-0.1, 0.25, 0.22]],
];
const GLINT_PERIOD_MS = 900;

/**
 * A pond: a pale line of foam at the shore, shallows, a darker deep set
 * slightly down and right (the near bank shelves, the far one drops),
 * and a few glints of light that change places every so often.
 */
function drawPondFeature(ctx, t, feature) {
  const { p, r } = drawCircle(ctx, t, feature, feature.size, PALETTE.WATER);
  if (r < DETAIL_MIN_RADIUS) {
    disc(ctx, p.x, p.y, Math.round(r * 0.6), PALETTE.WATER_DEEP);
    return;
  }
  const edge = Math.max(1, Math.round(r * 0.08));
  insideCircle(ctx, p, r, () => {
    ctx.fillStyle = PALETTE.WATER_LIGHT;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    disc(ctx, p.x, p.y, r - edge, PALETTE.WATER);
    disc(ctx, p.x + edge, p.y + edge, Math.round(r * 0.62), PALETTE.WATER_DEEP);
    const phase = animationFrame(GLINT_PERIOD_MS, POND_GLINTS.length);
    ctx.fillStyle = PALETTE.WATER_LIGHT;
    for (const [dx, dy, len] of POND_GLINTS[phase]) {
      ctx.fillRect(Math.round(p.x + dx * r), Math.round(p.y + dy * r), Math.max(2, Math.round(len * r)), 1);
    }
  });
}

/**
 * A bunker: a dark lip all the way round, a sunlit floor, and the lip's
 * shadow lying across the top-left of the floor — the light comes from
 * the top left everywhere in this game (see the canopies), so the near
 * wall of a hollow is the one in shade.
 */
function drawBunkerFeature(ctx, t, feature) {
  const { p, r } = drawCircle(ctx, t, feature, feature.size, PALETTE.SAND);
  if (r < DETAIL_MIN_RADIUS) return;
  const lip = Math.max(1, Math.round(r * 0.12));
  insideCircle(ctx, p, r, () => {
    ctx.fillStyle = PALETTE.SAND_SHADOW;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    disc(ctx, p.x, p.y, r - lip, PALETTE.SAND);
    disc(ctx, p.x + lip * 2, p.y + lip * 2, r - lip * 2, PALETTE.SAND_LIGHT);
  });
}

/** Rounds a screen point to the pixel grid — a fractional position
 * anti-aliases against neighbouring pixels, which is exactly the softness
 * this file exists to remove. Every shape below is drawn from rounded
 * points so its edges land on whole pixels. */
function roundPoint(p) {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function drawBand(ctx, t, corridor, widthYards, style) {
  if (corridor.length < 2) return;
  ctx.beginPath();
  const p0 = roundPoint(t.toScreen(corridor[0]));
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < corridor.length; i++) {
    const p = roundPoint(t.toScreen(corridor[i]));
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = style;
  ctx.lineWidth = Math.max(1, Math.round(widthYards * t.scale));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * Fills a circle at `centre` (hole-yard coordinates) with a flat `style`,
 * on rounded pixel coordinates so the edge is crisp rather than
 * anti-aliased. Returns the resolved screen point/radius so a caller
 * (tree clumps, ponds, bunkers) can clip or layer further drawing on the
 * exact same circle.
 */
function drawCircle(ctx, t, centre, radiusYards, style) {
  const p = roundPoint(t.toScreen(centre));
  const r = Math.max(0.5, Math.round(radiusYards * t.scale));
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = style;
  ctx.fill();
  return { p, r };
}

/**
 * A clump of trees inside the hole: the same canopy texture as the woods
 * outside it (they are the same lie), ringed with shadow so the clump
 * stands up off the grass it grows out of. Clipped to the clump's own
 * `lieAt` circle, like every other hazard.
 */
function drawTreeClump(ctx, t, feature) {
  const { p, r } = drawCircle(ctx, t, feature, feature.size, PALETTE.TREE_SHADOW);
  const ring = r >= DETAIL_MIN_RADIUS ? 1 : 0;
  disc(ctx, p.x, p.y, r - ring, woodsFill(ctx));
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

/**
 * The green: a collar of fairway-length grass one pixel wide round the
 * edge, and the fine check of the putting surface inside it. The collar
 * is INSIDE the green's `lieAt` radius — it is green, drawn darker — so
 * the edge of the pale disc is still exactly where a ball stops being on
 * the putting surface.
 */
function drawGreen(ctx, t, centre, radiusYards) {
  const { p, r } = drawCircle(ctx, t, centre, radiusYards, greenFill(ctx));
  if (r < DETAIL_MIN_RADIUS + 2) return;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r - 0.5, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.FAIRWAY_SHADOW;
  ctx.stroke();
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
 * empty plots themselves, with their own placeholder treatment. Pass
 * `{ flag: false }` to leave the flag out and `{ clip: false }` to draw
 * past `rect` (the play screen does both: it zooms, clips to its own view
 * and draws its own flag).
 */
export function drawHole(ctx, hole, rect, { flag = true, clip = true } = {}) {
  if (!hole || !hole.corridor || hole.corridor.length < 2) return;

  const t = computeHoleTransform(hole, rect);

  ctx.save();
  // The play screen draws under a zoom, with its own clip to its own view.
  // Clipping to `rect` there would cut the rough's rounded ends off along
  // a straight line and show woods where lieAt says rough.
  if (clip) {
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
  }

  // Everything beyond the rough band is exactly what lieAt's catch-all
  // returns: trees / out-of-bounds woods.
  fillWoods(ctx, rect);

  drawBand(ctx, t, hole.corridor, hole.corridorWidth + ROUGH_MARGIN * 2, roughFill(ctx));
  drawBand(ctx, t, hole.corridor, hole.corridorWidth, fairwayFill(ctx));

  const gc = greenCentre(hole);
  const gr = greenRadius(hole);
  drawGreen(ctx, t, gc, gr);

  // Hazards paint over the green/fairway/rough wherever they overlap,
  // matching lieAt checking them before anything else.
  for (const f of hole.features) {
    if (f.type === 'pond') drawPondFeature(ctx, t, f);
  }
  for (const f of hole.features) {
    if (f.type === 'bunker') drawBunkerFeature(ctx, t, f);
  }
  for (const f of hole.features) {
    if (f.type === 'trees') drawTreeClump(ctx, t, f);
  }

  drawTeeBox(ctx, t, hole);
  // The play screen draws the hole under a zoom and wants the flag at its
  // ordinary size on top, so it asks for the hole without one.
  if (flag) drawFlag(ctx, t, gc);

  ctx.restore();
}
