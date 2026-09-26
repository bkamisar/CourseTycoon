# Known issues

Things found by playing that are not yet fixed. Each one is written from
what the player saw, not from a guess about the cause — the cause is for
whoever picks it up.

Fixed entries are deleted rather than annotated. A file of mostly-solved
problems is one nobody reads, and a stale entry here is worse than no
entry: it sends the next session chasing something that is already done.

---

## Open

### Two of the four investor measures are still formalities

**Narrowed:** 2026-09-26, after giving revenue per room a ceiling. The
original complaint -- that the review was one problem wearing four hats -- is
mostly fixed, and what is left is smaller and worth stating precisely.

Revenue per room was the only measure with no ceiling, so it compounded 7% a
fortnight until it could not be met, and accounted for nearly every failure.
It now stops at a full house. Measured across 371 reviews:

| measure | before | after |
|---|---|---|
| revenue per room | 87% missed | 38% |
| prestige | 11% | 11% |
| occupancy | 5% | 3% |
| guest satisfaction | 0% | 0% |

**What is left:** occupancy and satisfaction are still passed by existing --
3% and 0% respectively. Revenue per room is now a real test and prestige is a
mild one, so the fortnightly meeting is two genuine questions rather than one,
but it is not four.

Occupancy cannot be a test while every room fills at any sane price (see the
room-ratchet entry below). Satisfaction cannot be a test while it barely moves.
Both want the hotel to have a reason to run less than full, which the
per-population catchment did not provide -- it caps how many GOLFERS exist, and
room demand keys off the crowd that turns up rather than off a separate
population of people wanting beds.

Not urgent. The act now has a proper shape without it: a viable band from $150
to $575, poverty below it, and total collapse above $700 where eight resorts in
eight are liquidated, one of them left with $2,979. There is a real risk-reward
inside the band too -- $300 buys the investors out 7 times in 8 for about $1.1M,
$575 earns three times as much and leaves half the runs unsettled.

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
