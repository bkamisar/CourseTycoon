/**
 * The one clock the canvas animates to.
 *
 * Light moves on water, rain falls, golfers walk — and none of the code
 * that draws them reads the time for itself. The frame loop in main.js
 * sets this once per frame and every renderer asks it, which buys two
 * things: a frame is drawn at one instant rather than at several slightly
 * different ones, and a test can draw "the frame at 1,300 ms" by saying so.
 *
 * This is presentation time only. Nothing in src/sim knows it exists; the
 * simulation's clock is the day's own minute count.
 */
let nowMs = 0;

export function setAnimationTime(ms) {
  nowMs = ms;
}

export function animationTime() {
  return nowMs;
}

/** Which of `frames` frames to show now, changing every `periodMs`.
 * `offset` staggers things that should not all step in unison. */
export function animationFrame(periodMs, frames, offset = 0) {
  return (Math.floor(nowMs / periodMs) + offset) % frames;
}
