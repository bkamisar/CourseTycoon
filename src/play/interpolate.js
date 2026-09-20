/**
 * Turns the day's timeline into positions a renderer can draw at any given
 * minute, by linear interpolation between whichever two recorded events
 * bracket that minute.
 *
 * Two things this module deliberately does NOT do:
 *  - It does not know about canvases, sprites or PALETTE. It hands back
 *    plain numbers; `src/render/tokens.js` turns those into pixels.
 *  - It does not track every ball. Per the Task 8 scope decision, the
 *    course-wide view follows one token per GROUP, moving through holes in
 *    sequence -- not forty balls at once. Per-guest ball flight
 *    (`guestBallPositionAt`) exists only for the zoomed single-hole view.
 */

/**
 * Interpolates `fields` at `minute` across a sorted-by-minute keyframe
 * list. Returns null before the first keyframe and after the last -- the
 * thing being tracked simply does not exist there yet/anymore, rather than
 * snapping to an edge value (which would draw a group on the first tee
 * before it has teed off, or stranded on the course after it has gone
 * home).
 */
export function interpolateAt(keyframes, minute, fields) {
  if (!keyframes.length) return null;
  if (minute < keyframes[0].minute) return null;
  if (minute > keyframes[keyframes.length - 1].minute) return null;

  // minute is guaranteed <= keyframes[last].minute by the check above, so
  // this loop always finds a bracketing pair and returns from inside it.
  for (let i = 1; i < keyframes.length; i++) {
    const a = keyframes[i - 1];
    const b = keyframes[i];
    if (minute > b.minute) continue;

    const out = {};
    if (b.minute === a.minute) {
      for (const f of fields) out[f] = b[f];
    } else {
      const t = (minute - a.minute) / (b.minute - a.minute);
      for (const f of fields) out[f] = a[f] + (b[f] - a[f]) * t;
    }
    return out;
  }
}

// --- Course-wide group progress (the resort-overview token view) ----------

/**
 * Course-progress keyframes for one group: `holeIndex` 0 at tee-off, one
 * more keyframe at the minute of the group's FIRST event on each hole it
 * reaches (in order), and `holes.length` at `finish` (off the far end of
 * the course). `holes` is the list of open holes in play order, as passed
 * to `runDay` -- `holeIndex` is a position in that array, not a hole id.
 *
 * The gap between consecutive keyframes is deliberately left to interpolate
 * smoothly rather than split into "travel" and "wait" pieces: `buildTimeline`
 * (src/sim/day.js) already stamps a hole's first event AFTER any wait for
 * that hole to clear, so a hole backed up with queued groups produces a
 * wide minute-gap between keyframes -- and every group's token, told to
 * cover the same hole-to-hole distance over that wide gap, visibly crawls
 * rather than jumping. That crawl, several tokens doing it in the same
 * screen area at once, *is* the bunching this exists to show.
 */
export function groupCourseKeyframes(timeline, groupIndex, holes) {
  const holeIndexOf = new Map(holes.map((h, i) => [h.id, i]));
  const events = timeline
    .filter((e) => e.groupIndex === groupIndex)
    .slice()
    .sort((a, b) => a.minute - b.minute);

  const teeOff = events.find((e) => e.type === 'teeOff');
  const finish = events.find((e) => e.type === 'finish');
  if (!teeOff || !finish) return [];

  const keyframes = [{ minute: teeOff.minute, holeIndex: 0 }];
  const seen = new Set();
  for (const e of events) {
    if (e.holeId === undefined) continue;
    const holeIndex = holeIndexOf.get(e.holeId);
    if (holeIndex === undefined || seen.has(holeIndex)) continue;
    seen.add(holeIndex);
    keyframes.push({ minute: e.minute, holeIndex });
  }
  keyframes.push({ minute: finish.minute, holeIndex: holes.length });

  return keyframes;
}

/**
 * A group's course position at `minute`, as a continuous number: the
 * integer part is the hole index it is on (or `holes.length` once it has
 * finished), the fractional part is how far through that hole/transition it
 * is. Null before tee-off and after finish, per the same rule as
 * `interpolateAt`.
 */
export function groupCourseProgressAt(timeline, groupIndex, holes, minute) {
  const keyframes = groupCourseKeyframes(timeline, groupIndex, holes);
  const pos = interpolateAt(keyframes, minute, ['holeIndex']);
  return pos ? pos.holeIndex : pos;
}

// --- Per-guest ball flight (the zoomed single-hole view) -------------------

/**
 * Ball-position keyframes for one guest on one hole: the `from` of their
 * first recorded shot there, then the `to` of every shot in order. Ignores
 * every other guest, group and hole in the timeline.
 */
export function guestBallKeyframes(timeline, groupIndex, guestId, holeId) {
  const shots = timeline
    .filter(
      (e) =>
        e.type === 'shot' &&
        e.groupIndex === groupIndex &&
        e.guestId === guestId &&
        e.holeId === holeId
    )
    .sort((a, b) => a.minute - b.minute);

  const keyframes = [];
  shots.forEach((shot, i) => {
    if (i === 0) keyframes.push({ minute: shot.minute, x: shot.from.x, y: shot.from.y });
    keyframes.push({ minute: shot.minute, x: shot.to.x, y: shot.to.y });
  });
  return keyframes;
}

/** A guest's ball position on one hole at `minute`, or null off either end. */
export function guestBallPositionAt(timeline, groupIndex, guestId, holeId, minute) {
  const keyframes = guestBallKeyframes(timeline, groupIndex, guestId, holeId);
  return interpolateAt(keyframes, minute, ['x', 'y']);
}
