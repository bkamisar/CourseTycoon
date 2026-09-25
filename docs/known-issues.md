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

### The run-up costs nothing, and the player cannot aim at the band

**Found:** 2026-09-25, measuring Act III before building its surface. **The
biggest open problem in the act.**

Two faults, measured on a real eighteen-hole course over a full 21-day run-up,
turf starting at 90:

| keepers | conditioning | final setup | final turf | profit over 21 days |
|---|---|---|---|---|
| 3 | no  |   0 |  58 | -$88,800 |
| 3 | yes |  50 |  58 | -$88,184 |
| 6 | no  |   0 | 100 | -$94,592 |
| 6 | yes | 100 | 100 | -$87,200 |
| 9 | no  |   0 | 100 | -$109,888 |
| 9 | yes | 100 | 100 | -$99,856 |

**1. Conditioning is free, and in fact pays.** `day.js` computes
`care = keepers * 6.8` with no reference to `conditioning`, so the same crew
raises setup and holds the turf at the same time. Final turf is identical either
way, and conditioning ends $7,392 AHEAD over the run-up at six keepers. The
design says "the cost is the everyday business... paid in full before anything
is paid back". There is no cost. This compounds the separate satisfaction issue
below: a conditioned resort is simply a better business.

**2. There is no dial.** `conditioning` is derived as
`Boolean(next.tournament && !next.tournament.resolved)`, so setup climbs
automatically from the moment a bid is won and the player cannot stop it or aim
it. Six keepers reach setup 100 in 21 days, overshooting every band including
the County Open's 45-60. The only lever is crew size, which also governs turf,
so the two bonuses pull against each other:

- 3 keepers -> setup 50 (county band met) but turf 58 (turf bonus needs 78)
- 6 keepers -> turf 100 (met) but setup 100 (band missed, overcooked)

That tension is good and worth keeping. What is wrong is that it is the ONLY
control, and it is indirect: aiming at the band means firing groundskeepers.
The design's "the dial therefore has an interior optimum, which is how every
real decision in this game already works" does not hold, because the player
never touches the dial.

**A fix wants both halves**, and it is design work rather than a patch:

- a target setup the player sets, with `conditioning` driven by whether the
  course is below it, so the crew stops when it arrives; and
- conditioning diverting crew effort away from turf care, so `care` falls while
  they are preparing. That makes "hire more for the championship" a real
  decision with a real bill, which is what the design wanted from reusing the
  grounds crew in the first place.

Until then Act III's economics cannot be judged, and building its screens would
be building a surface for a decision that is not yet there.

### Conditioning a course raises average satisfaction instead of costing it

**Found:** 2026-09-25, wiring setup into `runDay` (Task: wire the setup dial
into `courseDifficulty`, demand and satisfaction).

The intent, and what `tests/tournamentDay.test.js` asserts, is that setting
a course up for a championship should cost something: locals' ideal
difficulty is 30, championship condition pushes `courseDifficulty` up
toward 60-90, and a course that far from what locals want should be a
worse day out for the resort on average.

Measured instead (`actThreeResort`, prestige 80, a 3-hole course, six
extra groundskeepers, setup at 90 with a national championship booked,
against setup at 0 with none): average satisfaction across six days is
about 20-25 points *higher* conditioned than not, not lower.

The cause is self-selection, not a bug in the wiring. `courseDifficulty`
correctly feeds both who shows up (`economy.demandGroups`, via
`segments.crowdMix`) and how they feel about it (`satisfaction.
guestSatisfaction`) — deliberately one number, per the existing comment in
`day.js` above where it's computed, so the crowd that arrives and the
crowd that leaves happy can never disagree about the course. But at
prestige 80 the tee sheet is capacity-bound (sold out) regardless of
difficulty: raising `courseDifficulty` toward serious golfers' ideal (72)
does not just repel locals, it also raises total appeal (locals'
`SEGMENTS.locals` appeal collapses from ~0.50 to ~0.08 at these numbers,
but serious's jumps from ~0.19 to ~0.93). A capacity-bound resort simply
refills the same number of tee times with more serious golfers, who are
both a better fit for the harder course AND, independent of difficulty,
score higher on `guestSatisfaction`'s other terms (lower price
sensitivity, higher turf weight against turf this resort already keeps
decent). The population average goes up because the population changed,
not because anyone's individual day got better in isolation — locals who
do still turn up score noticeably worse, they are just a shrinking
fraction of who shows up at all.

`tests/tournamentDay.test.js`'s third test is marked `todo` with the
measured numbers rather than adjusted or deleted, because the assertion
still states the intended design correctly. A fix would touch
`segments.js` or `economy.js` tuning (e.g. making the demand-side
crowd-mix reaction to difficulty weaker than the satisfaction-side hit,
or capping how far conditioning can push a capacity-bound resort's
appeal), which is balance work outside a wiring task.

### Dee asks for food she is already carrying

**Found:** 2026-09-25, from play. Reported as "what does this prompt nudge me to
do that I haven't done?" -- which is the tell: the player could not work out
what was being asked of them, because nothing was.

The line is `dee-5` in `src/sim/narration.js`:

> Three fellas asked if I do food. Told them to take it up with you.

Its `when` is `(c) => c.hasCart` and nothing else, so it fires the moment the
player owns a beverage cart regardless of whether they sell food anywhere. A
new game's cart carries three drinks and one food item by default, so the
first time this line appears Dee is asking the owner for something already on
her own cart.

The comment directly above her lines states the principle it breaks:

> Dee only speaks if she is actually out there. A voice from an amenity the
> player has not built is the world telling them about something that does
> not exist.

Same fault one level down -- gated on the cart existing, not on the thing the
line is actually about.

The fix wants a food condition on the narration context (`src/sim/narration.js`
builds it around line 95), something like "no food is sold on the course" --
true when no `cartable` food item sits in the cart's four slots and no snack
shack or halfway house exists. `ITEMS[id].cartable` and `MENU_SLOTS` already
carry everything needed; the context simply never asks.

Worth a sweep of the other `when` clauses at the same time. This one was found
by a player wondering what they had missed, which is an expensive way to find
out that a line meant nothing, and it is unlikely to be the only line whose
premise goes unchecked.

### "Crowd handled" is a bonus nobody can fail

**Found:** 2026-09-25, wiring the hosting contract (Act III Task 7).

`scoreTournament` judges four named conditions and the contract card will
advertise all four with a price against each. `crowdHandled` is hardcoded
`true` in `src/sim/day.js`, so one of the four is paid unconditionally.

This much is deliberate and commented: the gallery is handled by
infrastructure -- grandstands, overflow parking -- which Plan 2 builds, and a
rung with no building requirements has nothing to fail at. The County Open
genuinely requires no buildings, so a free pass there is arguably correct.

What is not correct is that it stays free at Regional and National, which the
spec gates on grandstands, overflow parking, a media centre and a hospitality
pavilion. Until those exist, a national can bank its crowd bonus with no
gallery provision whatsoever.

The cost, measured: it lifts the contract's floor by 13% of the base-to-ceiling
gap at every rung -- $3,900 on a County Open, $23,400 on a National.

Fix alongside Plan 2's infrastructure buildings: judge it against whether the
rung's required buildings exist and are adequate for the gallery that rung
draws. Do not simply flip it to `false` in the meantime -- that makes a bonus
the card advertises permanently unearnable, which is the same lie pointing the
other way.

### The turf self-heals when a resort empties out

**Found:** 2026-09-23, while making play wear the course. **Known and
accepted by the author for now.**

Wear scales with traffic, so a resort that loses its golfers also stops
damaging its greens, recovers, and draws them back. It is realistic and
it works against "hard to dig out of". Left deliberately; revisit if a
collapse ever feels too easy to recover from.
