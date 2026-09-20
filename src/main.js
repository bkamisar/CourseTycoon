// TEMPORARY demo harness for Tasks 5-7 (screens/sheets/HUD, the hole
// editor, and the build/hire/pricing panels). Tapping a built hole plot
// opens the hole editor; tapping an empty plot opens the template picker;
// tapping an amenity icon opens the build sheet. A small dev-only row of
// buttons at the top opens the staff and pricing sheets, since neither has
// an on-canvas affordance yet (that's Task 12's job, along with the real
// open-day -> playback -> report flow this harness doesn't attempt).

import { createSurface } from './render/pixel.js';
import { PALETTE } from './render/palette.js';
import { drawResort } from './render/resortView.js';
import { newGame } from './sim/state.js';
import { mountHud } from './ui/hud.js';
import { mountSheetHost } from './ui/sheet.js';
import { createScreenRouter } from './ui/screens.js';
import { mountHoleEditor, openTemplatePicker } from './ui/editor.js';
import { openBuildSheet, openStaffSheet, openPricingSheet } from './ui/panels.js';

document.body.style.backgroundColor = PALETTE.OUTLINE;

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const surface = createSurface(canvas, { width: 180, height: 320 });

let state = newGame(1);

const router = createScreenRouter('overview');
const hud = mountHud(uiRoot);
const sheets = mountSheetHost(uiRoot);

let regions = [];
let activeEditor = null;
let rafId = null;

function stopEditorLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  activeEditor?.destroy();
  activeEditor = null;
}

function drawOverview() {
  const { ctx, width, height } = surface;
  regions = drawResort(ctx, state, { x: 0, y: 0, width, height });
  hud.update(state);
}

function openEditorFor(holeId) {
  stopEditorLoop();
  router.go('editor');
  const hole = state.resort.courses[0].holes.find((h) => h.id === holeId);
  activeEditor = mountHoleEditor({
    canvas,
    surface,
    container: uiRoot,
    hole,
    carts: state.resort.amenities.some((a) => a.type === 'cartBarn'),
    onDone: () => {
      stopEditorLoop();
      router.go('overview');
      drawOverview();
    },
  });

  function loop() {
    hud.update(state);
    activeEditor.render(surface.ctx, { x: 0, y: 0, width: surface.width, height: surface.height });
    rafId = requestAnimationFrame(loop);
  }
  loop();
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

drawOverview();

canvas.addEventListener('click', (evt) => {
  if (router.current !== 'overview') return;
  const { x, y } = surface.toCanvasCoords(evt.clientX, evt.clientY);
  const hit = regions.find((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  if (!hit) return;
  if (hit.kind === 'hole') onHoleTap(hit.id);
  else onAmenityTap();
});

// Dev-only entry points for the staff and pricing sheets, until Task 12
// gives them a real on-canvas home (a staff office / pricing board icon).
const devRow = document.createElement('div');
devRow.style.position = 'fixed';
devRow.style.top = '30px';
devRow.style.left = '0';
devRow.style.right = '0';
devRow.style.display = 'flex';
devRow.style.gap = '6px';
devRow.style.padding = '4px 8px';
devRow.style.zIndex = '9';
devRow.style.pointerEvents = 'none';

function devButton(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.pointerEvents = 'auto';
  btn.style.minHeight = '44px';
  btn.style.minWidth = '44px';
  btn.style.fontSize = '11px';
  btn.addEventListener('click', onClick);
  return btn;
}

devRow.append(
  devButton('Staff', () =>
    openStaffSheet(sheets, {
      state,
      onChange: (next) => {
        state = next;
        drawOverview();
      },
    })
  ),
  devButton('Pricing', () =>
    openPricingSheet(sheets, {
      state,
      onChange: (next) => {
        state = next;
        drawOverview();
      },
    })
  )
);
uiRoot.appendChild(devRow);

window.addEventListener('resize', () => {
  surface.resize();
  if (router.current === 'overview') drawOverview();
});
