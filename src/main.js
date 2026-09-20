// TEMPORARY sprite sheet check for Task 2. Draws every sprite at true size
// in a labelled grid so legibility can be judged on a phone-size screen.
// This file gets replaced by real wiring in a later task.

import { createSurface } from './render/pixel.js';
import { PALETTE } from './render/palette.js';
import { SPRITES, drawSprite } from './render/sprites.js';

document.body.style.backgroundColor = PALETTE.OUTLINE;

const canvas = document.getElementById('game-canvas');
const surface = createSurface(canvas, { width: 180, height: 320 });

function draw() {
  const { ctx, width, height } = surface;

  ctx.fillStyle = PALETTE.UI_DARK;
  ctx.fillRect(0, 0, width, height);

  const names = Object.keys(SPRITES);
  const cellW = 36;
  const cellH = 36;
  const cols = 5;
  const startX = 6;
  const startY = 6;

  names.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = startX + col * cellW;
    const cy = startY + row * cellH;

    // Cell backdrop so transparent sprite pixels are still visible against
    // a mid-tone, the way they'd sit on grass in the real game.
    ctx.fillStyle = PALETTE.ROUGH;
    ctx.fillRect(cx, cy, 32, 24);

    const sprite = SPRITES[name];
    const spriteW = sprite[0].length;
    const spriteH = sprite.length;
    drawSprite(ctx, sprite, cx + Math.floor((32 - spriteW) / 2), cy + Math.floor((24 - spriteH) / 2));

    ctx.fillStyle = PALETTE.WHITE;
    ctx.font = '3px sans-serif';
    ctx.fillText(name.slice(0, 10), cx, cy + 33);
  });

  // Zoomed inspector (dev-only, this file is throwaway scaffolding): draw
  // the building icons at 8x so exact pixel colours can be checked when a
  // true-size screenshot is too small to judge reliably.
  const zoomNames = ['clubhouse', 'proShop', 'snackShack', 'halfwayHouse', 'restaurant', 'restrooms', 'drivingRange', 'practiceGreen', 'cartBarn'];
  const zoomScale = 6;
  const zoomCols = 3;
  const zStartX = 6;
  const zStartY = 120;
  const zCell = 8 * zoomScale + 10;

  zoomNames.forEach((name, i) => {
    const col = i % zoomCols;
    const row = Math.floor(i / zoomCols);
    const zx = zStartX + col * zCell;
    const zy = zStartY + row * zCell;
    ctx.fillStyle = PALETTE.ROUGH;
    ctx.fillRect(zx, zy, 8 * zoomScale, 8 * zoomScale);
    const sprite = SPRITES[name];
    for (let r = 0; r < sprite.length; r++) {
      for (let c = 0; c < sprite[r].length; c++) {
        const ch = sprite[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = PALETTE[Object.keys(PALETTE).find((k) => k === ({
          O: 'OUTLINE', W: 'WHITE', A: 'ACCENT', D: 'UI_DARK', L: 'UI_LIGHT',
          T: 'TREE', P: 'PATH', E: 'TEE', G: 'GREEN_SURFACE', S: 'SAND',
          B: 'WATER', V: 'WATER_DEEP', F: 'FAIRWAY', H: 'FAIRWAY_SHADOW',
          R: 'ROUGH', K: 'ROUGH_SHADOW',
        }[ch]))];
        ctx.fillRect(zx + c * zoomScale, zy + r * zoomScale, zoomScale, zoomScale);
      }
    }
  });
}

draw();

window.addEventListener('resize', () => {
  surface.resize();
  draw();
});
