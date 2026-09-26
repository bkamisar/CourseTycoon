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

### The turf self-heals when a resort empties out

**Found:** 2026-09-23, while making play wear the course. **Known and
accepted by the author for now.**

Wear scales with traffic, so a resort that loses its golfers also stops
damaging its greens, recovers, and draws them back. It is realistic and
it works against "hard to dig out of". Left deliberately; revisit if a
collapse ever feels too easy to recover from.
