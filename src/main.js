// TEMPORARY hole-renderer check for Task 3. Draws all six templates in a
// grid so doglegs, the water hole and hazard placement can be judged at
// phone size. This file gets replaced again in a later task.

import { createSurface } from './render/pixel.js';
import { PALETTE } from './render/palette.js';
import { drawHole } from './render/holeView.js';
import { makeHole } from './sim/hole.js';
import { TEMPLATE_NAMES } from './sim/templates.js';

document.body.style.backgroundColor = PALETTE.OUTLINE;

const canvas = document.getElementById('game-canvas');
const surface = createSurface(canvas, { width: 180, height: 320 });

function draw() {
  const { ctx, width, height } = surface;

  ctx.fillStyle = PALETTE.UI_DARK;
  ctx.fillRect(0, 0, width, height);

  const cols = 2;
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / 3);

  TEMPLATE_NAMES.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rect = { x: col * cellW, y: row * cellH, width: cellW, height: cellH };
    const hole = makeHole(name, i + 1);
    drawHole(ctx, hole, rect);

    ctx.strokeStyle = PALETTE.UI_LIGHT;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  });
}

draw();

window.addEventListener('resize', () => {
  surface.resize();
  draw();
});
