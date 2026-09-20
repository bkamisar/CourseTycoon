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
import { topChromeOverlapPx, bottomChromeOverlapPx } from '../render/pixel.js';
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

/** Default sizes for a freshly added feature, in yards. BUILD_COSTS prices
 * a hazard for this size — resizing scales that price by area, see
 * `sizedFeatureCost` below. */
export const NEW_FEATURE_SIZE = { bunker: 9, pond: 20, trees: 18 };

/** Toolbar label for each hazard type. */
const FEATURE_LABEL = { bunker: 'Bunker', pond: 'Pond', trees: 'Trees' };

/** How far one tap of Size +/- moves a hazard's radius, in yards. */
const SIZE_STEP_YARDS = 2;

/** Sane size bounds, as a multiple of NEW_FEATURE_SIZE's radius for that
 * type: shrinking can't make a hazard vanish to nothing, and growing is
 * capped at a fixed multiple of its own normal size rather than left
 * unbounded, so no hazard can be dragged out into something that
 * dominates the hole regardless of how much money is thrown at it. */
const MIN_SIZE_FACTOR = 0.4;
const MAX_SIZE_FACTOR = 2;

// ---------------------------------------------------------------------
// Pure charge/refund arithmetic — test-first, see tests/editor.test.js.
// Hazards and the green preset cost money to add or upgrade; removing a
// feature refunds half of what it cost, rounded down. That refund is the
// whole reason tap-to-remove needs no confirmation dialog: a misclick
// costs you half, never everything.
// ---------------------------------------------------------------------

/** What adding one hazard of `type` (bunker/pond/trees) costs. */
export function featureCost(type) {
  return BUILD_COSTS[type];
}

/** What removing a hazard that cost `cost` to add refunds — half, rounded down. */
export function refundFor(cost) {
  return Math.floor(cost / 2);
}

/**
 * What cycling the green preset from `fromPreset` to `toPreset` costs.
 * Only charges when the new preset is strictly harder than the old one —
 * cycling down to an easier preset is free, never refunded, so there is no
 * way to profit by cycling forward and back.
 */
export function greenCycleCost(fromPreset, toPreset) {
  return GREEN_DIFFICULTY[toPreset] > GREEN_DIFFICULTY[fromPreset] ? BUILD_COSTS.greenUpgrade : 0;
}

/**
 * The min/max size (radius, in yards) a hazard of `type` can be resized
 * to, as a fixed multiple of the size it starts at (`NEW_FEATURE_SIZE`).
 * Every hazard type gets the same proportional headroom to shrink or
 * grow regardless of its own default footprint.
 */
export function sizeBounds(type) {
  const base = NEW_FEATURE_SIZE[type];
  return {
    min: Math.round(base * MIN_SIZE_FACTOR),
    max: Math.round(base * MAX_SIZE_FACTOR),
  };
}

/**
 * What a hazard of `type` is worth at `size` yards: `BUILD_COSTS[type]`
 * prices it for `NEW_FEATURE_SIZE[type]`, and a circle's area scales with
 * the square of its radius, so this scales the base price by
 * `(size / defaultSize) ** 2` — double the radius, quadruple the price,
 * matching how much more hazard is actually there.
 */
export function sizedFeatureCost(type, size) {
  const base = NEW_FEATURE_SIZE[type];
  return Math.round(BUILD_COSTS[type] * (size * size) / (base * base));
}

/**
 * The signed charge to resize one hazard of `type` from `fromSize` to
 * `toSize` yards. Positive means money leaves the player: growing a
 * hazard costs the full area-scaled difference, the same rate buying it
 * at that size outright would. Negative means money comes back: shrinking
 * refunds half of the area-scaled difference, rounded down — the same
 * half-back rule `refundFor` already applies to removing a hazard
 * outright, so resizing up and back down can never turn a profit either.
 */
export function resizeFeatureCost(type, fromSize, toSize) {
  const fromCost = sizedFeatureCost(type, fromSize);
  const toCost = sizedFeatureCost(type, toSize);
  if (toCost >= fromCost) return toCost - fromCost;
  return -Math.floor((fromCost - toCost) / 2);
}

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

    /*
     * The readout and the toolbar are docked together at the bottom, as one
     * fixed block, rather than the readout floating at a hand-picked "top:
     * 34px" the way it used to. That old value assumed the canvas always
     * left a tall gap below the HUD bar to float in — true only when the
     * full 375x812 viewport is actually available. A real phone's browser
     * chrome (address bar, home-indicator bar) eats into that height, and
     * because this page disables scrolling, that chrome never auto-hides
     * the way it would on an ordinary page — so the gap the bar depended on
     * shrinks or vanishes, and the bar ends up sitting on top of the green
     * it is supposed to describe instead of above it. Docking it to the
     * bottom, and having render() below inset the hole's drawing rect by
     * this dock's real measured height, means the hole is guaranteed clear
     * of it no matter how much of the viewport the browser chrome takes.
     */
    .editor-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      z-index: 8;
    }
    .editor-readout {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      padding: 6px 10px;
      background: ${PALETTE.UI_DARK};
      border-top: 1px solid ${PALETTE.OUTLINE};
      font-family: monospace;
      font-size: 11px;
      color: ${PALETTE.WHITE};
      pointer-events: none;
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
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px;
      background: ${PALETTE.UI_DARK};
      border-top: 1px solid ${PALETTE.OUTLINE};
      pointer-events: auto;
    }
    .editor-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 44px;
      min-width: 44px;
      padding: 4px 10px;
      background: ${PALETTE.PATH};
      color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.OUTLINE};
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.2;
    }
    .editor-btn:disabled {
      background: ${PALETTE.UI_LIGHT};
      color: ${PALETTE.OUTLINE};
      opacity: 0.6;
    }
    .editor-btn-sub {
      font-size: 9px;
      font-weight: normal;
      color: ${PALETTE.ACCENT};
    }
    .editor-btn:disabled .editor-btn-sub {
      color: ${PALETTE.OUTLINE};
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
 * module. `state` is the same live game state the caller holds — spending
 * on a hazard or a green upgrade debits `state.money` directly, the same
 * direct-mutation contract `hole` already has, so the caller's money is
 * never out of sync either. Returns `{ render(ctx, rect), destroy() }`;
 * the caller is responsible for calling `render` every frame while the
 * editor screen is active (drawHole itself is cheap — it is only
 * expectedMinutes that must be throttled).
 */
export function mountHoleEditor({ canvas, surface, container, state, hole, carts = false, onDone }) {
  injectStyles();

  const dockEl = document.createElement('div');
  dockEl.className = 'editor-dock';
  const readoutEl = document.createElement('div');
  readoutEl.className = 'editor-readout';
  const toolbarEl = document.createElement('div');
  toolbarEl.className = 'editor-toolbar';
  dockEl.append(readoutEl, toolbarEl);
  container.append(dockEl);

  // The HUD bar and the amenity strip stack together inside one
  // `.top-chrome` wrapper (see main.js) — measuring the wrapper rather
  // than `.hud-bar` alone means this stays correct if that stack's
  // content ever grows another row, with no second hardcoded offset to
  // keep in sync.
  const topChromeEl = container.querySelector('.top-chrome') ?? container.querySelector('.hud-bar');

  let minutesCache = minutesFor(hole, { carts });
  let currentRect = { x: 0, y: 0, width: surface.width, height: surface.height };
  // Money spent (minus refunds) on this hole so far this editing session —
  // plain bookkeeping on BUILD_COSTS figures already read from the sim, not
  // a game outcome, so it is tracked here rather than inside deriveReadout.
  let sessionSpend = 0;
  // The hazard Size +/- act on, if any. Selected by successfully dragging
  // a hazard (a tap that moves it) rather than by tapping it in place —
  // a plain tap already has a job, removing the hazard, so reusing drag
  // (a gesture the player is already using to place hazards) avoids
  // inventing a second tap meaning that would collide with the first.
  let selectedFeature = null;
  // How many INTERNAL canvas px of real overlap the fixed chrome around
  // the canvas actually has (HUD/amenity stack above, the readout+toolbar
  // dock below) — re-measured whenever either changes size. `render()`
  // insets the hole's drawing rect by these so the hole is never drawn
  // underneath them. This is genuine overlap (`topChromeOverlapPx` /
  // `bottomChromeOverlapPx`), not just those elements' own height: on a
  // tall viewport the canvas can be centred well clear of the HUD, and
  // insetting by its full height regardless would carve a dead gap above
  // the hole instead of actually clearing anything.
  let hudChromePx = 0;
  let dockChromePx = 0;

  function remeasureChrome() {
    hudChromePx = topChromeOverlapPx(canvas, topChromeEl, surface.scale);
    dockChromePx = bottomChromeOverlapPx(canvas, dockEl, surface.scale);
  }

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
      ['Spent', `$${sessionSpend.toLocaleString()}`],
    ];
    if (selectedFeature) {
      rows.push([FEATURE_LABEL[selectedFeature.type], `${Math.round(selectedFeature.size)}y`]);
    }
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
    remeasureChrome();
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
      return;
    }

    // A tap that hits neither the tee nor a hazard deselects, so the
    // player has a way to back out of Size +/- without having to drag
    // something else first.
    if (selectedFeature) {
      selectedFeature = null;
      renderToolbar();
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
      // A tap on an existing feature removes it and refunds half its cost,
      // rounded down — this, not a confirmation dialog, is what makes a
      // misclick safe: it costs half, never everything.
      const idx = hole.features.indexOf(dragging.feature);
      if (idx !== -1) {
        const [removed] = hole.features.splice(idx, 1);
        const refund = refundFor(featureCost(removed.type));
        state.money += refund;
        sessionSpend -= refund;
        if (selectedFeature === removed) selectedFeature = null;
        renderToolbar();
      }
    } else if (dragging.feature) {
      // A drag that actually moved a hazard selects it, so Size +/- has
      // something to act on without a separate selection gesture.
      selectedFeature = dragging.feature;
      renderToolbar();
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
    const cost = featureCost(type);
    if (state.money < cost) return; // belt and suspenders — the button is disabled too
    state.money -= cost;
    sessionSpend += cost;
    const len = pathLength(hole.corridor);
    const mid = pointAtDistance(hole.corridor, len / 2);
    const feature = {
      type,
      x: mid.x + 10,
      y: mid.y,
      size: NEW_FEATURE_SIZE[type],
    };
    hole.features.push(feature);
    // Selecting what was just placed means Size +/- is immediately
    // available for it, with no extra drag needed first.
    selectedFeature = feature;
    recomputeMinutes();
    renderToolbar(); // affordability of the remaining features may have changed
  }

  /** What Size +/- would do to the selected hazard: the size it would end
   * up at and the signed charge, or null if there is no selection or the
   * hazard is already at that bound (nothing to preview). */
  function previewResize(deltaYards) {
    if (!selectedFeature) return null;
    const bounds = sizeBounds(selectedFeature.type);
    const toSize = clamp(selectedFeature.size + deltaYards, bounds.min, bounds.max);
    if (toSize === selectedFeature.size) return null;
    return { toSize, charge: resizeFeatureCost(selectedFeature.type, selectedFeature.size, toSize) };
  }

  function applyResize(deltaYards) {
    const preview = previewResize(deltaYards);
    if (!preview) return;
    if (preview.charge > 0 && state.money < preview.charge) return; // belt and suspenders
    state.money -= preview.charge;
    sessionSpend += preview.charge;
    selectedFeature.size = preview.toSize;
    recomputeMinutes();
    renderToolbar();
  }

  /** Sublabel for a Size +/- button. */
  function sizeSub(preview, { grow }) {
    if (!preview) return selectedFeature ? (grow ? 'max size' : 'min size') : 'drag one first';
    if (grow) return costSub(preview.charge);
    return `+$${(-preview.charge).toLocaleString()} back`;
  }

  function adjustCorridorWidth(delta) {
    hole.corridorWidth = clamp(hole.corridorWidth + delta, MIN_CORRIDOR_WIDTH, MAX_CORRIDOR_WIDTH);
    recomputeMinutes();
  }

  function nextGreenPreset() {
    const i = GREEN_PRESETS.indexOf(hole.greenPreset);
    return GREEN_PRESETS[(i + 1) % GREEN_PRESETS.length];
  }

  function cycleGreenPreset() {
    const next = nextGreenPreset();
    const cost = greenCycleCost(hole.greenPreset, next);
    if (cost > 0 && state.money < cost) return; // belt and suspenders
    state.money -= cost;
    sessionSpend += cost;
    hole.greenPreset = next;
    recomputeMinutes();
    renderToolbar();
  }

  /** `sub`, when given, is a small second line — a price or a shortfall. */
  function makeButton(label, onClick, { disabled = false, sub } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-btn';
    btn.disabled = disabled;
    const top = document.createElement('span');
    top.textContent = label;
    btn.appendChild(top);
    if (sub) {
      const bottom = document.createElement('span');
      bottom.className = 'editor-btn-sub';
      bottom.textContent = sub;
      btn.appendChild(bottom);
    }
    btn.addEventListener('click', onClick);
    return btn;
  }

  /** Sublabel for an add-hazard button: its price, or the shortfall if the
   * player cannot afford it — matching how the template picker shows it. */
  function costSub(cost) {
    return state.money >= cost
      ? `$${cost.toLocaleString()}`
      : `$${(cost - state.money).toLocaleString()} short`;
  }

  function renderToolbar() {
    const hazardButtons = ['bunker', 'pond', 'trees'].map((type) => {
      const cost = featureCost(type);
      return makeButton(`+${FEATURE_LABEL[type]}`, () => addFeature(type), {
        disabled: state.money < cost,
        sub: costSub(cost),
      });
    });

    const nextPreset = nextGreenPreset();
    const greenCost = greenCycleCost(hole.greenPreset, nextPreset);
    const greenButton = makeButton(`Green: ${hole.greenPreset}`, cycleGreenPreset, {
      disabled: greenCost > 0 && state.money < greenCost,
      sub: greenCost > 0 ? costSub(greenCost) : undefined,
    });

    const growPreview = previewResize(SIZE_STEP_YARDS);
    const shrinkPreview = previewResize(-SIZE_STEP_YARDS);
    const growButton = makeButton('Size +', () => applyResize(SIZE_STEP_YARDS), {
      disabled: !growPreview || (growPreview.charge > 0 && state.money < growPreview.charge),
      sub: sizeSub(growPreview, { grow: true }),
    });
    const shrinkButton = makeButton('Size −', () => applyResize(-SIZE_STEP_YARDS), {
      disabled: !shrinkPreview,
      sub: sizeSub(shrinkPreview, { grow: false }),
    });

    toolbarEl.replaceChildren(
      ...hazardButtons,
      shrinkButton,
      growButton,
      makeButton('Width −', () => adjustCorridorWidth(-CORRIDOR_WIDTH_STEP)),
      makeButton('Width +', () => adjustCorridorWidth(CORRIDOR_WIDTH_STEP)),
      greenButton,
      Object.assign(makeButton('Done', () => onDone?.()), { className: 'editor-btn editor-btn--done' })
    );
    remeasureChrome();
  }

  renderToolbar();
  updateReadout();

  function render(ctx, rect) {
    // Inset the drawing rect by the real, measured overlap of the fixed
    // chrome around the canvas (the HUD above, the readout+toolbar dock
    // below) so the hole is always drawn clear of both — see the comment
    // on `.editor-dock` above for why a hand-picked pixel offset isn't
    // safe to assume here. hudChromePx/dockChromePx are already internal
    // canvas px (remeasureChrome does the scale division), not CSS px.
    const height = Math.max(10, rect.height - hudChromePx - dockChromePx);
    const insetRect = { x: rect.x, y: rect.y + hudChromePx, width: rect.width, height };
    currentRect = insetRect;
    // drawHole only paints inside insetRect, which is smaller than the full
    // canvas rect whenever the chrome above/below is non-zero — so the
    // margin left outside it must be cleared explicitly, or it keeps
    // showing whatever the previous frame (the overview map, most likely)
    // last drew there.
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    drawHole(ctx, hole, insetRect);

    // A ring around the hazard Size +/- would act on — otherwise
    // selection is invisible on the canvas itself and only legible from
    // the readout row below.
    if (selectedFeature && hole.features.includes(selectedFeature)) {
      const t = computeHoleTransform(hole, insetRect);
      const p = t.toScreen(selectedFeature);
      const r = Math.max(1, selectedFeature.size * t.scale);
      ctx.save();
      ctx.strokeStyle = PALETTE.ACCENT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function destroy() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    dockEl.remove();
  }

  return { render, destroy, updateReadout };
}
