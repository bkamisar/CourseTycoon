/**
 * Sets up the low-resolution pixel canvas and its integer upscaling.
 *
 * The internal backing store stays tiny (default 180x320, a phone
 * portrait aspect) and never changes size. What changes on resize is only
 * the canvas's CSS box, which is scaled up by the largest whole-number
 * factor that still fits the viewport. Fractional scaling is never used —
 * it blurs and unevens the pixels and destroys the 8-bit look.
 */

function computeScale(width, height) {
  const availW = window.innerWidth;
  const availH = window.innerHeight;
  const scale = Math.floor(Math.min(availW / width, availH / height));
  return Math.max(1, scale);
}

export function createSurface(canvas, { width, height }) {
  const ctx = canvas.getContext('2d');

  // The backing store: fixed low internal resolution. This never changes.
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;

  const surface = {
    ctx,
    width,
    height,
    scale: 1,
    resize,
    toCanvasCoords,
  };

  function resize() {
    const scale = computeScale(width, height);
    surface.scale = scale;
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
    // Re-assigning the backing store dimensions resets any 2D context
    // state (including imageSmoothingEnabled), so only do it if it ever
    // actually changed — here it never does, but guard anyway in case a
    // future caller resizes the internal resolution too.
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = false;
    }
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
 * How many INTERNAL canvas px of `canvas`'s own top edge sit underneath
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
