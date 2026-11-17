/**
 * Draws the resort overview: the nine-plot map the player spends most of
 * their time on. A built hole is drawn as a small version of its actual
 * shape (via `drawHole`, so the overview never diverges from what the hole
 * renderer already draws for it), with a small par/difficulty label
 * overlaid so the player can tell what they're looking at without opening
 * the editor; an empty plot is a dashed outline with a plus, an
 * unambiguous "build here" affordance distinguishable from a built hole
 * even at a glance.
 *
 * Amenities used to be drawn here too, as a cluster of unlabelled 8x8
 * sprites — playtesting found that unreadable at this scale. They live in
 * `src/ui/amenityBar.js`, a DOM strip mounted alongside the HUD. This file
 * does not know about `state.resort.amenities` at all.
 *
 * Also returns the tappable regions for every hole plot drawn, in the
 * same coordinate space `ctx` was drawn in. This is deliberately the only
 * place that layout maths happens — input-handling reads this list rather
 * than re-deriving hit boxes from scratch.
 *
 * Since the canvas is drawn at the device's real resolution, nine holes of
 * textured ground every frame would be the slowest thing in the game. The
 * ground does not move, so it is painted once into a layer (`groundFor`)
 * and only what moves — light on the ponds, the flags — is drawn per frame.
 */
import { PALETTE, withAlpha } from './palette.js';
import { drawHole, fillWoods, drawTeeAndFlag, drawPondGlints, computeHoleTransform, roundRect } from './holeView.js';
import { drawForest, plotsKey } from './forest.js';
import { resolution } from './paint.js';
import { holeStats } from '../sim/hole.js';

const GRID_COLS = 3;
const GRID_ROWS = 3;
const GRID_PAD = 4;
const CELL_GAP = 4;

const LABEL_FONT = '700 5.5px system-ui, -apple-system, "Segoe UI", sans-serif';
const LABEL_PAD_X = 2.2;
const LABEL_HEIGHT = 8;
const LABEL_MARGIN = 1.5;

/**
 * A small top-left corner badge, deliberately NOT centred over the plot:
 * the flag (top-centre) and the tee (bottom-centre) sit on that
 * centreline, and an earlier label there sat on top of the tee. The
 * corner is always woods or rough on every template, so a badge there
 * never collides with anything the hole itself draws.
 */
function drawHoleLabel(ctx, hole, rect) {
  const stats = holeStats(hole);
  const text = `P${stats.par} · D${Math.round(stats.difficulty)}`;
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textBaseline = 'middle';
  const width = Math.min(rect.width - LABEL_MARGIN * 2, ctx.measureText(text).width + LABEL_PAD_X * 2);
  const x = rect.x + LABEL_MARGIN;
  const y = rect.y + LABEL_MARGIN;
  // Solid enough to read over pale sand and dark woods alike.
  ctx.beginPath();
  roundRect(ctx, x, y, width, LABEL_HEIGHT, 2);
  ctx.fillStyle = withAlpha('OUTLINE', 0.78);
  ctx.fill();
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fillText(text, x + LABEL_PAD_X, y + LABEL_HEIGHT / 2 + 0.3);
  ctx.restore();
}

function drawEmptyPlot(ctx, rect) {
  // Unbuilt land is woods like the rest of the map — the dashed outline
  // and the plus are what say "build here", on a dark plate so they read
  // against the trees.
  const plate = Math.max(9, Math.min(rect.width, rect.height) * 0.5);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cx - plate / 2, cy - plate / 2, plate, plate, 3);
  ctx.fillStyle = withAlpha('UI_DARK', 0.85);
  ctx.fill();

  ctx.beginPath();
  roundRect(ctx, rect.x + 1.5, rect.y + 1.5, rect.width - 3, rect.height - 3, 3);
  ctx.strokeStyle = withAlpha('UI_LIGHT', 0.8);
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 2]);
  ctx.stroke();
  ctx.setLineDash([]);

  const arm = Math.max(3, Math.min(rect.width, rect.height) * 0.16);
  ctx.strokeStyle = PALETTE.ACCENT;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.restore();
}

/** Holes per screen. The grid is 3x3 and a golf course comes in nines, so
 * these are the same number for the same reason. */
export const HOLES_PER_NINE = GRID_COLS * GRID_ROWS;

/**
 * Whether this resort has anything on the back nine yet. Until it does,
 * there is nothing to toggle to and the control stays hidden — Act I
 * should not carry Act II's furniture.
 */
export function hasBackNine(state) {
  // Tolerates no state at all. `syncScreenChrome` runs on the start
  // screen, before a game is loaded, and an unguarded read here threw and
  // took the entire chrome sync down with it — every test passed, and the
  // page was broken the moment it opened.
  const holes = state?.resort?.courses?.[0]?.holes;
  if (!Array.isArray(holes)) return false;
  return holes
    .slice(HOLES_PER_NINE)
    .some((h) => h.corridor?.length > 1);
}

/** Painted ground layers, newest last: the front and back nines. */
const grounds = new Map();
const MAX_GROUNDS = 3;

/**
 * The still ground of the whole map — forest floor and every built hole's
 * terrain, without the light on the ponds, the tees or the flags — painted
 * once at the device's resolution and kept until a hole changes.
 */
function groundFor(area, plots) {
  const res = resolution();
  const key = `${res}|${area.x},${area.y},${area.width},${area.height}|${plotsKey(plots)}`;
  let ground = grounds.get(key);
  if (ground) return ground;
  ground = document.createElement('canvas');
  ground.width = Math.max(1, Math.round(area.width * res));
  ground.height = Math.max(1, Math.round(area.height * res));
  const c = ground.getContext('2d');
  c.setTransform(res, 0, 0, res, -area.x * res, -area.y * res);
  fillWoods(c, area);
  for (const { hole, rect } of plots) {
    drawHole(c, hole, rect, { forest: false, tee: false, flag: false, glints: false });
  }
  grounds.set(key, ground);
  if (grounds.size > MAX_GROUNDS) grounds.delete(grounds.keys().next().value);
  return ground;
}

/**
 * Draws one nine into `{x, y, width, height}` of `ctx` and returns the
 * tappable regions for what it drew.
 *
 * Eighteen holes will not fit this grid: at 180x320 an 18-cell layout
 * halves the height of every hole and none of them read. A course comes
 * in nines and a scorecard has two sides, so the map does too.
 */
export function drawResort(ctx, state, { x = 0, y = 0, width, height, nine = 0 }) {
  const course = state.resort.courses[0];
  const all = course.holes;
  const offset = nine * HOLES_PER_NINE;
  const holes = all.slice(offset, offset + HOLES_PER_NINE);
  const regions = [];
  const area = { x, y, width, height };

  const gridY0 = y + GRID_PAD;
  const gridW = width - GRID_PAD * 2;
  const gridH = height - (gridY0 - y) - GRID_PAD;
  const cellW = Math.floor((gridW - (GRID_COLS - 1) * CELL_GAP) / GRID_COLS);
  const cellH = Math.floor((gridH - (GRID_ROWS - 1) * CELL_GAP) / GRID_ROWS);

  const plots = [];
  holes.forEach((hole, i) => {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const rect = {
      x: x + GRID_PAD + col * (cellW + CELL_GAP),
      y: gridY0 + row * (cellH + CELL_GAP),
      width: cellW,
      height: cellH,
    };
    regions.push({ kind: 'hole', id: hole.id, ...rect });
    if (hole.open && hole.corridor?.length > 1) plots.push({ hole, rect, t: computeHoleTransform(hole, rect) });
  });

  // 1. The ground: one woodland floor with every built hole cut into it.
  ctx.drawImage(groundFor(area, plots), x, y, width, height);

  // 2. One forest over the whole map: across the gaps, over the unbuilt
  // plots, and up to the edge of every hole's rough — never over it,
  // because a tree is only planted where that hole's own `lieAt` says
  // trees. A tree standing half in a plot and half in the gap beside it
  // is one tree, not two halves that happen to meet.
  drawForest(ctx, { area, plots });

  // 3. What moves, and what sits on top of the trees.
  for (const { hole, rect, t } of plots) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    drawPondGlints(ctx, hole, rect, t);
    ctx.restore();
  }
  holes.forEach((hole, i) => {
    const rect = regions[i];
    if (hole.open) {
      drawTeeAndFlag(ctx, hole, rect);
      drawHoleLabel(ctx, hole, rect);
    } else {
      drawEmptyPlot(ctx, rect);
    }
  });

  return regions;
}
