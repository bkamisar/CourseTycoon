# Course Tycoon — Act III: The Run-up, and Championship Events

**Status:** design agreed 2026-10-03; to be planned and built without further
author review (the author asked for it to be built overnight). Decisions the
author would normally make are taken here and listed in §8 for the morning.
**Builds on:** `2026-10-03-course-tycoon-championship-week-design.md` (the
week of rounds, pins, the winning-score judge). Nothing there changes unless
this document says so.

---

## 1. Why

The championship week now has a decision every morning. The three weeks
before it still have almost none: the player sets a setup target, the crew
climbs to it, and the first time anybody learns whether the course will
produce a winner in range is the first evening of the week — too late to do
anything about it. And nothing ever *happens* during a championship except
golf.

Three additions, agreed with the author one question at a time:

| # | Question | Answer |
|---|----------|--------|
| 1 | What is the mid-run-up "inspector visit"? | **A practice round: information, no penalty.** A forecast of the winning score while there is still time to act on it. |
| 2 | When do championship-specific events happen? | **Both** the run-up and the week. |
| 3 | How often? | **A guaranteed rhythm:** run-up one guaranteed plus a 50% chance of a second; the week at least one, with a 50% chance each evening before a round. |
| — | Weather and the setup climb | Agreed earlier: wet weather slows the crew. |

## 2. The practice round

On the run-up's middle evening — **eleven days before the first round** —
the governing body's officials walk the course and play it. That evening a
card arrives with what they found:

> The officials' report. On the course as it will be laid out on the first
> morning, set up the way your crew will have it (86), a field would win at about **+11**,
> most likely between **+8 and +14**. They want **+14 to +20**. The course
> measures 66.2 against their minimum of 65.

### What it computes

- **The setup at round 1:** the current setup carried forward day by day with
  `nextSetup` to the first round, using today's crew, today's target and the
  hold rule, in neutral weather. The report says it is a projection.
- **The course as it will be laid out on the first morning:** today's playable
  holes. A last-minute redesign will change the real outcome; the card says
  "as it will be laid out on the first morning".
- **The forecast:** **16 simulated weeks** of the rung's rounds through the
  real `playField`, with fair pins, the week's real fixed-field mechanics, and
  weather drawn deterministically from the weather table (not the real days
  ahead — the forecast does not leak weather beyond the 3-day forecast).
  Reported as the median winning total and the **middle 80% range** (10th to
  90th percentile).
- **Deterministic:** seeded from the state, so a replay gives the same report.

### Where it lives

A pure function in a new module (`src/sim/practiceRound.js`). `day.js` calls it
on the practice evening and stores the result on the week
(`week.practice = { day, setupAtRoundOne, difficulty, median, low, high }`) and
on the report (`report.practiceRound`). It is free and happens once. The
Championship sheet shows it for the rest of the run-up, labelled with the setup
and course it was computed on.

### Honesty

The forecast must be what the week actually does. Across many seeds, the real
week (fair pins, real weather) must land inside the reported 10–90% range about
80% of the time (accept 70–90%). If it does not, the forecast is wrong, not
unlucky.

## 3. Weather and the setup climb

Wet greens cannot be firmed. The crew's daily climb is multiplied by the day's
weather:

| Weather | Climb | A course already at its target |
|---|---|---|
| Clear | ×1.15 | holds |
| Fair, breezy | ×1.0 | holds |
| Blowing hard | ×1.1 (wind dries the greens) | holds |
| Drizzle | ×0.6 | holds |
| Heavy rain | ×0.25 | softens 2 points |
| Storm | ×0 | softens 4 points |

Softening applies while booked, climbing or holding; the crew climbs back
afterwards at the normal rate. Lives as a field on each condition in
`weather.js` (`setupClimb`, `setupSoften`) so the weather table stays the one
place weather is described. The starting values are calibrated, not final:
**crews that reach a rung's target inside the run-up in neutral weather must
still reach it in at least 90% of seeds' real weather** — weather is a risk to
plan around with the forecast, not a new tax.

## 4. Championship events

### The pools

A new library, `src/sim/championshipEvents.js`, in exactly the shape of
`EVENTS` (id, speaker, prompt, `when`, choices with `label`, `cost`, `stance`,
`effects`). Two pools, written in the house voice, nameless (no named players):

- **Run-up (7 events):** e.g. the greens mower breaks down; a sponsor wants
  signage on the 18th tee; the local club asks for one last members' day; a
  TV scout walks the course; the drought puts the irrigation under strain; the
  officials ask for the rough to be grown thicker; a neighbour objects to the
  car park.
- **The week (9 events):** e.g. overnight rain floods a green; a player
  complains about a pin; television wants later tee times; a heatwave bakes
  the greens; the gallery breaks a rope line; a fancied player withdraws; the
  scoreboard fails; a rules official queries a drop zone; the sponsor's tent
  floods.

Every choice states its cost truthfully, as every card in the game must.

### Effects

The existing effects (`money`, `prestige`, `turf`, `goodwill`) plus three new
ones, applied by the same `applyEventChoice` (which now looks an id up in
either library):

- `setup`: points added to or taken off the course's setup now.
- `nextRound: { handicap }`: handicap points added to the field for the next
  round only (positive is harder), on the same scale as the pins.
- `nextRound: { pace }`: a multiplier on the next round's time.

`nextRound` effects are stored on the week (`roundSettings.eventHandicap`,
`roundSettings.eventPace`), applied by `playField` for one round, then cleared.

### The rhythm

Drawn once, on the first booked day, and stored on the week
(`week.eventPlan`) so it is deterministic and survives a save. It is drawn
from its own seed (`eventPlanSeed`: the save's seed and the first round's
day) rather than the day's rng, so drawing it moves no other number in the
day it is drawn on (the same reasoning as the practice round's seed):

- **Run-up:** one event on a day drawn from the run-up's evenings (not the
  practice-round evening, not the eve of round 1); a 50% chance of a second on
  a different day.
- **The week:** the evenings before each round from the eve of round 1 to the
  eve of the last round. Each has a 50% chance; if none came up, one is chosen
  so the week always gets at least one.
- **One card an evening.** Ordinary decision events do not fire on round days,
  on the practice-round evening, or on an evening a championship event is
  shown. On ordinary run-up days they fire as normal.
- A championship event is drawn from its pool by `when` and not repeated
  within a ladder until the pool is exhausted.

## 5. Interface

No new screen.

- The practice round is an evening card (the existing card queue, like the
  championship result card), and a block on the Championship sheet for the
  rest of the run-up.
- Championship events use the existing decision-event card.
- The HUD is unchanged.

## 6. Not in this spec

- Paying for a second practice round.
- Events that change the target, the floor or the number of rounds.
- Named players.

## 7. What must be proven

1. **The forecast is honest:** the real week lands inside the reported range in
   70–90% of seeds.
2. **Weather is fair:** at each rung, the crew size that reaches the target in
   neutral weather still does in at least 90% of seeds' real weather.
3. **Every event effect reaches the sim**, and each card's cost text matches its
   numbers (extend the existing event-text tests to the new library).
4. **The rhythm:** every week gets at least one event; a run-up gets one or two;
   no ordinary event on a round day or the practice evening; never two cards
   in an evening.
5. **Saves:** a save on any run-up or week evening, including with a pending
   championship event, reloads and plays on identically.
6. **The ladder re-measured** with the operator answering events with a simple
   policy; record how hostingWorth moved. If all-hit ladders drift more than
   about $100k from break-even, retune the purse factor and record it.

## 8. Decisions taken without the author

Listed so they can be reviewed in the morning:

- Practice round on the evening eleven days before round 1; 16 simulated weeks;
  range = 10th–90th percentile; neutral weather for the setup projection.
  - The practice round measures the course as it will be on the first
    morning: temporary closures that end before round 1 are ignored.
- Weather multipliers and softening values in §3 (starting values; calibrated
  against §7.2).
  - **Rain climb raised to ×0.35 (from ×0.25)** to meet §7.2: at 0.25 the
    National's neutral-weather crew (six keepers) arrived in only 88.3% of
    120 seeds; at 0.35 all three rungs measure 91.7%. Nothing else in the
    table moved. Full numbers in `src/sim/weather.js`.
  - **"Reach the target" is counted as reaching it on any morning up to and
    including round 1.** Strictly at the target on the round-1 morning is
    ~82–83% (81.7 / 83.3 / 83.3%), because rain that morning softens a course
    already held at its target and it only climbs back the next day. That is
    weather on the day, which the player plans around with the 3-day
    forecast, not a crew that failed to get there.
  - **Softening applies on round days too**, like every other booked day
    (§3: "while booked, climbing or holding").
- Pool sizes 7 and 9; the three new effect kinds; how the rhythm is drawn.
- Ordinary events suppressed on round days, the practice evening and
  championship-event evenings.
- The operator's event-answering policy for the measurement. Ordinary events
  keep their rule (the middle, "pragmatic" choice where there is one).
  Championship events are scored (`championshipChoiceScore`, picked by
  `answerFor` in `tools/operator.js`): money at face value, prestige and turf
  at a fixed dollar value a point, a slower next round as a cost only when
  the tee sheet is tight enough (18 minutes or less) for the pace bonus to
  be at risk; setup, the next round's handicap and goodwill count for
  nothing, because the operator cannot read which way they would help.
