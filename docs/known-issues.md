# Known issues

Things found by playing that are not yet fixed. Each one is written from
what the player saw, not from a guess about the cause — the cause is for
whoever picks it up.

Fixed entries are deleted rather than annotated. A file of mostly-solved
problems is one nobody reads, and a stale entry here is worse than no
entry: it sends the next session chasing something that is already done.

---

## Open

### The fortnightly review is one problem wearing four hats

**Found:** 2026-09-26, the first time Act II was ever measured.

The investors ask for one of four things each fortnight. Across 622 reviews,
six pricing strategies, eight resorts:

| measure | asked | missed | |
|---|---|---|---|
| revenue per room | 149 | 86 | **58%** |
| prestige | 158 | 15 | 9% |
| occupancy | 156 | 10 | 6% |
| guest satisfaction | 159 | 7 | 4% |

**Revenue per room is nearly every failure. The other three are passed by
existing.** Occupancy is ~100% at any price a player would actually charge,
prestige climbs on its own, and satisfaction sits comfortably high -- so three
quarters of the reviews are a formality, and the act's whole pressure comes
down to one number that ratchets 7% compounding until it cannot be met.

That is not four problems. It is one problem, announced four ways, and it makes
the fortnightly meeting feel like a real relationship while only ever testing
a single decision the player made once.

**A fix wants the other three to be losable.** Occupancy cannot be a test while
every room fills at any sane price (see the room-ratchet note below).
Satisfaction cannot be a test while it barely moves. Both are symptoms of the
same thing the conditioning issue is a symptom of: demand at this stage of the
game hugely exceeds what the resort can serve, so anything measuring *how full*
or *how happy* is measuring a saturated system.

Worth taking together with that entry rather than separately.

### Rooms build themselves up to the planning cap

**Found:** 2026-09-26, same sweep. Milder than it first looked, and recorded
so the next reader does not re-measure it.

At every rate from $60 to $575 a resort ends with 67-71 rooms against a
planning limit of 72, at 99-100% occupancy, with identical upkeep. "How many
rooms" is not a decision; it is a ceiling you walk into while the hotel is
always full.

It is a symptom rather than a cause. The operator only builds while occupancy
is above 85%, so building to the cap simply means never dropping below it --
and at $700 a night, where rooms genuinely go unsold, it stops dead at 13
rooms. So the ratchet is what being under-priced looks like, not a separate
fault, and it will ease if the saturated-demand problem above is addressed.

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

### The per-population catchment was tried, and broke Act I

**Attempted and reverted:** 2026-09-26. Recorded so the next attempt starts
from the numbers rather than from the idea.

The diagnosis below is right: every segment's interest is computed from the
WHOLE catchment (`ceiling * appeal * pull` in `economy.demandGroups`), so the
three crowds compete for one undifferentiated total and `allocateByWeight`
splits it by appeal. Please serious golfers more and they take locals' seats
one for one, which is why driving locals away is free.

The obvious fix -- give locals and travellers separate populations, so the town
is a fixed eighteen groups and reputation only widens the travelling crowd --
was built and measured. It works, and it is not enough:

- conditioning went from EARNING money to costing it on a controlled fixture
  (profit 10,492/day at setup 0 against 9,894 at setup 86)
- but at a mature resort the effect on takings is +0.3% to +1.8%, i.e. still
  marginally positive. It halves the paradox rather than reversing it.
- satisfaction still rises with setup, and probably should: the average is
  taken over whoever turned up, and the people who turn up to a hard course
  are the ones who like hard courses. The original test's premise is wrong.

**What killed it was Act I.** With no rooms, travellers are only reach --
2.8 groups at prestige 10, 4.8 at prestige 20 -- where before, serious and
destination could each draw on the full ~23-group ceiling. Destination guests
are the high-spending segment, and squeezing them into a third of the space
collapsed early revenue:

    before:  cheap and busy 8/8, balanced 8/8, quiet and pricey 8/8
    after:   cheap and busy 0/8, balanced 0/8, quiet and pricey 0/8

Raising REACH_GROUPS does not rescue it on its own and is not monotonic:

    REACH_GROUPS 24: cheap 3/8, balanced 0/8, quiet 6/8
    REACH_GROUPS 32: cheap 6/8, balanced 1/8, quiet 8/8
    REACH_GROUPS 40: cheap 0/8, balanced 1/8, quiet 8/8

**So it needs a real re-tune, not a constant.** LOCAL_GROUPS, REACH_GROUPS,
REACH_CURVE and INTEREST_SCALE were all calibrated for a model where every
segment drew on the whole ceiling, and splitting the pools invalidates all
four together. That is several measure-and-tune cycles across all three acts,
and it should not be attempted without an Act I baseline captured first --
`node tools/balance.js` gives one in about four minutes.

Worth doing. Not worth doing halfway, because a broken Act I is far worse than
this wart.

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
