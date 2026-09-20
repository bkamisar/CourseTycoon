/**
 * Draws the resort overview: the nine-plot map the player spends most of
 * their time on. A built hole is drawn as a small version of its actual
 * shape (via `drawHole`, so the overview never diverges from what the hole
 * renderer already draws for it); an empty plot is a dashed outline with a
 * plus, an unambiguous "build here" affordance distinguishable from a
 * built hole even at a glance. Amenities — including the clubhouse itself,
 * which is just another entry in `state.resort.amenities` — are drawn as a
 * cluster of building sprites, kept together rather than scattered near
 * individual hole plots the way they'd have no principled position to
 * anchor to (the simulation gives holes yard coordinates; it gives
 * amenities none).
 *
 * Also returns the tappable regions for every plot and amenity drawn, in
 * the same coordinate space `ctx` was drawn in. This is deliberately the
 * only place that layout maths happens — a later input-handling task reads
 * this list rather than re-deriving hit boxes from scratch.
 */
import { PALETTE } from './palette.js';
import { SPRITES, drawSprite } from './sprites.js';
import { drawHole } from './holeView.js';

const AMENITY_ROW_HEIGHT = 20;
const AMENITY_ICON = 8;
const AMENITY_GAP = 4;

const GRID_COLS = 3;
const GRID_ROWS = 3;
const GRID_PAD = 4;
const CELL_GAP = 4;

function drawAmenityRow(ctx, amenities, { x, y, width }) {
  const regions = [];
  let ax = x + GRID_PAD;
  const ay = y + Math.round((AMENITY_ROW_HEIGHT - AMENITY_ICON) / 2);

  for (const amenity of amenities) {
    const sprite = SPRITES[amenity.type];
    if (!sprite) continue; // unknown amenity type: nothing to draw, nothing tappable
    if (ax + AMENITY_ICON > x + width - GRID_PAD) break; // ran out of row width

    drawSprite(ctx, sprite, ax, ay);
    regions.push({
      kind: 'amenity', id: amenity.type,
      x: ax, y: ay, width: AMENITY_ICON, height: AMENITY_ICON,
    });
    ax += AMENITY_ICON + AMENITY_GAP;
  }

  return regions;
}

function drawEmptyPlot(ctx, rect) {
  ctx.fillStyle = PALETTE.UI_DARK;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.save();
  ctx.strokeStyle = PALETTE.UI_LIGHT;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.width - 3, rect.height - 3);
  ctx.restore();

  const cx = Math.round(rect.x + rect.width / 2);
  const cy = Math.round(rect.y + rect.height / 2);
  const arm = Math.max(3, Math.round(Math.min(rect.width, rect.height) * 0.18));
  ctx.fillStyle = PALETTE.ACCENT;
  ctx.fillRect(cx - arm, cy - 1, arm * 2, 2);
  ctx.fillRect(cx - 1, cy - arm, 2, arm * 2);
}

/**
 * Draws the resort into `{x, y, width, height}` of `ctx` (defaults to the
 * full canvas) and returns the tappable regions for what it drew.
 */
export function drawResort(ctx, state, { x = 0, y = 0, width, height }) {
  const course = state.resort.courses[0];
  const holes = course.holes;
  const amenities = state.resort.amenities;
  const regions = [];

  ctx.fillStyle = PALETTE.UI_DARK;
  ctx.fillRect(x, y, width, height);

  // The amenity row gets its own ground-coloured band (rather than sharing
  // the UI_DARK backdrop) because several building sprites — the clubhouse
  // among them — use UI_DARK for a roof or a door. Left on a UI_DARK
  // background those parts would vanish into it instead of reading as
  // part of the icon.
  ctx.fillStyle = PALETTE.PATH;
  ctx.fillRect(x, y, width, AMENITY_ROW_HEIGHT);

  regions.push(...drawAmenityRow(ctx, amenities, { x, y, width }));

  const gridY0 = y + AMENITY_ROW_HEIGHT + CELL_GAP;
  const gridW = width - GRID_PAD * 2;
  const gridH = height - (gridY0 - y) - GRID_PAD;
  const cellW = Math.floor((gridW - (GRID_COLS - 1) * CELL_GAP) / GRID_COLS);
  const cellH = Math.floor((gridH - (GRID_ROWS - 1) * CELL_GAP) / GRID_ROWS);

  holes.forEach((hole, i) => {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const rect = {
      x: x + GRID_PAD + col * (cellW + CELL_GAP),
      y: gridY0 + row * (cellH + CELL_GAP),
      width: cellW,
      height: cellH,
    };

    if (hole.open) {
      drawHole(ctx, hole, rect);
    } else {
      drawEmptyPlot(ctx, rect);
    }

    regions.push({ kind: 'hole', id: hole.id, ...rect });
  });

  return regions;
}
