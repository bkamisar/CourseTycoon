/**
 * The hole editor.
 *
 * The stat wiring (the point of this task) is pure and lives at the top of
 * this file, with no DOM reference: `liveStats` is `holeStats(hole)`,
 * `minutesFor` is `expectedMinutes(hole, { carts })`, and `deriveReadout`
 * just combines the two. The editor never computes a stat of its own — if a
 * number changes on screen, it is because one of these called into
 * `src/sim/`, not because this file did arithmetic on the hole.
 *
 * `expectedMinutes` simulates twelve groups per call, which is far too slow
 * for once-a-frame use during a drag. The DOM half below calls `liveStats`
 * (cheap) on every pointermove, and `minutesFor` (expensive) only once, on
 * pointerup — showing the previous minutes value while a drag is in
 * progress rather than blanking it, via `deriveReadout`'s `minutesOverride`.
 *
 * The cost of a new hole comes from `BUILD_COSTS` in `src/sim/economy.js`,
 * beside the amenity build costs. It is re-exported here only so existing
 * callers keep working; this file does not decide what anything costs.
 */
import { PALETTE } from '../render/palette.js';
import { drawHole, computeHoleTransform } from '../render/holeView.js';
import { makeHole, holeStats, clamp, GREEN_DIFFICULTY } from '../sim/hole.js';
import { expectedMinutes } from '../sim/round.js';
import { TEMPLATE_NAMES, TEMPLATES } from '../sim/templates.js';
import { pathLength, pointAtDistance } from '../sim/geometry.js';
import { BUILD_COSTS } from '../sim/economy.js';

export const HOLE_BUILD_COST = BUILD_COSTS.hole;

const GREEN_PRESETS = Object.keys(GREEN_DIFFICULTY);
const MIN_CORRIDOR_WIDTH = 22;
const MAX_CORRIDOR_WIDTH = 60;
const CORRIDOR_WIDTH_STEP = 2;

/** Default sizes for a freshly added feature, in yards. */
const NEW_FEATURE_SIZE = { bunker: 9, pond: 20, trees: 18 };

// ---------------------------------------------------------------------
// Pure stat wiring — test-first, see tests/editor.test.js.
// ---------------------------------------------------------------------

/** The cheap stats, safe to recompute on every drag frame. */
export function liveStats(hole) {
  return holeStats(hole);
}

/** The expensive stat. Call only on drag-end, tap, or another discrete edit. */
export function minutesFor(hole, { carts }) {
  return expectedMinutes(hole, { carts });
}

/**
 * Par, Length, Difficulty, Scenery, Minutes, Upkeep/day — the full live
 * readout, built only from the two calls above. `minutesOverride`, when
 * given, is shown instead of recomputing minutes: the stale-but-present
 * value a drag-in-progress should show rather than a blank one.
 */
export function deriveReadout(hole, { carts = false, minutesOverride } = {}) {
  const stats = liveStats(hole);
  const minutes = minutesOverride === undefined ? minutesFor(hole, { carts }) : minutesOverride;
  return {
    par: stats.par,
    length: stats.length,
    difficulty: stats.difficulty,
    scenery: stats.scenery,
    upkeep: stats.upkeep,
    minutes,
  };
}

// ---------------------------------------------------------------------
// Empty-plot template picking.
// ---------------------------------------------------------------------

/** Each of the six templates with its sim-derived par, length, and cost. */
export function templateOptions() {
  return TEMPLATE_NAMES.map((name) => {
    const preview = makeHole(name, 0);
    const stats = holeStats(preview);
    return {
      name,
      label: TEMPLATES[name].name,
      par: stats.par,
      length: stats.length,
      cost: HOLE_BUILD_COST,
    };
  });
}

/**
 * Builds a hole on an empty plot. Returns a new state (does not mutate the
 * one passed in); throws rather than silently doing nothing if the funds,
 * template or plot are invalid, so a UI bug that bypasses its own
 * affordability check cannot produce a free or broken hole.
 */
export function buildHole(state, holeId, templateName) {
  if (!TEMPLATE_NAMES.includes(templateName)) {
    throw new Error(`unknown template: ${templateName}`);
  }
  const holes = state.resort.courses[0].holes;
  const idx = holes.findIndex((h) => h.id === holeId);
  if (idx === -1) throw new Error(`no such hole slot: ${holeId}`);
  if (holes[idx].open) throw new Error(`hole ${holeId} is already built`);
  if (state.money < HOLE_BUILD_COST) {
    throw new Error(`insufficient funds: $${HOLE_BUILD_COST - state.money} short`);
  }

  const next = structuredClone(state);
  next.money -= HOLE_BUILD_COST;
  next.resort.courses[0].holes[idx] = { ...makeHole(templateName, holeId), open: true };
  return next;
}

// ---------------------------------------------------------------------
// DOM: the empty-plot picker, shown as a sheet.
// ---------------------------------------------------------------------

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .template-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px;
      margin-bottom: 10px;
      background: ${PALETTE.OUTLINE};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
    }
    .template-card-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .template-card-title {
      color: ${PALETTE.WHITE};
      font-weight: bold;
    }
    .template-card-stats {
      color: ${PALETTE.UI_LIGHT};
      font-size: 12px;
    }
    .template-card-build {
      min-width: 76px;
      min-height: 44px;
      background: ${PALETTE.FAIRWAY};
      color: ${PALETTE.OUTLINE};
      border: none;
      border-radius: 6px;
      font-family: monospace;
      font-weight: bold;
      font-size: 13px;
    }
    .template-card-build:disabled {
      background: ${PALETTE.UI_LIGHT};
      color: ${PALETTE.OUTLINE};
      opacity: 0.6;
    }
    .template-card-shortfall {
      color: ${PALETTE.ACCENT};
      font-size: 11px;
    }

    .editor-readout {
      position: fixed;
      top: 34px;
      left: 0;
      right: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      padding: 6px 10px;
      background: ${PALETTE.UI_DARK};
      border-bottom: 1px solid ${PALETTE.OUTLINE};
      font-family: monospace;
      font-size: 11px;
      color: ${PALETTE.WHITE};
      pointer-events: none;
      z-index: 8;
    }
    .editor-readout-row {
      display: flex;
      gap: 4px;
      white-space: nowrap;
    }
    .editor-readout-row > span:first-child {
      color: ${PALETTE.UI_LIGHT};
    }
    .editor-readout-row > span:last-child {
      color: ${PALETTE.ACCENT};
      font-weight: bold;
    }

    .editor-toolbar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px;
      background: ${PALETTE.UI_DARK};
      border-top: 1px solid ${PALETTE.OUTLINE};
      z-index: 8;
      pointer-events: auto;
    }
    .editor-btn {
      min-height: 44px;
      min-width: 44px;
      padding: 0 10px;
      background: ${PALETTE.PATH};
      color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.OUTLINE};
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
    }
    .editor-btn--done {
      background: ${PALETTE.FAIRWAY};
      color: ${PALETTE.OUTLINE};
      font-weight: bold;
      margin-left: auto;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Opens a sheet listing the six templates for an empty plot. `onBuilt(next)`
 * receives the new game state (see `buildHole`); the caller decides what to
 * do with it (store it, redraw, switch screens).
 */
export function openTemplatePicker(sheetHost, { state, holeId, onBuilt }) {
  injectStyles();
  sheetHost.open({
    id: `build-hole-${holeId}`,
    title: 'Build a hole',
    render(body) {
      for (const opt of templateOptions()) {
        const card = document.createElement('div');
        card.className = 'template-card';

        const info = document.createElement('div');
        info.className = 'template-card-info';
        const title = document.createElement('div');
        title.className = 'template-card-title';
        title.textContent = opt.label;
        const stats = document.createElement('div');
        stats.className = 'template-card-stats';
        stats.textContent = `Par ${opt.par} · ${Math.round(opt.length)} yd · $${opt.cost.toLocaleString()}`;
        info.append(title, stats);

        const buildBtn = document.createElement('button');
        buildBtn.type = 'button';
        buildBtn.className = 'template-card-build';
        buildBtn.textContent = 'Build';

        const affordable = state.money >= opt.cost;
        if (!affordable) {
          buildBtn.disabled = true;
          const shortfall = document.createElement('div');
          shortfall.className = 'template-card-shortfall';
          shortfall.textContent = `$${(opt.cost - state.money).toLocaleString()} short`;
          info.appendChild(shortfall);
        }

        buildBtn.addEventListener('click', () => {
          const next = buildHole(state, holeId, opt.name);
          sheetHost.dismiss();
          onBuilt(next);
        });

        card.append(info, buildBtn);
        body.appendChild(card);
      }
    },
  });
}

// ---------------------------------------------------------------------
// DOM: the built-hole editor — canvas dragging plus a persistent toolbar.
// ---------------------------------------------------------------------

/**
 * Mounts the interactive editor for one already-built hole. `hole` is
 * mutated directly (a classic direct-manipulation editor), so the caller's
 * own state reference stays in sync without a round trip through this
 * module. Returns `{ render(ctx, rect), destroy() }`; the caller is
 * responsible for calling `render` every frame while the editor screen is
 * active (drawHole itself is cheap — it is only expectedMinutes that must
 * be throttled).
 */
export function mountHoleEditor({ canvas, surface, container, hole, carts = false, onDone }) {
  injectStyles();

  const readoutEl = document.createElement('div');
  readoutEl.className = 'editor-readout';
  const toolbarEl = document.createElement('div');
  toolbarEl.className = 'editor-toolbar';
  container.append(readoutEl, toolbarEl);

  let minutesCache = minutesFor(hole, { carts });
  let currentRect = { x: 0, y: 0, width: surface.width, height: surface.height };

  function updateReadout() {
    const r = deriveReadout(hole, { carts, minutesOverride: minutesCache });
    readoutEl.replaceChildren();
    const rows = [
      ['Par', r.par],
      ['Len', `${Math.round(r.length)}y`],
      ['Diff', Math.round(r.difficulty)],
      ['Scenery', Math.round(r.scenery)],
      ['Min', r.minutes.toFixed(1)],
      ['Upkeep', `$${Math.round(r.upkeep)}`],
    ];
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'editor-readout-row';
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('span');
      v.textContent = String(value);
      row.append(l, v);
      readoutEl.appendChild(row);
    }
  }

  function recomputeMinutes() {
    minutesCache = minutesFor(hole, { carts });
    updateReadout();
  }

  // --- Dragging: bunkers, ponds, trees, and the tee. -----------------
  let dragging = null; // { feature } | { tee: true } | null
  let dragStart = null;
  let dragMoved = false;
  const TAP_THRESHOLD_PX = 4; // internal (180x320) pixels

  function findFeatureAt(world, hitYards) {
    let best = null;
    let bestDist = Infinity;
    for (const f of hole.features) {
      const d = Math.hypot(f.x - world.x, f.y - world.y);
      const reach = Math.max(f.size, hitYards);
      if (d <= reach && d < bestDist) {
        best = f;
        bestDist = d;
      }
    }
    return best;
  }

  function onPointerDown(evt) {
    const canvasPt = surface.toCanvasCoords(evt.clientX, evt.clientY);
    const t = computeHoleTransform(hole, currentRect);
    // Minimum hit radius: ~22 internal px at scale 1 maps to roughly a
    // 44 CSS-px touch target once the integer canvas scale is undone.
    const hitPx = Math.max(6, 22 / Math.max(1, surface.scale));

    const teeScreen = t.toScreen(hole.teePos);
    if (Math.hypot(canvasPt.x - teeScreen.x, canvasPt.y - teeScreen.y) <= hitPx) {
      dragging = { tee: true };
      dragStart = canvasPt;
      dragMoved = false;
      return;
    }

    const world = t.toWorld(canvasPt);
    const hitYards = hitPx / t.scale;
    const feature = findFeatureAt(world, hitYards);
    if (feature) {
      dragging = { feature };
      dragStart = canvasPt;
      dragMoved = false;
    }
  }

  function onPointerMove(evt) {
    if (!dragging) return;
    const canvasPt = surface.toCanvasCoords(evt.clientX, evt.clientY);
    if (Math.hypot(canvasPt.x - dragStart.x, canvasPt.y - dragStart.y) > TAP_THRESHOLD_PX) {
      dragMoved = true;
    }
    const t = computeHoleTransform(hole, currentRect);
    const world = t.toWorld(canvasPt);
    if (dragging.tee) {
      hole.teePos = { x: world.x, y: world.y };
      hole.corridor[0] = { x: world.x, y: world.y };
    } else if (dragging.feature) {
      dragging.feature.x = world.x;
      dragging.feature.y = world.y;
    }
    updateReadout(); // cheap stats only, every frame
  }

  function onPointerUp() {
    if (!dragging) return;
    if (!dragMoved && dragging.feature) {
      // A tap on an existing feature removes it.
      const idx = hole.features.indexOf(dragging.feature);
      if (idx !== -1) hole.features.splice(idx, 1);
    }
    dragging = null;
    dragStart = null;
    dragMoved = false;
    recomputeMinutes(); // expensive stat, only at drag-end / on the tap
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // --- Toolbar: add features, widen/narrow, cycle green, done. ------
  function addFeature(type) {
    const len = pathLength(hole.corridor);
    const mid = pointAtDistance(hole.corridor, len / 2);
    hole.features.push({
      type,
      x: mid.x + 10,
      y: mid.y,
      size: NEW_FEATURE_SIZE[type],
    });
    recomputeMinutes();
  }

  function adjustCorridorWidth(delta) {
    hole.corridorWidth = clamp(hole.corridorWidth + delta, MIN_CORRIDOR_WIDTH, MAX_CORRIDOR_WIDTH);
    recomputeMinutes();
  }

  function cycleGreenPreset() {
    const i = GREEN_PRESETS.indexOf(hole.greenPreset);
    hole.greenPreset = GREEN_PRESETS[(i + 1) % GREEN_PRESETS.length];
    recomputeMinutes();
    renderToolbar();
  }

  function makeButton(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderToolbar() {
    toolbarEl.replaceChildren(
      makeButton('+Bunker', () => addFeature('bunker')),
      makeButton('+Pond', () => addFeature('pond')),
      makeButton('+Trees', () => addFeature('trees')),
      makeButton('Width −', () => adjustCorridorWidth(-CORRIDOR_WIDTH_STEP)),
      makeButton('Width +', () => adjustCorridorWidth(CORRIDOR_WIDTH_STEP)),
      makeButton(`Green: ${hole.greenPreset}`, cycleGreenPreset),
      Object.assign(makeButton('Done', () => onDone?.()), { className: 'editor-btn editor-btn--done' })
    );
  }

  renderToolbar();
  updateReadout();

  function render(ctx, rect) {
    currentRect = rect;
    drawHole(ctx, hole, rect);
  }

  function destroy() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    readoutEl.remove();
    toolbarEl.remove();
  }

  return { render, destroy, updateReadout };
}
