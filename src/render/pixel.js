/**
 * Sets up the game canvas.
 *
 * The game is laid out on a small LOGICAL canvas (default 180x320, a phone
 * portrait aspect) and every draw call, hit test and layout number in the
 * codebase is in those units. The CSS box is that size times the largest
 * whole number that fits the viewport (`surface.scale`, CSS px per logical
 * px), as it always was.
 *
 * What changed (build 2026-11-16e): the backing store is no longer the
 * logical size blown up. It is the logical size times `resolution()` —
 * the CSS scale times the device pixel ratio, capped — and the context
 * carries a matching transform. So the same draw calls now land on the
 * phone's real pixels: curves are smooth, gradients are gradients, and
 * the course is no longer pixel art. Nothing outside src/render needs to
 * know: `surface.width`, `surface.height`, `surface.scale` and
 * `toCanvasCoords` all mean what they meant.
 */
import { setResolution, resolution } from './paint.js';

/** Widest backing store, in device px across, whatever the screen: past
 * this the extra pixels cost frame rate and nobody can see them. */
const MAX_BACKING_WIDTH = 1440;

function computeScale(width, height) {
  const availW = window.innerWidth;
  const availH = window.innerHeight;
  const scale = Math.floor(Math.min(availW / width, availH / height));
  return Math.max(1, scale);
}

export function createSurface(canvas, { width, height }) {
  const ctx = canvas.getContext('2d');

  const surface = {
    ctx,
    width,
    height,
    scale: 1,
    resize,
    beginFrame,
    toCanvasCoords,
  };

  /** Puts the context back to logical units, smoothing on. Called at the
   * start of every frame, so a draw call that forgot a restore cannot
   * leave the next frame drawn at the wrong size. */
  function beginFrame() {
    const res = resolution();
    ctx.setTransform(res, 0, 0, res, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  function resize() {
    const scale = computeScale(width, height);
    surface.scale = scale;
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;

    const dpr = window.devicePixelRatio || 1;
    const res = Math.max(1, Math.min(scale * dpr, MAX_BACKING_WIDTH / width));
    setResolution(res);
    const backingW = Math.round(width * res);
    const backingH = Math.round(height * res);
    // Assigning the backing size resets every piece of context state, so
    // it is only done when the size really changed, and the transform is
    // put back straight after.
    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }
    beginFrame();
  }

  function toCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / surface.scale;
    const y = (clientY - rect.top) / surface.scale;
    return { x, y };
  }

  resize();

  return surface;
}

/**
 * How many LOGICAL canvas px of `canvas`'s own top edge sit underneath
 * `topEl`'s fixed-position box — real overlap, not just `topEl`'s own
 * height. The canvas is centred in the viewport; on a tall viewport it
 * can sit well clear of a fixed top bar, with headroom to spare, and on a
 * short one it can start only a few px down. Insetting drawing by the
 * bar's full height regardless of which case applies either fails to
 * clear a bar that actually reaches the canvas, or carves out a dead gap
 * above content that was never actually covered — both real bugs an
 * earlier pass here shipped by measuring the bar alone instead of the
 * overlap. `topEl`/`bottomEl` may be null (nothing to inset for).
 */
export function topChromeOverlapPx(canvas, topEl, scale) {
  if (!topEl) return 0;
  const canvasTop = canvas.getBoundingClientRect().top;
  const chromeBottom = topEl.getBoundingClientRect().bottom;
  return Math.max(0, chromeBottom - canvasTop) / Math.max(1, scale);
}

/** The bottom-edge counterpart to `topChromeOverlapPx`, for a fixed
 * toolbar docked to the bottom of the viewport instead of the top. */
export function bottomChromeOverlapPx(canvas, bottomEl, scale) {
  if (!bottomEl) return 0;
  const canvasBottom = canvas.getBoundingClientRect().bottom;
  const chromeTop = bottomEl.getBoundingClientRect().top;
  return Math.max(0, canvasBottom - chromeTop) / Math.max(1, scale);
}
