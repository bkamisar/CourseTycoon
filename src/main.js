// TEMPORARY boot check for Task 1 (pixel canvas shell). This draws nothing
// meaningful — it exists only to judge whether the palette reads well and
// the integer scaling is crisp. A later task replaces this file entirely.

import { createSurface } from './render/pixel.js';
import { PALETTE } from './render/palette.js';

document.body.style.backgroundColor = PALETTE.OUTLINE;

const canvas = document.getElementById('game-canvas');
const surface = createSurface(canvas, { width: 180, height: 320 });

function draw() {
  const { ctx, width, height } = surface;

  // Base fill: fairway, the game's dominant colour.
  ctx.fillStyle = PALETTE.FAIRWAY;
  ctx.fillRect(0, 0, width, height);

  // A strip of rough along one edge, to check fairway/rough contrast.
  ctx.fillStyle = PALETTE.ROUGH;
  ctx.fillRect(0, 0, 40, height);

  ctx.fillStyle = PALETTE.ROUGH_SHADOW;
  ctx.fillRect(0, 0, 12, height);

  // Fairway shadow stripe, mimicking mowing stripes.
  ctx.fillStyle = PALETTE.FAIRWAY_SHADOW;
  ctx.fillRect(60, 0, 24, height);

  // A green with putting surface, sand, and water nearby.
  ctx.fillStyle = PALETTE.GREEN_SURFACE;
  ctx.fillRect(110, 40, 50, 50);

  ctx.fillStyle = PALETTE.SAND;
  ctx.fillRect(120, 100, 30, 20);

  ctx.fillStyle = PALETTE.WATER;
  ctx.fillRect(110, 130, 50, 30);

  ctx.fillStyle = PALETTE.WATER_DEEP;
  ctx.fillRect(120, 140, 30, 15);

  // Trees.
  ctx.fillStyle = PALETTE.TREE;
  ctx.fillRect(150, 20, 25, 25);

  // Tee box and a path leading to it.
  ctx.fillStyle = PALETTE.TEE;
  ctx.fillRect(70, 260, 20, 15);

  ctx.fillStyle = PALETTE.PATH;
  ctx.fillRect(90, 260, 60, 8);

  // UI chrome + accent swatches along the bottom, like a HUD would use.
  ctx.fillStyle = PALETTE.UI_DARK;
  ctx.fillRect(0, 290, width, 30);

  ctx.fillStyle = PALETTE.UI_LIGHT;
  ctx.fillRect(0, 290, width, 2);

  ctx.fillStyle = PALETTE.ACCENT;
  ctx.fillRect(10, 298, 40, 14);

  ctx.fillStyle = PALETTE.WHITE;
  ctx.fillRect(60, 298, 14, 14);

  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(85, 298, 14, 14);
}

draw();

window.addEventListener('resize', () => {
  surface.resize();
  draw();
});
