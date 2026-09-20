/**
 * The game. Everything above this file is parts on a bench; this is where
 * they become a loop a player can actually sit through: overview -> open
 * the day -> watch it play out -> read the report -> back to overview.
 *
 * Mode switching lives HERE and nowhere else -- every other module either
 * draws a screen or computes a number for one, but only this file decides
 * which screen is showing and when to move to the next.
 */
import { createSurface, topChromeOverlapPx, bottomChromeOverlapPx } from './render/pixel.js';
import { PALETTE } from './render/palette.js';
import { drawResort } from './render/resortView.js';
import { computeTokens, computeEffects, drawTokens, drawEffects } from './render/tokens.js';
import { newGame, openHoles } from './sim/state.js';
import { runDay } from './sim/day.js';
import { holeStats } from './sim/hole.js';
import { createClock, PLAYBACK_SPEEDS } from './play/clock.js';
import { mountHud } from './ui/hud.js';
import { mountAmenityBar } from './ui/amenityBar.js';
import { mountSheetHost } from './ui/sheet.js';
import { createScreenRouter } from './ui/screens.js';
import { mountHoleEditor, openTemplatePicker } from './ui/editor.js';
import { openBuildSheet, openStaffSheet, openPricingSheet } from './ui/panels.js';
import { openGlossarySheet } from './ui/glossary.js';
import { mountReport } from './ui/report.js';
import { createSaveAdapter } from './save/adapter.js';
import { createLocalBackend } from './save/local.js';
import { createChiptune, mountMuteToggle } from './audio/chiptune.js';

document.body.style.backgroundColor = PALETTE.OUTLINE;

// ---------------------------------------------------------------------
// Boot: continue a save if one exists, otherwise start fresh. The seed for
// a brand new game comes from wall-clock time -- fine here, since this is
// outside the simulation and the seed is then stored in state, exactly as
// the rest of the sim expects: every draw from here on is deterministic.
// ---------------------------------------------------------------------

const adapter = createSaveAdapter();
adapter.registerBackend(createLocalBackend());

let state = adapter.load();
if (!state) {
  state = newGame(Date.now() & 0x7fffffff);
}

// ---------------------------------------------------------------------
// DOM shell
// ---------------------------------------------------------------------

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const surface = createSurface(canvas, { width: 180, height: 320 });

const router = createScreenRouter('overview');

// The HUD bar and the amenity strip stack in normal document flow inside
// one shared fixed-at-top wrapper, rather than each hand-placing itself
// with its own "top: N px" -- the exact hardcoded-offset trap a previous
// pass got caught by (see the comment on .editor-dock in src/ui/editor.js).
// Stacking them in flow means the amenity strip always sits directly under
// the HUD no matter how the HUD's own height changes.
const topChrome = document.createElement('div');
topChrome.className = 'top-chrome';
topChrome.style.cssText =
  'position:fixed;top:0;left:0;right:0;z-index:10;display:flex;flex-direction:column;pointer-events:none;';
uiRoot.appendChild(topChrome);

const hud = mountHud(topChrome);
const amenityBar = mountAmenityBar(topChrome, { onTap: () => onAmenityTap() });
const sheets = mountSheetHost(uiRoot);
const chiptune = createChiptune();

const reportRoot = document.createElement('div');
document.body.appendChild(reportRoot);

injectToolbarStyles();

// ---------------------------------------------------------------------
// State that only lives here: which screen is active, what the current
// hole editor session is, and the result of the day currently in
// playback/report (the resolved state a "Continue" tap will commit to
// `state`).
// ---------------------------------------------------------------------

let regions = [];
let activeEditor = null;
let dayResult = null; // { state, report, timeline } | null
let clock = null;
let lastFrameTime = null;

/**
 * The rect `drawResort` should draw into, inset by how much of the canvas
 * the fixed DOM chrome above (`topChrome`: the HUD bar and the amenity
 * strip stacked) and below (`bottomToolbarEl`, whichever toolbar is
 * showing) actually overlaps — real overlap (`topChromeOverlapPx` /
 * `bottomChromeOverlapPx`), not just those elements' own height. Skipping
 * this entirely on the overview screen was a bug the amenity strip
 * exposed: on a short viewport (the 390x664 case a real phone's browser
 * chrome forces) the combined HUD+amenity bar covers enough of the
 * canvas to hide each hole's par/difficulty label, which sits right at
 * the top of its plot.
 */
function insetRectForChrome(bottomToolbarEl) {
  const scale = surface.scale;
  const topPx = topChromeOverlapPx(canvas, topChrome, scale);
  const bottomPx = bottomChromeOverlapPx(canvas, bottomToolbarEl, scale);
  const height = Math.max(10, surface.height - topPx - bottomPx);
  return { x: 0, y: topPx, width: surface.width, height };
}

// --- Overview -----------------------------------------------------------

function drawOverview() {
  const { ctx, width, height } = surface;
  // The margin outside the inset rect sits behind opaque fixed chrome and
  // is never actually seen, but it is cleared anyway rather than left
  // showing whatever the previous frame drew there -- see the identical
  // comment on render() in src/ui/editor.js for why that matters.
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(0, 0, width, height);
  regions = drawResort(ctx, state, insetRectForChrome(overviewToolbar));
  hud.update(state);
  amenityBar.update(state);
}

function stopEditorLoop() {
  activeEditor?.destroy();
  activeEditor = null;
}

function openEditorFor(holeId) {
  stopEditorLoop();
  router.go('editor');
  const hole = state.resort.courses[0].holes.find((h) => h.id === holeId);
  activeEditor = mountHoleEditor({
    canvas,
    surface,
    container: uiRoot,
    state,
    hole,
    carts: state.resort.amenities.some((a) => a.type === 'cartBarn'),
    onDone: () => {
      stopEditorLoop();
      router.go('overview');
    },
  });
}

function onHoleTap(holeId) {
  const hole = state.resort.courses[0].holes.find((h) => h.id === holeId);
  if (hole.open) {
    openEditorFor(holeId);
  } else {
    openTemplatePicker(sheets, {
      state,
      holeId,
      onBuilt: (next) => {
        state = next;
        drawOverview();
      },
    });
  }
}

function onAmenityTap() {
  openBuildSheet(sheets, {
    state,
    onChange: (next) => {
      state = next;
      drawOverview();
    },
  });
}

canvas.addEventListener('click', (evt) => {
  if (router.current !== 'overview') return;
  const { x, y } = surface.toCanvasCoords(evt.clientX, evt.clientY);
  const hit = regions.find((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  if (!hit) return;
  if (hit.kind === 'hole') onHoleTap(hit.id);
  else onAmenityTap();
});

// --- Overview toolbar: Amenities / Staff / Pricing, and the big "Open the
// day" button. The map's amenity row already opens the amenities sheet on
// a direct tap; this toolbar is what gives Staff and Pricing an affordance
// at all (the sim gives them no position on the map to anchor an icon to),
// and it is where a day actually begins. Named "Amenities" rather than
// "Build" so it stops sharing a word with the actual way you build a hole
// (tapping an empty plot, see openTemplatePicker's "Build a hole" sheet) —
// two different meanings of "build" on one screen read as confusing on
// first play.
// ---------------------------------------------------------------------

const overviewToolbar = document.createElement('div');
overviewToolbar.className = 'ov-toolbar';

function toolbarButton(label, onClick, { primary = false } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = primary ? 'ov-btn ov-btn--primary' : 'ov-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

overviewToolbar.append(
  toolbarButton('Amenities', () => onAmenityTap()),
  toolbarButton('Staff', () =>
    openStaffSheet(sheets, {
      state,
      onChange: (next) => {
        state = next;
        drawOverview();
      },
    })
  ),
  toolbarButton('Pricing', () =>
    openPricingSheet(sheets, {
      state,
      onChange: (next) => {
        state = next;
        drawOverview();
      },
    })
  ),
  Object.assign(toolbarButton('?', () => openGlossarySheet(sheets)), { className: 'ov-btn ov-btn--icon' }),
  toolbarButton('Open the day', () => openDay(), { primary: true })
);
const overviewMute = mountMuteToggle(overviewToolbar, chiptune);
uiRoot.appendChild(overviewToolbar);

// --- Playback controls: play/pause, 1x/4x/16x, skip. Task 8 deliberately
// left these as bare DOM affordances for this task to wire up to a real
// clock.
// ---------------------------------------------------------------------

const playbackToolbar = document.createElement('div');
playbackToolbar.className = 'ov-toolbar';

const playPauseBtn = toolbarButton('Pause', () => togglePlayPause());
const speedButtons = PLAYBACK_SPEEDS.map((speed) =>
  toolbarButton(`${speed}x`, () => setSpeed(speed))
);
const skipBtn = toolbarButton('Skip >>', () => skipToReport());
playbackToolbar.append(playPauseBtn, ...speedButtons, skipBtn);
const playbackMute = mountMuteToggle(playbackToolbar, chiptune);
uiRoot.appendChild(playbackToolbar);

function togglePlayPause() {
  if (!clock) return;
  if (clock.playing) clock.pause();
  else clock.play();
  updatePlaybackToolbar();
}

function setSpeed(speed) {
  if (!clock) return;
  clock.setSpeed(speed);
  updatePlaybackToolbar();
}

function skipToReport() {
  if (!clock) return;
  clock.skip();
  enterReport();
}

function updatePlaybackToolbar() {
  if (!clock) return;
  playPauseBtn.textContent = clock.playing ? 'Pause' : 'Play';
  speedButtons.forEach((btn, i) => {
    btn.classList.toggle('ov-btn--active', PLAYBACK_SPEEDS[i] === clock.speed);
  });
}

// --- Screen visibility: toolbars and the report root show only on their
// own screen. Canvas-drawn screens (overview/editor/playback) share one
// canvas, so there is nothing to toggle for them beyond what the frame
// loop below already draws only while that screen is active.
// ---------------------------------------------------------------------

function syncScreenChrome() {
  overviewToolbar.hidden = router.current !== 'overview';
  playbackToolbar.hidden = router.current !== 'playback';
  reportRoot.hidden = router.current !== 'report';
  overviewMute.update();
  playbackMute.update();
}
router.subscribe(syncScreenChrome);
syncScreenChrome();

// ---------------------------------------------------------------------
// Opening the day: runDay is the only place a day's outcome is decided.
// The seed is derived from state the player already committed to (their
// stored seed and the day number) -- deterministic, not wall-clock, so it
// never depends on anything outside the saved game.
// ---------------------------------------------------------------------

function openDay() {
  // Belt and suspenders: a sheet's own backdrop blocks taps on anything
  // underneath it, so this should be unreachable via real touch input --
  // but making certain costs nothing, and a sheet stuck open over playback
  // would otherwise be a confusing way to get stuck.
  sheets.dismissAll();
  const seed = state.seed * 1000 + state.day;
  dayResult = runDay(state, seed);
  clock = createClock({ speed: 1 });
  clock.play();
  router.go('playback');
  updatePlaybackToolbar();
  chiptune.playMusic('playback');
}

/** Plays a bounded number of sound effects for timeline events that fell
 * between the last processed minute and now -- bounded so a big jump in
 * simulated time (16x, or many groups finishing near the same minute)
 * cannot turn into a wall of overlapping sound. */
function playAudioForWindow(fromMinute, toMinute) {
  if (chiptune.muted || !dayResult) return;
  const holes = openHoles(dayResult.state);
  const holesById = new Map(holes.map((h) => [h.id, h]));
  let toks = 0;
  let splashes = 0;
  const MAX_PER_FRAME = 3;

  for (const e of dayResult.timeline) {
    if (e.minute <= fromMinute || e.minute > toMinute) continue;
    if (e.type === 'shot' && toks < MAX_PER_FRAME) {
      chiptune.sfx.tok();
      toks++;
    } else if (e.type === 'water' && splashes < MAX_PER_FRAME) {
      chiptune.sfx.splash();
      splashes++;
    } else if (e.type === 'holed') {
      const hole = holesById.get(e.holeId);
      if (hole && e.strokes <= holeStats(hole).par - 1) chiptune.sfx.cheer();
    }
  }
}

function drawPlayback() {
  const { ctx, width, height } = surface;
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(0, 0, width, height);
  regions = drawResort(ctx, dayResult.state, insetRectForChrome(playbackToolbar));
  const holes = openHoles(dayResult.state);
  const minute = clock.minute;
  drawTokens(ctx, computeTokens(dayResult.timeline, holes, regions, minute));
  drawEffects(ctx, computeEffects(dayResult.timeline, holes, regions, minute));
  hud.update(state); // yesterday's figures -- today's are still a secret until the report
  amenityBar.update(state);
}

function enterReport() {
  chiptune.stopMusic();
  chiptune.sfx.cashRegister();
  router.go('report');
  mountReport(reportRoot, {
    state: dayResult.state,
    report: dayResult.report,
    onContinue: onReportContinue,
  });
}

function onReportContinue() {
  state = dayResult.state;
  dayResult = null;
  clock = null;
  const saved = adapter.save(state);
  if (!saved) {
    // Never silently lose a day's progress -- if every backend failed,
    // at least say so rather than pretending the save happened.
    console.warn('Course Tycoon: could not save the game (every save backend failed).');
  }
  router.go('overview');
  chiptune.playMusic('build');
}

// ---------------------------------------------------------------------
// The frame loop. Draws whatever screen is active; advances the clock
// only during playback, per the hard rule that mode-specific behaviour
// belongs here and nowhere else.
// ---------------------------------------------------------------------

function frame(now) {
  const dt = lastFrameTime === null ? 0 : now - lastFrameTime;
  lastFrameTime = now;

  switch (router.current) {
    case 'overview':
      drawOverview();
      break;
    case 'editor':
      hud.update(state);
      amenityBar.update(state);
      activeEditor?.render(surface.ctx, { x: 0, y: 0, width: surface.width, height: surface.height });
      break;
    case 'playback': {
      const before = clock.minute;
      clock.advance(dt);
      const after = clock.minute;
      if (after > before) playAudioForWindow(before, after);
      drawPlayback();
      if (clock.finished) enterReport();
      break;
    }
    case 'report':
      // Full-screen DOM overlay; nothing to draw on the canvas underneath.
      break;
    default:
      break;
  }

  requestAnimationFrame(frame);
}

drawOverview();
chiptune.playMusic('build');
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  surface.resize();
});

// ---------------------------------------------------------------------
// Toolbar styling. Small and local to this file: overview and playback
// each get one bottom row of >=44px touch targets, matching the visual
// language src/ui/editor.js and src/ui/panels.js already established.
// ---------------------------------------------------------------------

function injectToolbarStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .ov-toolbar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      gap: 6px;
      padding: 8px;
      background: ${PALETTE.UI_DARK};
      border-top: 1px solid ${PALETTE.OUTLINE};
      z-index: 8;
      pointer-events: auto;
      box-sizing: border-box;
    }
    .ov-btn {
      flex: 1;
      min-height: 44px;
      min-width: 44px;
      padding: 4px;
      background: ${PALETTE.PATH};
      color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.OUTLINE};
      border-radius: 6px;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.25;
      /* A narrow phone can't fit "Amenities" or "Open the day" on one
         line at any reasonable font size — break mid-word rather than
         silently clipping the tail, which is what happened here before
         this rule existed (an "Amenities" button rendered as "Amenitie"). */
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .ov-btn--primary {
      background: ${PALETTE.FAIRWAY};
      color: ${PALETTE.OUTLINE};
      font-weight: bold;
      flex: 1.6;
    }
    .ov-btn--icon {
      flex: 0 0 44px;
      padding: 0;
      font-weight: bold;
      font-size: 16px;
    }
    .ov-btn--active {
      background: ${PALETTE.ACCENT};
      color: ${PALETTE.OUTLINE};
      font-weight: bold;
    }
    /* The bare .ov-toolbar rule above sets its own "display", which beats
       the UA stylesheet's [hidden] { display: none } at equal specificity
       simply by being declared later -- so hiding a toolbar between
       screens silently failed without this override. */
    .ov-toolbar[hidden] {
      display: none;
    }
  `;
  document.head.appendChild(style);
}
