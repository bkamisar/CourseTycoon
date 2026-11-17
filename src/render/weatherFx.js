/**
 * Weather you can see.
 *
 * The day's weather has always changed the game — demand, pace, how wild
 * a shot flies — and has always been a word in the HUD. This draws it
 * over the course: rain that falls harder on a wetter day and wind that
 * streaks faster on a windier one. (A storm was also dimmed with a dither
 * at first. It read as a dot grid laid over the map and made the hole
 * labels harder to read, which is the opposite of the job, so a storm is
 * told by how hard it rains and blows.)
 *
 * It decides nothing. The condition key comes from `weatherOn`, the same
 * call the simulation makes, so the rain on screen is the rain in the
 * numbers. A clear or fair day draws nothing at all.
 *
 * Where every drop is at a given instant is a pure function of the
 * condition, the rectangle and the time (`rainDrops`, `windStreaks`), so
 * the picture never depends on a random number or on how many frames
 * happened to be drawn before this one.
 */
import { withAlpha } from './palette.js';

/** drops on screen, pixels fallen per ms, sideways drift per pixel fallen, streak length */
const RAIN = {
  drizzle: { drops: 16, speed: 0.1, slant: 0, length: 2 },
  rain: { drops: 44, speed: 0.17, slant: 0.25, length: 3 },
  storm: { drops: 72, speed: 0.25, slant: 0.5, length: 4 },
};

/** streaks on screen, pixels travelled per ms */
const WIND = {
  breezy: { streaks: 4, speed: 0.06 },
  blowy: { streaks: 9, speed: 0.12 },
  storm: { streaks: 6, speed: 0.2 },
};

/** A fixed pseudo-random number in 0–1 for item `i`: the same every
 * frame, so a raindrop keeps its own column instead of teleporting. */
function seeded(i, salt) {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const wrap = (value, span) => ((value % span) + span) % span;

/** Every raindrop at `ms`: `{ x, y, length, slant }`, the head of each streak, inside `rect`. */
export function rainDrops(key, rect, ms) {
  const cfg = RAIN[key];
  if (!cfg) return [];
  const drops = [];
  for (let i = 0; i < cfg.drops; i++) {
    // Drops fall at slightly different speeds, or the whole sky moves as one sheet.
    const speed = cfg.speed * (0.8 + seeded(i, 3) * 0.4);
    const fallen = ms * speed;
    drops.push({
      x: rect.x + wrap(seeded(i, 1) * rect.width - fallen * cfg.slant, rect.width),
      y: rect.y + wrap(seeded(i, 2) * rect.height + fallen, rect.height),
      length: cfg.length,
      slant: cfg.slant,
    });
  }
  return drops;
}

/** Every wind streak at `ms`: `{ x, y, length }`, the leading end of each, inside `rect`. */
export function windStreaks(key, rect, ms) {
  const cfg = WIND[key];
  if (!cfg) return [];
  const streaks = [];
  for (let i = 0; i < cfg.streaks; i++) {
    const speed = cfg.speed * (0.7 + seeded(i, 6) * 0.6);
    const x = rect.x + wrap(seeded(i, 4) * rect.width + ms * speed, rect.width);
    // A slow rise and fall as it crosses, so it reads as air, not as a ruled line.
    const drift = Math.sin(x / 14 + i) * 2;
    streaks.push({
      x,
      y: rect.y + seeded(i, 5) * rect.height + drift,
      length: 4 + Math.round(seeded(i, 7) * 5),
    });
  }
  return streaks;
}

/** Draws the weather for condition `key` over `rect` at time `ms`. */
export function drawWeather(ctx, rect, key, ms) {
  if (!RAIN[key] && !WIND[key]) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  ctx.lineCap = 'round';
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = withAlpha('WHITE', 0.55);
  ctx.beginPath();
  for (const s of windStreaks(key, rect, ms)) {
    // A long faint line and a short bright head.
    ctx.moveTo(s.x - s.length * 1.6, s.y + 0.4);
    ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();

  ctx.lineWidth = 0.45;
  ctx.strokeStyle = withAlpha('WATER_LIGHT', 0.75);
  ctx.beginPath();
  for (const d of rainDrops(key, rect, ms)) {
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.length * d.slant * 1.4, d.y - d.length * 1.4);
  }
  ctx.stroke();

  ctx.restore();
}
