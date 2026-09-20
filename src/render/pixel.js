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
