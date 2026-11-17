/**
 * The course, alive: cloud shadows drifting over it, trees moving in the
 * wind, a few birds now and then, rain dimpling the ponds.
 *
 * None of it decides anything. Where every cloud, bird and ripple is at a
 * given instant is a pure function of the rectangle, the time and the
 * day's weather (`cloudShadows`, `birds`, `ripples`, `treeSway`), so the
 * picture never depends on a random number or on how many frames were
 * drawn before this one — and it can be tested.
 *
 * The day's weather is set once per frame (`setAmbientWeather`) by
 * whoever knows it, like the light in light.js, so that something deep in
 * the drawing (a pond, a tree) can ask without being handed it.
 */
import { withAlpha } from './palette.js';
import { currentLight } from './light.js';

let weatherKey = null;

export function setAmbientWeather(key) {
  weatherKey = key ?? null;
}

export function ambientWeather() {
  return weatherKey;
}

/** A fixed number in 0–1 for item `i`: the same on every frame. */
function seeded(i, salt) {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const wrap = (value, span) => ((value % span) + span) % span;

// --- Wind in the trees ---------------------------------------------------

/** How far a tree leans at the most, by weather, as a shear (px across per px up). */
const SWAY = { clear: 0.012, fair: 0.018, breezy: 0.04, blowy: 0.075, drizzle: 0.025, rain: 0.045, storm: 0.1 };

/**
 * How far the tree standing at (`x`, `y`) leans at `ms`: a slow sway with
 * a quicker flutter on top, out of step with its neighbours. Small enough
 * that the top of the tallest tree moves less than a pixel, so a tree
 * never leans out of the ground it was planted on.
 */
export function treeSway(key, x, y, ms) {
  const amount = SWAY[key] ?? SWAY.fair;
  return amount * (0.65 * Math.sin(ms / 760 + x * 0.37 + y * 0.11) + 0.35 * Math.sin(ms / 290 + x * 0.13 - y * 0.07));
}

// --- Cloud shadows --------------------------------------------------------

/** Pixels a cloud's shadow travels per ms, by weather. */
const DRIFT = { clear: 0.0035, fair: 0.005, breezy: 0.009, blowy: 0.016, drizzle: 0.006, rain: 0.008, storm: 0.014 };
const CLOUDS = 4;

/**
 * Every cloud shadow over `rect` at `ms`: `{ x, y, rx, ry }`, an ellipse
 * centre and radii, drifting left to right with the wind and coming round
 * again. Clear days have fewer, fair days more.
 */
export function cloudShadows(rect, ms, key) {
  const speed = DRIFT[key] ?? DRIFT.fair;
  const count = key === 'clear' ? 2 : CLOUDS;
  const shadows = [];
  for (let i = 0; i < count; i++) {
    const rx = rect.width * (0.28 + seeded(i, 1) * 0.22);
    const ry = rx * (0.45 + seeded(i, 2) * 0.2);
    const span = rect.width + rx * 2;
    const x = rect.x - rx + wrap(seeded(i, 3) * span + ms * speed * (0.8 + seeded(i, 4) * 0.4), span);
    const y = rect.y + seeded(i, 5) * rect.height;
    shadows.push({ x, y, rx, ry });
  }
  return shadows;
}

/** Draws the cloud shadows over `rect` — only when the sun is out: under
 * cloud there is nothing to cast them. */
export function drawCloudShadows(ctx, rect, ms, key = weatherKey) {
  const light = currentLight();
  if (light.dx === 0 && light.dy === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  for (const c of cloudShadows(rect, ms, key)) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, c.ry / c.rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c.rx);
    g.addColorStop(0, withAlpha('OUTLINE', 0.24));
    g.addColorStop(0.6, withAlpha('OUTLINE', 0.15));
    g.addColorStop(1, withAlpha('OUTLINE', 0));
    ctx.fillStyle = g;
    ctx.fillRect(-c.rx, -c.rx, c.rx * 2, c.rx * 2);
    ctx.restore();
  }
  ctx.restore();
}

// --- Birds ----------------------------------------------------------------

const FLOCK_EVERY_MS = 26000;
const FLOCK_CROSSING_MS = 9000;
const FLOCK_SIZE = 5;

/**
 * The flock over `rect` at `ms`, or none: every FLOCK_EVERY_MS a small V
 * of birds crosses the screen, each crossing on a different line.
 * `{ x, y, flap }` per bird, `flap` from −1 (wings down) to 1 (up).
 */
export function birds(rect, ms) {
  const crossing = Math.floor(ms / FLOCK_EVERY_MS);
  const t = (ms - crossing * FLOCK_EVERY_MS) / FLOCK_CROSSING_MS;
  if (t < 0 || t > 1) return [];
  const startY = rect.y + rect.height * (0.15 + seeded(crossing, 7) * 0.7);
  const rise = (seeded(crossing, 8) - 0.5) * rect.height * 0.5;
  const leadX = rect.x - 20 + (rect.width + 40) * t;
  const leadY = startY + rise * t;
  const flock = [];
  for (let i = 0; i < FLOCK_SIZE; i++) {
    const rank = Math.ceil(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    flock.push({
      x: leadX - rank * 4,
      y: leadY + side * rank * 3,
      flap: Math.sin(ms / 110 + i * 1.3),
    });
  }
  return flock;
}

/** Draws the flock, with its shadows far below on the ground. */
export function drawBirds(ctx, rect, ms) {
  const flock = birds(rect, ms);
  if (flock.length === 0) return;
  const light = currentLight();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const wing = (b, dx, dy) => {
    const lift = b.flap * 1.1;
    ctx.moveTo(b.x + dx - 1.6, b.y + dy - lift);
    ctx.lineTo(b.x + dx, b.y + dy);
    ctx.lineTo(b.x + dx - 1.6, b.y + dy + lift * 0.2 + 1.4);
  };
  if (light.dx !== 0 || light.dy !== 0) {
    ctx.strokeStyle = withAlpha('OUTLINE', 0.18);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const b of flock) wing(b, light.dx * 18, light.dy * 18);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha('OUTLINE', 0.85);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const b of flock) wing(b, 0, 0);
  ctx.stroke();
  ctx.restore();
}

// --- Rain on the water ----------------------------------------------------

const RIPPLES = { drizzle: 3, rain: 6, storm: 10 };
const RIPPLE_MS = 900;

/**
 * The rings rain is making on a pond of radius `r` at `ms`, as offsets
 * from its centre: `{ dx, dy, radius, alpha }`. None unless it is wet.
 */
export function ripples(key, r, ms, salt = 0) {
  const count = RIPPLES[key] ?? 0;
  const rings = [];
  for (let i = 0; i < count; i++) {
    const clock = ms / RIPPLE_MS + i / count;
    const cycle = Math.floor(clock);
    const phase = clock - cycle;
    const a = seeded(cycle * 31 + i, 11 + salt) * Math.PI * 2;
    const d = Math.sqrt(seeded(cycle * 31 + i, 12 + salt)) * r * 0.8;
    rings.push({
      dx: Math.cos(a) * d,
      dy: Math.sin(a) * d,
      radius: 0.3 + phase * Math.min(2.5, r * 0.18),
      alpha: (1 - phase) * 0.7,
    });
  }
  return rings;
}

/** Draws the rain's rings on a pond centred at `p`, radius `r` (already clipped to it). */
export function drawRipples(ctx, p, r, ms, salt = 0, key = weatherKey) {
  const rings = ripples(key, r, ms, salt);
  if (rings.length === 0) return;
  ctx.lineWidth = 0.3;
  for (const ring of rings) {
    ctx.strokeStyle = withAlpha('WATER_LIGHT', ring.alpha);
    ctx.beginPath();
    ctx.ellipse(p.x + ring.dx, p.y + ring.dy, ring.radius, ring.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}
