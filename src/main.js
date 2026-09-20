// TEMPORARY demo harness for Task 5 (screens/sheets/HUD). Draws the resort
// overview, the HUD bar on top of it, and wires a couple of sheets so the
// slide-up/dismiss behaviour can be judged at phone size. Tapping a hole
// plot opens a placeholder sheet; tapping an amenity opens a second sheet
// on top of it, to check that dismissing one returns to the other rather
// than closing everything. This file is replaced again by Task 12's real
// wiring (screens driving canvas mode + day flow).

import { createSurface } from './render/pixel.js';
import { PALETTE } from './render/palette.js';
import { drawResort } from './render/resortView.js';
import { newGame } from './sim/state.js';
import { mountHud } from './ui/hud.js';
import { mountSheetHost } from './ui/sheet.js';
import { createScreenRouter } from './ui/screens.js';

document.body.style.backgroundColor = PALETTE.OUTLINE;

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const surface = createSurface(canvas, { width: 180, height: 320 });
const state = newGame(1);

const router = createScreenRouter('overview');
const hud = mountHud(uiRoot);
const sheets = mountSheetHost(uiRoot);

let regions = [];

function draw() {
  const { ctx, width, height } = surface;
  regions = drawResort(ctx, state, { x: 0, y: 0, width, height });
  hud.update(state);
}

draw();

function openHoleSheet(id) {
  sheets.open({
    id: `hole-${id}`,
    title: `Hole ${id}`,
    render(body) {
      const p = document.createElement('p');
      p.textContent = 'The hole editor (Task 6) opens here on a real tap.';
      body.appendChild(p);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Open build sheet';
      btn.style.minHeight = '44px';
      btn.style.minWidth = '44px';
      btn.addEventListener('click', () => openAmenitySheet('proShop'));
      body.appendChild(btn);
    },
  });
}

function openAmenitySheet(type) {
  sheets.open({
    id: `amenity-${type}`,
    title: `Amenity: ${type}`,
    render(body) {
      const p = document.createElement('p');
      p.textContent = 'The build/hire/pricing sheets (Task 7) open here.';
      body.appendChild(p);
    },
  });
}

canvas.addEventListener('click', (evt) => {
  const { x, y } = surface.toCanvasCoords(evt.clientX, evt.clientY);
  const hit = regions.find((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  if (!hit) return;
  if (hit.kind === 'hole') openHoleSheet(hit.id);
  else openAmenitySheet(hit.id);
});

window.addEventListener('resize', () => {
  surface.resize();
  draw();
});
