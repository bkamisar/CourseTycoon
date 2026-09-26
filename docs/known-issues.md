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

### Missing the band still raises your reputation

**Found:** 2026-09-25, writing the championship result card, which ended up
arguing with itself.

`scoreTournament` sets prestige from how many conditions were met and nothing
else:

    prestige = round(((met.length / 4) * 2 - 1) * PRESTIGE_SWING[rung])

The band gates the *money* -- a venue outside its band takes the base fee and
none of the bonuses -- but it does not gate reputation. So a resort that turns
up to a **National Open with the course set to 12**, against a band of 80-92,
and happens to have good turf, good pace and a covered gallery, scores three of
four and comes away **+9 prestige**. Its reputation improves.

The spec is explicit that this should go the other way: "turn up at a national
with the course set for a county open and the field embarrasses you", and a
course outside its band produces "a write-up worse than never having bid".

Caught because the result card printed "a venue that turns up outside the band
has not staged a championship" and then, two sentences later, "word gets round,
and it gets round in your favour". The card has been changed to stay quiet
about standing on a week where the band was missed, so the contradiction is no
longer visible -- but that is covering for the simulation rather than fixing
it, and it is recorded here so the next session does not mistake the quiet card
for a solved problem.

**The fix is a design decision, not a patch.** Either prestige is gated by the
band the way the money is, or a missed band carries its own reputation penalty
that outweighs whatever the other three conditions earned. The second is
probably better: it keeps turf, pace and crowd meaning something on a week that
went wrong in one specific way, while still making "we set the course wrong"
the worst thing that can happen to a venue's standing.

Worth doing alongside the barring rule, which has the same shape -- `barDays`
currently triggers on `met.length <= 1`, so the same badly-set course that
gains prestige also escapes being barred.

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

### The turf self-heals when a resort empties out

**Found:** 2026-09-23, while making play wear the course. **Known and
accepted by the author for now.**

Wear scales with traffic, so a resort that loses its golfers also stops
damaging its greens, recovers, and draws them back. It is realistic and
it works against "hard to dig out of". Left deliberately; revisit if a
collapse ever feels too easy to recover from.
