# Known issues

Things found by playing that are not yet fixed. Each one is written from
what the player saw, not from a guess about the cause — the cause is for
whoever picks it up.

Fixed entries are deleted rather than annotated. A file of mostly-solved
problems is one nobody reads, and a stale entry here is worse than no
entry: it sends the next session chasing something that is already done.

---

## Open

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

### The National's crowd bonus costs ten times what it pays

**Found:** 2026-10-03, measuring the championship ladder (`tools/actThree.js`).
Seen by the operator, not yet by a player.

The National's contract lists "Crowd handled without complaint" as a bonus
($92,560 at the current purse). With the media centre, the pavilion, the
grandstands, the overflow parking, the brew pub, the function room, the
conference suite and the pool all built, the property holds 11,600 of the
12,000 the National draws, so the bonus stays unpaid. The one building that
closes the gap is the short course, and a player who builds it watches their
ordinary takings fall: about $4,600 a day of profit, $0.99M-$1.25M over 240
days on eight measured resorts. So the bonus is on the contract, visibly
missed every time, and the only way to earn it loses ten times what it pays.
A player will reasonably read that as a bonus the game will not let them have.

### Regional championships overshoot their target more often since the run-up work

**Found:** 2026-10-04, re-measuring the ladder.

In 32 simulated ladders, the Regional hit its target first time in 22, down from 25
before weather slowed the crew and championships got their own events. All 14 misses
finished too high (the winner at +9 to +14 against a range of +2 to +8), none too low.
The cause has not been diagnosed: it may be weather on the setup climb, the practice
round, an event effect, or noise at this sample size. The measuring operator never reads
the practice round's forecast, so it cannot correct course the way a player can.
