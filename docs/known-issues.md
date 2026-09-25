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

### The run-up costs nothing, so the whole ladder is a rounding error

**Found:** 2026-09-25, measuring Act III with the operator before building its
surface. **The one thing standing between Act III and being playable.**

Eight resorts carried through Acts I and II into Act III, same seed on both
sides of every comparison, 220 days each.

**Bidding barely matters.** It beat never bidding in 3 runs of 8, and the
differences (-$81,515 to +$26,550) are noise against a $4,000,000 profit. All
eight hosted a County Open and all eight took 100% of the ceiling, so the
contract is not a test a competent operator can fail.

**Because the run-up is free.** Trade while conditioning was $46,250 a day
against $45,987 on ordinary days -- a fraction of a per cent, and HIGHER in
five runs of eight. The design says the cost is the everyday business, "paid in
full before anything is paid back". Nothing is paid.

**The scale, measured on a resort arriving in Act III** (prestige 93, 71 rooms,
18 holes, 20 amenities, 19 staff):

    revenue  $46,956/day     costs  $28,496/day     profit  $18,460/day

    a County Open's $48,000 ...... 2.6 days of profit
    the entire ladder, $458,000 .. 24.8 days of profit

**The purses are not the problem, which is the useful part.** At $18,460 a day
the run-up spans 21 days, so a conditioning cost of roughly 9% of trade (about
$38,800) makes all three of the design's claims true at the existing numbers:

| outcome | pays | against a $38,800 run-up |
|---|---|---|
| base alone | $18,000 | -$20,800, loses money |
| about half the bonuses | ~$33,000 | -$5,800, roughly breaks even |
| all four | $48,000 | +$9,200, a real gain |

**The fix wants conditioning to divert the grounds crew from turf care.** One
crew currently does both jobs at once -- `day.js` computes `care = keepers *
6.8` with no reference to `conditioning` -- so preparing a championship costs
no turf and no money. Diverting a share of that care during the run-up would:

- cost trade through course rating, which is the bill the design asked for;
- put the band and turf bonuses in real tension, since holding both means
  hiring; and
- give "hire more grounds staff for the championship" a reason to exist, which
  is what the design wanted from reusing the crew in the first place.

Preferred over the satisfaction route below, which would need per-segment
catchment caps and would change crowd composition in Acts I and II as well,
invalidating their balance numbers. This change is contained to Act III's
run-up.

**Also found:** the ladder hard-stops at rung one. Every resort hosted a County
Open and then stopped, because Regional requires grandstands and overflow
parking and those buildings do not exist until Plan 2. Expected, but it means
nothing above rung one has ever been measured.

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
