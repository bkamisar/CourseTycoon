// TEMPORARY demo harness for Task 6 (the hole editor), building on Task 5's
// screens/sheets/HUD harness. Tapping a built hole plot opens the hole
// editor; tapping an empty plot opens the template picker sheet. This file
// is replaced again once Task 7 wires in the build/hire/pricing panels, and
// again by Task 12's real screen-driven wiring.

import { createSurface } from './render/pixel.js';
import { PALETTE } from './render/palette.js';
import { drawResort } from './render/resortView.js';
import { newGame } from './sim/state.js';
import { mountHud } from './ui/hud.js';
import { mountSheetHost } from './ui/sheet.js';
import { createScreenRouter } from './ui/screens.js';
import { mountHoleEditor, openTemplatePicker } from './ui/editor.js';

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

drawOverview();

canvas.addEventListener('click', (evt) => {
  if (router.current !== 'overview') return;
  const { x, y } = surface.toCanvasCoords(evt.clientX, evt.clientY);
  const hit = regions.find((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  if (!hit) return;
  if (hit.kind === 'hole') onHoleTap(hit.id);
});

window.addEventListener('resize', () => {
  surface.resize();
  if (router.current === 'overview') drawOverview();
});
