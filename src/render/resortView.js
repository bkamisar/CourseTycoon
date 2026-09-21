import { drawPixelText, pixelTextWidth, GLYPH_HEIGHT } from './sprites.js';
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
 * sprites — playtesting found that unreadable at this scale ("the top
 * left bar with sprites... I can't tell what they are at all"). They now
 * live in `src/ui/amenityBar.js`, a DOM strip mounted alongside the HUD,
 * which can afford to spend real pixels on text. This file no longer
 * knows about `state.resort.amenities` at all.
 *
 * Also returns the tappable regions for every hole plot drawn, in the
 * same coordinate space `ctx` was drawn in. This is deliberately the only
 * place that layout maths happens — input-handling reads this list rather
 * than re-deriving hit boxes from scratch.
 */
import { PALETTE } from './palette.js';
import { drawHole } from './holeView.js';
import { holeStats } from '../sim/hole.js';

const GRID_COLS = 3;
const GRID_ROWS = 3;
const GRID_PAD = 4;
const CELL_GAP = 4;

/** Terse "P4 · D52" label, sized to still read at the plot's actual
 * on-screen size (these cells render well under 100px even on a real
 * phone) rather than at whatever size a zoomed-in screenshot suggests. */
const LABEL_FONT = '7px monospace';
const LABEL_PAD_X = 2;
const LABEL_HEIGHT = 9;
const LABEL_MARGIN = 1;

/**
 * A small top-left corner badge, deliberately NOT centred over the plot.
 * Both the flag (drawn at the green, top-centre) and the tee sprite
 * (drawn at the corridor start, bottom-centre) sit on that centreline —
 * an earlier version of this label sat centred at the bottom and drew
 * its chip directly on top of the tee sprite, dimming it into an
 * unreadable smudge sitting in the middle of the text. The corner is
 * always rough/trees background on every template (the corridor never
 * reaches the plot's edges), so a badge there never collides with
 * anything the hole itself draws.
 */
function drawHoleLabel(ctx, hole, rect) {
  const stats = holeStats(hole);
  const text = `P${stats.par} · D${Math.round(stats.difficulty)}`;

  ctx.save();
  // Drawn as bitmap glyphs rather than fillText: canvas text anti-aliases,
  // and this canvas is magnified by a whole number afterwards, so the grey
  // fringe around each letter is magnified too and reads as blur.
  const textWidth = pixelTextWidth(text);
  const labelWidth = Math.min(rect.width - LABEL_MARGIN * 2, textWidth + LABEL_PAD_X * 2);
  const labelX = Math.round(rect.x + LABEL_MARGIN);
  const labelY = Math.round(rect.y + LABEL_MARGIN);

  // A solid (not translucent) chip behind the text — the hole art
  // underneath ranges from dark tree green to pale sand, and white text
  // alone would vanish against the lighter parts of it; a translucent
  // chip would too, over the darkest parts.
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(labelX, labelY, Math.round(labelWidth), LABEL_HEIGHT);

  drawPixelText(
    ctx,
    text,
    labelX + LABEL_PAD_X,
    labelY + Math.round((LABEL_HEIGHT - GLYPH_HEIGHT) / 2),
    PALETTE.WHITE
  );
  ctx.restore();
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

/**
 * Draws one nine.
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

  ctx.fillStyle = PALETTE.UI_DARK;
  ctx.fillRect(x, y, width, height);

  const gridY0 = y + GRID_PAD;
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
      drawHoleLabel(ctx, hole, rect);
    } else {
      drawEmptyPlot(ctx, rect);
    }

    regions.push({ kind: 'hole', id: hole.id, ...rect });
  });

  return regions;
}
