// TEMPORARY resort-overview check for Task 4. Draws newGame(1)'s starting
// resort so built vs. empty plots and amenity placement can be judged at
// phone size. This file gets replaced again in a later task.

import { createSurface } from './render/pixel.js';
import { PALETTE } from './render/palette.js';
import { drawResort } from './render/resortView.js';
import { newGame } from './sim/state.js';

document.body.style.backgroundColor = PALETTE.OUTLINE;

const canvas = document.getElementById('game-canvas');
const surface = createSurface(canvas, { width: 180, height: 320 });
const state = newGame(1);

let regions = [];

function draw() {
  const { ctx, width, height } = surface;
  regions = drawResort(ctx, state, { x: 0, y: 0, width, height });
}

draw();

// Tap a region to confirm the returned hit boxes line up with what was
// actually drawn (dev-only check for this throwaway scaffold).
canvas.addEventListener('click', (evt) => {
  const { x, y } = surface.toCanvasCoords(evt.clientX, evt.clientY);
  const hit = regions.find((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  console.log('tap at', Math.round(x), Math.round(y), '->', hit ? `${hit.kind}:${hit.id}` : 'nothing');
});

window.addEventListener('resize', () => {
  surface.resize();
  draw();
});
