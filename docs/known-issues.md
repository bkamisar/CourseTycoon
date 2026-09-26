# Known issues

Things found by playing that are not yet fixed. Each one is written from
what the player saw, not from a guess about the cause — the cause is for
whoever picks it up.

Fixed entries are deleted rather than annotated. A file of mostly-solved
problems is one nobody reads, and a stale entry here is worse than no
entry: it sends the next session chasing something that is already done.

---

## Open

### Half the Act II runs still end unresolved

**Narrowed:** 2026-09-26. The original complaint -- that the fortnightly review
was one problem wearing four hats -- is fixed. What is left is a different
thing that the fixing exposed.

The measures are real now. Revenue per room had no ceiling and compounded until
it could not be met; occupancy could not be failed by anybody, because a hotel
is always full by design. Revenue per room now stops at a full house, occupancy
has been replaced by turf quality, and the prestige and satisfaction ceilings
were raised off the floor they had sunk below. Measured:

| measure | before | after |
|---|---|---|
| revenue per room | 87% missed | 39% |
| prestige | 11% | 48% |
| guest satisfaction | 0% | 44% |
| occupancy -> turf | 3% | 1% for a competent operator, fatal for a careless one |

Both failure modes work. Overpricing liquidates 6 of 8 at $700 and 8 of 8 at
$900; refusing to hire greenkeepers liquidates 8 of 8 while turf sits at 42-61.

**What is left:** at a viable price, about half of all runs neither settle nor
fail inside 260 days. They are not lost -- confidence simply never climbs the
thirty points from 55 to the 85 the offer needs, and the act just keeps going.

The arithmetic is in `CONFIDENCE_CHANGE`'s comment. At a third of reviews
missed the climb takes about ten reviews, which fits; the runs that stall are
the ones that miss rather more than that and spend the act treading water. A
resort doing moderately badly has no ending of its own -- it is not bad enough
to be pulled out of and not good enough to be bought out from.

Worth considering whether the offer should have a second route: time served
with reasonable confidence, say, rather than a single threshold. A fortnightly
relationship that can run for ever without resolving is the one shape the act
should not have.

### Rooms build to the planning cap, and that is the design

**Closed:** 2026-09-26, after trying to fix it and finding it was not broken.

Every rate from $60 to $575 ends with 67-71 rooms against a cap of 72, at
~100% occupancy. That reads like a missing decision -- you build to the ceiling
every time -- and it is what led to this being filed.

It is deliberate, and `rooms.js` says so where the limit is defined:

> A limit on demand would have been the obvious fix and the wrong one:
> building rooms is supposed to be good. This is a limit on BUILDING, in the
> form the world already has one -- planning permission. It starts small, and
> it grows with the resort's reputation... So it is a goal rather than a wall:
> the answer to "I want more rooms" is "be worth more rooms".

The decision is not "how many rooms" but "how do I earn permission for more",
which is a different question and a real one.

**The attempt, recorded so nobody repeats it.** Room demand assumed every
golfer wanted a bed of their own -- no sharing at all -- which put demand at
roughly three times anything a player may build: a 120-room hotel still ran at
100% with 93 turned away against a cap of 72. Dividing by two guests to a room
is more honest about what a hotel is, and it halves demand to about 107.

It also breaks the act. At prestige 75 planning permits 61 rooms, and with
sharing modelled:

      8 rooms   100% full   +$25/night
     40 rooms    65% full   -$425
     61 rooms    48% full   -$1,023   <- the permitted maximum
    120 rooms    24% full   -$4,523

A limit that permits 61 rooms while the economics support 8 is a trap, not a
goal. Reverted.

**What this leaves.** Occupancy is a weak investor measure (3% missed) as a
direct consequence of this design, and that is the honest place to fix it if it
wants fixing -- change what the investors ask about, rather than break a hotel
that is working as intended. See the entry above.

### The turf self-heals when a resort empties out

**Found:** 2026-09-23, while making play wear the course. **Known and
accepted by the author for now.**

Wear scales with traffic, so a resort that loses its golfers also stops
damaging its greens, recovers, and draws them back. It is realistic and
it works against "hard to dig out of". Left deliberately; revisit if a
collapse ever feels too easy to recover from.
