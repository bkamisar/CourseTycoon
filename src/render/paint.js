/**
 * How many device pixels the canvas has per logical pixel.
 *
 * The game is laid out on a 180x320 logical canvas and every draw call,
 * hit test and layout number is in those units. The backing store is
 * `180 * resolution()` by `320 * resolution()` and the context carries a
 * matching scale, so the same calls come out at the phone's real
 * resolution. Anything that builds an off-screen bitmap (a texture tile,
 * a painted tree, a cached layer) asks here how many pixels to give it.
 *
 * Set once per resize by `pixel.js`. Defaults to 1, which is what the
 * tests in Node see.
 */
let res = 1;

export function setResolution(value) {
  res = Math.max(1, value);
}

export function resolution() {
  return res;
}
