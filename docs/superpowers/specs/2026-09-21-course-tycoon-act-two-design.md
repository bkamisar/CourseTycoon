# Course Tycoon — Act II: The Hotel

**Status:** design agreed, not yet planned
**Preceding work:** Act I complete. 516 tests, 129 commits.
**Opens when:** the Act I gate passes — nine holes, $50,000, prestige 40, and satisfaction 60 held for a week.

---

## 1. What Act II is for

Act I is a golf course that people visit. Act II is a place people travel
to and stay at. That is the whole shift, and everything below serves it.

It also fixes the one thing measurably wrong with late Act I: **money
stops mattering.** A competent operator reaches the gate around day 60
and can then bank hundreds of thousands with nothing worth buying. A
hotel is a money sink large enough to make the number mean something
again.

**What Act II must not be.** Act I with bigger figures. It needs its own
pressure, its own visible number, and its own way to lose — or it is a
second helping of the same meal.

## 2. The new pressure: investors

Act I's failure mode is pace of play, and it is a *systems* pressure —
you lose to arithmetic. Act II's is **people**, which suits a game whose
entire variety layer is characters talking to you.

**They are not optional.** The moment the Act I gate opens, an investment
group arrives and offers to fund a hotel. You cannot build one alone at
Act I money, and you cannot decline and proceed. This was considered as a
choice — self-fund slowly or take the money and move fast — and rejected
deliberately: *a mechanic you can decline is one half the players never
meet*, and this mechanic is the act.

What you *can* choose is the terms, which is what the arrival card is for.

### 2.1 Confidence

A single number, 0–100, starting at 55. **Act II's equivalent of pace of
play: the thing on screen that tells you how you are doing.** It belongs
in the HUD for the whole act, the way the crowd bars do now.

It moves only at a review. Nothing else touches it — no drift, no decay —
because a number that moves on its own cannot be steered, and steering it
is the game.

### 2.2 Reviews

Every **14 days**, the investors assess one target and adjust confidence:

| outcome | confidence |
|---|---|
| beat the target comfortably | +18 |
| met it | +10 |
| just missed | −12 |
| missed badly | −25 |

At **0**, they call the loan (§2.4).

### 2.3 What they measure, and why you are told in advance

Four measures, **one per review**, named at the *start* of the period it
covers:

- **Occupancy** — nights sold against nights available. The one a real
  hotelier is asked first, and the direct punishment for overbuilding: an
  empty suite costs you every night of its life.
- **Revenue per room** — pushes upmarket, rewards suites and hotel
  amenities over raw room count.
- **Prestige** — slow, hard to fake, forces the long view.
- **Guest satisfaction** — ties the hotel back to the golf, because a bad
  round ruins a stay.

**The target for the next period is always known.** This is not a
courtesy, it is the same rule the weather follows: *unforecastable
pressure is noise that punishes at random* (§15a.6). A player who can see
"they want occupancy above 60% by day 42" can discount the room rate, hold
off building, and steer. A player ambushed at the review can only be
unlucky. The forecast is what turns a threat into a decision.

Selection is seeded, weighted, and **never the same measure twice
running** — the same no-repeat-while-unseen rule narration and events
already use.

Targets scale with the size of the hotel, so a bigger operation is asked
for more. First review is deliberately gentle.

### 2.4 The buyout

Confidence hitting 0 does not take the hotel. It triggers a **buyout
demand**: repay the outstanding investment within 14 days.

- **Pay it** and you own the hotel outright. Investors leave, reviews stop,
  the act's pressure is over and you have earned it. This is the good end.
- **Cannot pay** and rooms are sold off at **60% of build cost** until the
  debt clears — the same haircut demolition already takes (§ economy's
  `DEMOLITION_REFUND`), for the same reason.

Painful, survivable, and visible for weeks before it lands. A player
should never be surprised by it, only unable to stop it.

## 3. Rooms and suites

`state.resort.rooms` already exists as `{ count, quality }` and is marked
*Act II*. It becomes:

```js
rooms: { standard: 0, suite: 0 }
```

| | build | upkeep/night | rate | who wants it |
|---|---|---|---|---|
| Standard room | $9,000 | $40 | `roomRate` | serious golfers, some guests |
| Suite | $26,000 | $95 | `roomRate × 2.6` | destination guests |

**Upkeep is per room per night whether or not anyone is in it.** That is
the entire reason occupancy is a real target rather than a vanity metric,
and it is what makes "build more rooms" a decision instead of a ratchet.

`pricing.roomRate` already exists and is currently 0. The suite rate is a
multiplier rather than a second slider: one price decision, not two.

## 4. Who actually stays

`golfer.stayNights` is already on every guest, hardcoded to 1 and
commented *"Act II varies this"*.

| crowd | stays? | typical nights |
|---|---|---|
| Locals | **never** | 0 |
| Serious | sometimes | 1–2 |
| Destination | usually | 2–4 |

**Locals do not book hotel rooms in their own town**, and pretending
otherwise would be the first dishonest thing in this game's model. This is
not a loss — it is the act's progression made mechanical. Act I you serve
the neighbourhood; Act II you become somewhere people travel to, and the
crowd mix shifts because of what you built rather than because a number
said so.

It also creates the act's central squeeze: **the course that wins Act I is
not the course that fills a hotel.** A locals' course at a friendly
difficulty draws people who go home at six.

## 5. Hotel amenities

The second axis, and the answer to locals having no rooms: **every hotel
amenity serves overnight guests, day visitors, or both.** A pool sells
memberships to the neighbourhood as well as entertaining a family staying
four nights.

First pass, to be workshopped:

| amenity | serves | drawn to |
|---|---|---|
| Pool | both | destination, and local memberships |
| Kids' club | overnight | destination families — raises their `stayNights` |
| Spa | both | destination, some locals |
| Gym | both | serious, locals |
| Function room | **day** | locals — weddings, societies, wakes |
| Club storage and cleaning | overnight | serious |
| Dawn tee times | overnight | serious — the reason to stay the night before |
| Caddie programme | both | serious, destination |
| Fine dining | both | destination, and locals who drive out for it |

The structure to protect: **no amenity pleases everyone**, the same
guarantee items and menus already carry and are tested for.

Two are doing specific jobs. **Dawn tee times** is the answer to "why
would a serious golfer pay for a room at a course they could drive to" —
because the first tee time is worth more than the drive. And the **kids'
club** should raise `stayNights` rather than appeal, so it lengthens stays
instead of attracting more of them: a different verb from everything else
on the list.

## 6. What is new on screen

- **Confidence in the HUD**, for the whole act.
- **The next target, always visible** — on the report and wherever rooms
  are priced. "Occupancy above 60% by day 42" with today's figure beside
  it, so the gap is never a surprise.
- **A rooms screen**: build standard rooms and suites, set the rate, see
  last night's occupancy.
- **The investors as a character**, using the existing non-dismissable
  decision card. Their arrival, each review, the buyout demand.
- **Occupancy on the evening report**, beside the round figures.

## 7. The gate to Act III

Sketched, not settled, since Act III is undesigned. The shape should be:
**own the hotel outright** (bought the investors out), plus a sustained
occupancy and a prestige threshold. Act III adds a second course and the
`zones`/`shuttles` fields already waiting in the model.

## 8. Balance targets

- A competent operator reaches the buyout in roughly **90–120 days** of
  Act II.
- **At least three strategies survive it**, as Act I has three. Measured
  with `tools/operator.js`, which must be taught to build rooms and price
  them — *and the operator's own test will fail until it is*, by design.
- Overbuilding must be a genuine way to lose: a resort with double the
  rooms it can fill should trend toward a buyout it cannot pay.
- Confidence should be recoverable from one bad review and not from three.

## 9. Tests that must hold

- `src/sim/` stays pure.
- **The next target is always knowable before the period it covers**, and
  the target shown always equals the target assessed. Same architecture as
  the weather forecast: the shown value *is* the value, not a prediction
  of it.
- **Locals never occupy a room**, at any price.
- **No hotel amenity pleases every crowd.**
- An empty room costs upkeep, by test — this is the load-bearing rule for
  occupancy mattering.
- Confidence moves **only** at a review.
- A save from Act I loads into Act II with no hotel and no investors.
- Old saves keep working, as every slice has required.

## 10. Deliberately not in Act II

- A second course, zones, shuttles — Act III.
- Seasons.
- Staff morale — its own slice, applicable to both acts.
- Playing a hole yourself — deferred, and orthogonal.
- Room service as a menu — food and drink is done; do not reopen it.

## 11. Build order

1. Rooms and suites on the state, built and priced, with upkeep per night.
2. Who stays and for how long: `stayNights` by segment, occupancy computed.
3. Hotel amenities, with the no-universal-amenity guarantee tested.
4. Investors: arrival, confidence, reviews, forecast targets.
5. The buyout, both endings.
6. Screens: rooms, confidence in the HUD, target on the report.
7. Teach `tools/operator.js` to play Act II, then balance it.

Stages 1–3 leave a playable hotel with no investors. Stages 4–5 add the
pressure. That split is deliberate: the hotel should be fun before
anything threatens it, or the threat is all there is.
