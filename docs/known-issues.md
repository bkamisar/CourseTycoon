# Known issues

Things found by playing that are not yet fixed. Each one is written from
what the player saw, not from a guess about the cause — the cause is for
whoever picks it up.

Fixed entries are deleted rather than annotated. A file of mostly-solved
problems is one nobody reads, and a stale entry here is worse than no
entry: it sends the next session chasing something that is already done.

---

## Open

### Act II has never been measured

**The most important thing outstanding.** `tools/operator.js` has no
notion of rooms, room rates, hotel amenities or investors — it plays Act
I and stops. So nothing is known about whether Act II is any good, only
that its mechanics fire correctly.

The questions nobody can currently answer:

- Is building rooms a ratchet? Upkeep bills whether a bed is filled or
  not, which is supposed to be the brake, but is the optimum simply
  "build to the catchment and coast"?
- Are the four investor measures four problems or one? If a single way of
  running the hotel satisfies occupancy, revenue per room, prestige and
  satisfaction together, the fortnightly review is a formality.
- Can a competent operator actually lose? Confidence has to be able to
  reach zero without the player trying to fail.
- Do the fourteen hotel amenities support more than one build?

Act I looked fine on spot measurements the day it shipped broken. The
operator is the only thing that has ever caught a real balance problem on
this project, and it has never been pointed at this act.

### The turf self-heals when a resort empties out

**Found:** 2026-09-23, while making play wear the course. **Known and
accepted by the author for now.**

Wear scales with traffic, so a resort that loses its golfers also stops
damaging its greens, recovers, and draws them back. It is realistic and
it works against "hard to dig out of". Left deliberately; revisit if a
collapse ever feels too easy to recover from.
