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

### The run-up costs something now, but not enough to make bidding a real decision

**Found:** 2026-09-25, measuring Act III with the operator before building its
surface. **Partially fixed the same day** -- `day.js`'s `care` is now cut by
`CARE_DIVERTED_WHILE_CONDITIONING` (`tournaments.js`, 0.4) while a
championship is being conditioned for, so one crew doing both jobs at once no
longer holds the turf for free. What follows is what that fix did and did not
change, measured the same way as the original finding, so this does not read
as fixed twice.

**Turf now measurably costs something.** An identical crew conditioning vs.
not, otherwise the same seed and holes, separates by double digits of turf
quality inside fifteen days (`tests/tournamentDay.test.js`), where before this
fix the two were indistinguishable. That part of the design's promise --
"paid in full before anything is paid back" -- is real now, in the one place
it can be measured cleanly.

**Bidding still barely matters, and the reason is now understood rather than
just observed.** Re-run the same eight-seed sweep after the fix: bidding still
beat never bidding in only 3 of 8 runs, by amounts (-$88,835 to +$40,632) still
noise against a $4,000,000 profit, and every hosted championship still took
100% of the ceiling. Trade while conditioning fell only 0.4-2.5% below ordinary
days across eight seeds at the *most* diversion this lever can apply (100%,
i.e. conditioning holds no turf at all) -- nowhere near the 7-12% (~$38,800
over the run-up) the purses need to make base-alone lose, half-the-bonuses
break even, and all-four a real gain.

**Why more diversion does not close the gap:** the operator's own fixture
(prestige ~94, 71 rooms, 18 holes, green fee 80, interval 14) is capacity- and
catchment-bound. Measured directly: raw demand ("wanted") ran 5-6x the tee
sheet's ceiling even with turf driven to 0 and setup to 100 *together* -- the
tee sheet and the hotel both stayed full regardless. Green fees and room
nights, the bulk of a day's trade, do not move at all under a capacity bound;
only merchandise and food shift, because they alone read `averageSatisfaction`
rather than group count, and that is a few hundred dollars on a $46,000 day.
This is the same mechanism as "Conditioning a course raises average
satisfaction instead of costing it" below -- a capacity-bound tee sheet
insulates the day's numbers from course quality, whichever number is being
asked to carry the cost. Turf, satisfaction, and trade all run into the same
wall from different sides.

**0.4 was chosen against a constraint this task could still check: the turf
bonus must stay reachable.** Above roughly 0.5, holding turf at or above 78
through a full run-up stops being possible on eighteen holes with anything
under a dozen groundskeepers, on even the easiest rung. At 0.4, nine hold a
national's band and turf together for the full 21 days. Pushing the constant
higher trades an unreachable bonus for a trade-percentage gain the demand
model mostly refuses to pay out anyway (0.4 vs. 1.0 measured within a couple
of points of each other).

**What would actually close the gap:** the trade-through-demand channel is
capped by the tee sheet and the catchment, not by this constant. Making the
run-up cost 7-12% of trade needs a channel that is not capacity-bound --
raising the actual conditioning wage bill, adding a cost that scales with the
crew hired for the week rather than with course rating, or loosening the
catchment/capacity ceilings enough that quality can move group count again.
Any of those is balance work bigger than a wiring fix, and changes the
numbers this same file's purses were tuned against, which is why it was not
attempted here.

**Also still true:** the ladder hard-stops at rung one. Every resort hosted a
County Open and then stopped, because Regional requires grandstands and
overflow parking and those buildings do not exist until Plan 2. Nothing above
rung one has ever been measured.

### Bidding and then not preparing is the best line in Act III

**Found:** 2026-09-25, after the third attempt at making the run-up cost
something. **A live exploit, and the reason Act III is not yet a decision.**

Measured over the 22-day window from bid to hosting day, money-delta ground
truth, five seeds: bidding and leaving `setupTarget` at 0 -- never conditioning
at all -- nets **+$10,200 to +$11,600 against never bidding, in every seed,
with tight variance.** Properly conditioning beat the free ride in only three
of five.

**Why.** Three of the four contract conditions are satisfied by ordinary
operation:

- **turf** -- `TURF_EXPECTED` is 78 and a normally-staffed course sits near 100,
  so it passes without preparing. Care is only diverted while conditioning, so
  the free ride never pays even that.
- **pace** -- met by normal flow at the default tee interval.
- **crowd** -- hardcoded `true` pending Plan 2's buildings.

Only **band** requires conditioning. So a player pays a $33,000 run-up bill for
a single $12,000 bonus, while the free ride banks base plus three bonuses --
$36,000 of a $48,000 ceiling -- for nothing, and the one closed day is more
than covered by the championship night's own hotel premium.

**The deeper problem, which four fixes have now failed to reach.** The contract
is internally coherent: the run-up bill is (base + ceiling) / 2, so base alone
loses, half breaks even and all four gains, exactly, at every rung. But that
only makes bidding coherent, not significant. A resort arriving in Act III
earns **$18,460 a day**. A County Open's ceiling is 2.6 days of profit and the
entire three-rung ladder is 24.8 days. Across a 220-day run the whole act moves
total profit by less than the noise from investor timing and decision events.

And only the County Open is ever reachable: Regional needs grandstands and
overflow parking, National a media centre and hospitality pavilion, and none of
those buildings exist yet. So the cheapest rung is the only rung, measured
against an economy a hundred times its size.

**What this means for the design.** Act III's stakes cannot be financial at
this scale without either purses several times larger, or the act arriving
while the resort is much smaller. The alternative is to accept the money as
incidental and let the real stakes be prestige and ladder position -- which is
what was chosen when the act was brainstormed, and what the spec already
describes in its stakes section.

Do not attempt a fifth cost channel before that question is settled. Three have
now died on the same wall.

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
