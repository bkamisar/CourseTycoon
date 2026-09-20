/** Total arc length of a polyline, in yards. */
export function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

/** The point `distance` yards along the polyline, clamped at both ends. */
export function pointAtDistance(path, distance) {
  if (distance <= 0) return { ...path[0] };
  let remaining = distance;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const segment = Math.hypot(dx, dy);
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment;
      return { x: path[i - 1].x + dx * t, y: path[i - 1].y + dy * t };
    }
    remaining -= segment;
  }
  return { ...path[path.length - 1] };
}

/** Shortest distance from a point to the polyline, in yards. */
export function distanceToPath(path, point) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    best = Math.min(best, distanceToSegment(path[i - 1], path[i], point));
  }
  return best;
}

function distanceToSegment(a, b, p) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Projection parameter, clamped to the segment.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * How far along the polyline a point sits, in yards, by projecting onto
 * each segment and keeping the nearest. Closed form, not sampled: this is
 * called for every hazard on every stat recomputation, and the editor
 * recomputes while the player drags.
 */
export function progressAlongPath(path, point) {
  let best = 0;
  let bestDist = Infinity;
  let cumulative = 0;

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const segment = Math.sqrt(lengthSq);

    let t = lengthSq === 0
      ? 0
      : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const dist = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    if (dist < bestDist) {
      bestDist = dist;
      best = cumulative + t * segment;
    }
    cumulative += segment;
  }
  return best;
}
