/**
 * The camera for playing a hole.
 *
 * The editor draws the whole hole in one rectangle, and that is the right
 * view for designing it. It is the wrong view for playing it: a par 5 fits
 * a phone at well under a pixel to the yard, where a green is a dozen
 * pixels across and a six-foot putt is not a distance at all. So the
 * playable mode looks at the part of the hole the next shot is about.
 *
 * This does NOT draw the hole a second way. It is `computeHoleTransform`
 * — the editor's own mapping — followed by a zoom about a point, and it
 * hands back that zoom as the three numbers a canvas needs
 * (`translate(tx, ty)` then `scale(zoom, zoom)`), so the play screen calls
 * the one and only `drawHole` under a canvas transform. Whatever
 * `drawHole` paints is what `lieAt` returns; zooming a true picture
 * leaves it true.
 *
 * Pure: no canvas, no DOM. `toScreen`/`toWorld` are exact inverses, which
 * is what lets a finger on the glass name a yard on the hole.
 */
import { computeHoleTransform } from './holeView.js';
import { greenCentre } from '../sim/hole.js';
import { greenRadius, LIE } from '../sim/terrain.js';
import { reachFrom } from '../sim/playGolf.js';

/** The closest the camera gets. Five pixels to the yard puts the smallest
 * green (11 yards radius) at 110 px across on a 180 px canvas. */
export const MAX_PX_PER_YARD = 5;

/** Yards of ground shown around the things a shot is about. */
const FRAME_PAD = 25;
/** Never frame less than this many yards, however short the shot. */
const FRAME_MIN_SPAN = 40;
/** Yards of fringe shown round a green while putting. */
const GREEN_PAD = 4;
/** The cup is kept in view when it is within this many reaches of the ball. */
const CUP_IN_VIEW_REACHES = 1.6;

/** The smallest world rectangle (centre + size, yards) holding `points`, padded. */
export function frameAround(points, { pad = FRAME_PAD, minSpan = FRAME_MIN_SPAN } = {}) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: Math.max(minSpan, maxX - minX + pad * 2),
    height: Math.max(minSpan, maxY - minY + pad * 2),
  };
}

/**
 * A frame `k` of the way from `a` to `b` (0 is `a`, 1 is `b`). Sizes move
 * by ratio rather than by difference, so a zoom in and a zoom out of the
 * same amount take the same time and neither lurches at its end.
 */
export function blendFrame(a, b, k) {
  const t = Math.min(1, Math.max(0, k));
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    width: a.width * Math.pow(b.width / a.width, t),
    height: a.height * Math.pow(b.height / a.height, t),
  };
}

/** What the camera holds while a full shot is in the air: the ball and
 * where it is going to come down, so it closes in on the landing as the
 * ball drops toward it. */
export function followFrame(ball, landing) {
  return frameAround([ball, landing]);
}

/**
 * What the camera should hold for the shot about to be played: the whole
 * green when putting; otherwise the ball, where the caddie is pointing,
 * and the cup too if it is near enough to be worth seeing.
 */
export function shotFrame(hole, play, target) {
  const cup = greenCentre(hole);
  if (play.lie === LIE.GREEN) {
    const span = (greenRadius(hole) + GREEN_PAD) * 2;
    return { cx: cup.x, cy: cup.y, width: span, height: span };
  }
  const points = [play.ball, target];
  const toCup = Math.hypot(cup.x - play.ball.x, cup.y - play.ball.y);
  if (toCup <= reachFrom(play.lie) * CUP_IN_VIEW_REACHES) points.push(cup);
  return frameAround(points);
}

/**
 * A camera showing `frame` inside `viewRect` (canvas px), never zoomed
 * out past the editor's whole-hole view and never in past MAX_PX_PER_YARD.
 *
 * Returns `{ toScreen, toWorld, scale, zoom, tx, ty }`. To draw:
 *
 *   ctx.save();
 *   ctx.translate(cam.tx, cam.ty);
 *   ctx.scale(cam.zoom, cam.zoom);
 *   drawHole(ctx, hole, viewRect);
 *   ctx.restore();
 *
 * and then draw the ball, target and so on unzoomed at `cam.toScreen(p)`,
 * so they stay crisp single pixels at any zoom.
 */
export function makePlayCamera(hole, viewRect, frame) {
  const base = computeHoleTransform(hole, viewRect);
  const fit = Math.min(viewRect.width / frame.width, viewRect.height / frame.height);
  const scale = Math.max(base.scale, Math.min(MAX_PX_PER_YARD, fit));
  const zoom = scale / base.scale;

  let tx = 0;
  let ty = 0;
  // At zoom 1 the frame is the whole hole (or more): show it exactly as
  // the editor does rather than centring on the frame and pushing part of
  // the hole off the canvas.
  if (zoom > 1) {
    const centre = base.toScreen({ x: frame.cx, y: frame.cy });
    tx = viewRect.x + viewRect.width / 2 - zoom * centre.x;
    ty = viewRect.y + viewRect.height / 2 - zoom * centre.y;
  }

  function toScreen(point) {
    const b = base.toScreen(point);
    return { x: tx + zoom * b.x, y: ty + zoom * b.y };
  }

  function toWorld(point) {
    return base.toWorld({ x: (point.x - tx) / zoom, y: (point.y - ty) / zoom });
  }

  return { toScreen, toWorld, scale, zoom, tx, ty };
}
