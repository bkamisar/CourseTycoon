/**
 * Where the sun is.
 *
 * Everything on the course was already lit from the top left — the bright
 * shoulder of a treetop, the shaded near wall of a bunker — but nothing
 * cast a shadow, so the picture read as a painted board seen from straight
 * above. This is the one description of the light that every shadow on
 * the canvas is drawn from, so they all fall the same way at once.
 *
 * `lightAt` is pure: the light is a function of the minute of the day
 * being watched and of the weather, nothing else.
 *
 *   - `dx`, `dy`: how far a shadow reaches, in pixels, per pixel of height
 *     of the thing casting it. Both are never negative: the sun stays in
 *     the top-left of the sky, swinging from the left in the morning
 *     (shadows thrown to the right) to overhead-and-behind in the evening
 *     (shadows thrown down the screen), so a shadow never contradicts the
 *     lit shoulder painted on every tree.
 *   - `tint`, `strength`: a palette colour the whole course is multiplied
 *     by, and how strongly — cool first thing, nothing through the middle
 *     of the day, gold toward the close.
 *
 * Under cloud there is no sun to cast anything: a wet day has no shadows
 * at all and a flat grey light, which is most of what makes rain look
 * like rain.
 *
 * It decides nothing. No number in the simulation reads the light.
 */
import { PALETTE } from './palette.js';

/** How dark a cast shadow is: OUTLINE laid over the ground at this opacity. */
export const SHADOW_ALPHA = 0.36;

/** First tee time, in minutes after midnight (play/clock.js's `dayStart`). */
const DAY_START = 420;
/** When the day ends if nobody says otherwise (play/clock.js's `dayEnd`). */
const DEFAULT_DAY_END = 1080;

/** Fraction of the day by which the cool morning light has gone. */
const DAWN_ENDS = 0.2;
/** Fraction of the day at which the light starts to turn gold. */
const DUSK_STARTS = 0.62;
const DAWN_MAX = 0.6;
const DUSK_MAX = 0.7;

/** Shadow length per unit of height: at midday, and added on top at either end of the day. */
const SHADOW_NOON = 0.3;
const SHADOW_LOW_SUN = 0.7;

/** How heavy the cloud is, as the strength of the grey it lays over the course. */
const OVERCAST = { drizzle: 0.3, rain: 0.5, storm: 0.7 };

/** Plain daylight: the planning screens, the editor, a dry day's play. */
export const DAYLIGHT = Object.freeze({ tint: null, strength: 0, dx: 0.4, dy: 0.4 });

/**
 * The light for `minute` of a day that ends at `dayEnd`, under
 * `weatherKey`. With no minute (a screen that is not watching a day go
 * by) a dry day gets plain daylight.
 */
export function lightAt({ minute = null, dayEnd = DEFAULT_DAY_END, weatherKey = null } = {}) {
  if (OVERCAST[weatherKey] !== undefined) {
    return { tint: 'LIGHT_OVERCAST', strength: OVERCAST[weatherKey], dx: 0, dy: 0 };
  }
  if (minute === null) return DAYLIGHT;

  const span = Math.max(1, dayEnd - DAY_START);
  const f = Math.min(1, Math.max(0, (minute - DAY_START) / span));
  // 0 at the middle of the day, 1 at either end of it.
  const low = Math.pow(Math.abs(f - 0.5) * 2, 1.6);
  const length = SHADOW_NOON + SHADOW_LOW_SUN * low;
  // Thrown to the right first thing, down the screen by the close.
  const angle = ((15 + 60 * f) * Math.PI) / 180;

  let tint = null;
  let strength = 0;
  if (f < DAWN_ENDS) {
    tint = 'LIGHT_DAWN';
    strength = (1 - f / DAWN_ENDS) * DAWN_MAX;
  } else if (f > DUSK_STARTS) {
    tint = 'LIGHT_DUSK';
    strength = ((f - DUSK_STARTS) / (1 - DUSK_STARTS)) * DUSK_MAX;
  }
  return { tint, strength, dx: length * Math.cos(angle), dy: length * Math.sin(angle) };
}

// The light every draw call this frame should use. Set once per frame by
// whoever knows what is being watched (main.js, the play screen), read by
// everything that casts a shadow — the same arrangement as animClock.js,
// for the same reason: one frame is drawn under one sun.
let current = DAYLIGHT;

export function setLight(light) {
  current = light ?? DAYLIGHT;
}

export function currentLight() {
  return current;
}

/**
 * The pixels a thing `height` px tall and `width` px wide at its foot
 * shades, standing with the left end of its foot at (`baseX`, `baseY`):
 * a slab from its foot to where its top lands. Pure, and every pixel is
 * listed once, so laying them down at SHADOW_ALPHA never darkens one
 * twice.
 */
export function castShadowPixels(baseX, baseY, height, width, light) {
  const ox = Math.round(light.dx * height);
  const oy = Math.round(light.dy * height);
  const steps = Math.max(Math.abs(ox), Math.abs(oy));
  if (steps === 0) return [];
  const seen = new Set();
  const pixels = [];
  for (let k = 1; k <= steps; k++) {
    const x = Math.round(baseX) + Math.round((ox * k) / steps);
    const y = Math.round(baseY) + Math.round((oy * k) / steps);
    for (let i = 0; i < width; i++) {
      const key = `${x + i},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pixels.push({ x: x + i, y });
    }
  }
  return pixels;
}

/** Draws the shadow of a sprite-sized thing under the current light.
 * Call it before drawing the thing itself. */
export function drawCastShadow(ctx, baseX, baseY, height, width = 1) {
  const pixels = castShadowPixels(baseX, baseY, height, width, current);
  if (pixels.length === 0) return;
  ctx.save();
  ctx.globalAlpha = SHADOW_ALPHA;
  ctx.fillStyle = PALETTE.OUTLINE;
  for (const p of pixels) ctx.fillRect(p.x, p.y, 1, 1);
  ctx.restore();
}

/**
 * Lays the colour of the light over `rect`. Multiplied rather than
 * painted on: a wash of orange turns everything milky, while multiplying
 * leaves the darks dark and warms what was already bright, which is what
 * low sun does.
 */
export function applyLight(ctx, rect, light = current) {
  if (!light.tint || light.strength <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = Math.min(1, light.strength);
  ctx.fillStyle = PALETTE[light.tint];
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}
