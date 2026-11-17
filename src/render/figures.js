/**
 * People, drawn rather than blitted: legs that stride on the animation
 * clock, a body in the group's shirt, a head and a cap, and a dark outline
 * round all of it so a figure reads on fairway, sand, water and woods
 * alike. The same figure walks the course on the map (scale 1, about seven
 * logical px tall) and swings on the play screen (bigger, with a club).
 *
 * Positions are the figure's FEET; it faces right, toward the ball.
 */
import { PALETTE } from './palette.js';
import { SPRITE_CHARS, SHIRT_KEYS } from './sprites.js';

/** The shirt colour of group `index`: the same order the pixel sprites used. */
export function shirtColour(index) {
  const n = SHIRT_KEYS.length;
  return PALETTE[SPRITE_CHARS[SHIRT_KEYS[((index % n) + n) % n]]];
}

/** Where the hands are, and where the club ends, for each swing pose. */
const POSES = {
  address: { hands: [1.0, -3.3], club: [3.3, -0.1] },
  backswing: { hands: [-0.7, -6.3], club: [-2.9, -8.9] },
  finish: { hands: [-0.5, -6.1], club: [-3.5, -5.0] },
};

function line(ctx, points, width, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

/** A limb or a shaft: dark outline first, colour on top. */
function limb(ctx, points, width, colour) {
  line(ctx, points, width + 0.7, PALETTE.OUTLINE);
  line(ctx, points, width, colour);
}

/**
 * Draws a figure with its feet at (`x`, `y`).
 *
 * `stride` (−1 to 1) swings the legs and arms while walking; `pose` is
 * 'walk' or one of the three swing poses, which add a club.
 */
export function drawFigure(ctx, x, y, { shirt = PALETTE.ACCENT, scale = 1, stride = 0, pose = 'walk' } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const step = pose === 'walk' ? stride * 0.9 : 0;
  const hip = [0, -3.1];
  limb(ctx, [hip, [-0.75 + step, 0]], 0.85, PALETTE.UI_DARK);
  limb(ctx, [hip, [0.75 - step, 0]], 0.85, PALETTE.UI_DARK);

  const swing = POSES[pose];
  const shoulder = [0.2, -5];
  if (!swing) {
    // Arms swing against the legs.
    limb(ctx, [[-0.9, -4.9], [-1.1 - step * 0.6, -3.3]], 0.6, shirt);
    limb(ctx, [[0.9, -4.9], [1.1 + step * 0.6, -3.3]], 0.6, shirt);
  }

  // Body.
  ctx.beginPath();
  ctx.ellipse(0, -4.3, 1.35, 1.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = shirt;
  ctx.fill();
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = PALETTE.OUTLINE;
  ctx.stroke();

  if (swing) {
    limb(ctx, [swing.hands, swing.club], 0.35, PALETTE.UI_LIGHT);
    ctx.beginPath();
    ctx.arc(swing.club[0], swing.club[1], 0.45, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.UI_LIGHT;
    ctx.fill();
    limb(ctx, [shoulder, swing.hands], 0.6, PALETTE.FOOD_MEAT_PALE);
  }

  // Head, and a cap with its peak toward the ball.
  ctx.beginPath();
  ctx.arc(0, -6.6, 1.05, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.FOOD_MEAT_PALE;
  ctx.fill();
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -6.75, 1.1, Math.PI, Math.PI * 2);
  ctx.lineTo(1.7, -6.75);
  ctx.closePath();
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function roundedBox(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * The beverage cart, its back wheels at (`x`, `y`): a white buggy under a
 * striped canopy, with a crate of drinks on the back. About eight logical
 * px long, the size the pixel sprite was.
 */
export function drawBeverageCart(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.fillStyle = PALETTE.OUTLINE;
  for (const wx of [-2.6, 2.6]) {
    ctx.beginPath();
    ctx.ellipse(wx, 0, 1.1, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  roundedBox(ctx, -4, -3.4, 8, 3.2, 1);
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fill();
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = PALETTE.OUTLINE;
  ctx.stroke();
  roundedBox(ctx, 0.6, -4.6, 3, 1.6, 0.4);
  ctx.fillStyle = PALETTE.SAND;
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(-3.2, -3.4);
  ctx.lineTo(-3.2, -7.2);
  ctx.moveTo(0.2, -3.4);
  ctx.lineTo(0.2, -7.2);
  ctx.stroke();
  roundedBox(ctx, -4.4, -8.6, 6, 1.8, 0.8);
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? PALETTE.WHITE : PALETTE.ACCENT;
    ctx.fillRect(-4.4 + i * 1.5, -8.6, 1.5, 1.8);
  }
  ctx.restore();
  roundedBox(ctx, -4.4, -8.6, 6, 1.8, 0.8);
  ctx.stroke();
  ctx.restore();
}

/** The halfway house, its front at (`x`, `y`): a small timber hut with a
 * pitched roof, a lit window and a hatch. */
export function drawHalfwayHouse(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = PALETTE.OUTLINE;
  roundedBox(ctx, -4, -5, 8, 5, 0.5);
  ctx.fillStyle = PALETTE.PATH;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5, -4.6);
  ctx.lineTo(0, -8.4);
  ctx.lineTo(5, -4.6);
  ctx.closePath();
  ctx.fillStyle = PALETTE.FLAG;
  ctx.fill();
  ctx.stroke();
  roundedBox(ctx, -2.8, -3.8, 2.6, 1.8, 0.3);
  ctx.fillStyle = PALETTE.ACCENT;
  ctx.fill();
  ctx.stroke();
  roundedBox(ctx, 0.8, -3.2, 2, 3.2, 0.3);
  ctx.fillStyle = PALETTE.TEE;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
