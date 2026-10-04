# Championship Run-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Act III's 21-day run-up a practice-round forecast and weather on the setup climb, and give the whole championship (run-up and week) its own decision events.

**Spec:** `docs/superpowers/specs/2026-10-04-course-tycoon-championship-run-up-design.md`. Read it first. The previous feature's spec (`2026-10-03-course-tycoon-championship-week-design.md`) describes the week this builds on.

**Architecture:** Three independent pure pieces in `src/sim/` — weather multipliers on `nextSetup`, a `practiceRound.js` forecast, a `championshipEvents.js` library — wired into `runDay` in `src/sim/day.js`, with the existing evening-card and decision-card UI reused.

**How this plan differs from the last one:** this plan is being executed overnight with no author available, by capable implementers who read the real code. Tasks give exact interfaces, file locations, behaviour, tests and numbers; where code is shown it is the contract, and the implementer writes the bodies to match the codebase's existing patterns. Every task is still TDD and still ends with `npm test` green and a commit.

**Tech Stack:** ES modules, `node --test` (`npm test`, ~875 tests, all passing at the start).

---

## Ground rules (every task)

- `src/sim/` stays pure: no DOM, no clock, no `Math.random` (`tests/purity.test.js`). Randomness comes from an `rng` from `makeRng`.
- Holes live at `state.resort.courses[0].holes`. Use `playableHoles(state)` (in `src/sim/state.js`) for "the holes the judge measures".
- A championship booking is normalised by `normaliseWeek` (`src/sim/championshipWeek.js`); `championshipStatus(state)` is the one selector the HUD and sheet use.
- The interface must never disagree with the simulation: anything a card or sheet prints must be read off the report/state the sim produced.
- Comments explain *why*, with measured numbers; record what was tried and rejected.
- Verify each new test by sabotage (break the guarded code, see the test fail, restore from a backup copy).
- Commit after each task, staging by explicit path, ending the message with the model's `Co-Authored-By` trailer. Never `git push`/`fetch`/`pull`.
- If a measured criterion cannot be met, stop and report the numbers rather than loosening it.

## File map

| File | Change |
|---|---|
| `src/sim/weather.js` | each condition gains `setupClimb`, `setupSoften` |
| `src/sim/tournaments.js` | `nextSetup` takes `climb` and `soften` |
| `src/sim/practiceRound.js` | **create** — `practiceForecast(...)`, `projectSetup(...)` |
| `src/sim/championshipEvents.js` | **create** — `CHAMPIONSHIP_EVENTS`, `pickChampionshipEvent`, `drawEventPlan` |
| `src/sim/championshipWeek.js` | week gains `practice`, `eventPlan`, `eventsSeen`; `roundSettings.eventHandicap/eventPace` |
| `src/sim/field.js` | `playField` takes `eventHandicap`, `eventPace` |
| `src/sim/day.js` | weather on the climb; practice evening; championship-event evenings; ordinary-event suppression; `applyEventChoice` handles both libraries and the new effects |
| `src/ui/championshipCard.js` | practice-round card |
| `src/ui/championship.js` | practice-round block on the sheet |
| `src/main.js` | nothing new expected (events reuse the decision card; check) |
| `tools/operator.js`, `tools/actThree.js` | answer championship events; re-measure |
| `src/ui/changes.js`, `version.json` | release notes, build `2026-10-04a` |

---

### Task 1: Weather slows the setup climb

**Files:** `src/sim/weather.js`, `src/sim/tournaments.js` (`nextSetup`), `src/sim/day.js` (the `nextSetup` call ~line 210), tests in `tests/weather.test.js`, `tests/tournaments.test.js`, `tests/tournamentDay.test.js`.

- [ ] **Step 1: Tests first.**
  - `tests/weather.test.js`: every condition has numeric `setupClimb` (0–1.5) and `setupSoften` (≥ 0); `storm.setupClimb === 0`; `rain.setupClimb < drizzle.setupClimb < fair.setupClimb`; clear > fair.
  - `tests/tournaments.test.js`: `nextSetup(50, { keepers: 8, conditioning: true, target: 90, climb: 0.25 })` climbs a quarter of `nextSetup(50, { keepers: 8, conditioning: true, target: 90 })`'s climb; `climb` defaults to 1 so every existing call is unchanged; `soften` lowers a held course (`hold: true`, setup at target) by exactly `soften`, never below 0, and the crew climbs back the next day; `soften` does nothing when not booked (`hold: false` already decays).
  - `tests/tournamentDay.test.js`: a booked national with 8 keepers on a run of real rain days (pick a `weatherSeed`/day window by search and assert the precondition that those days are `rain`) climbs measurably less than the same state with a weather seed giving fair days.
- [ ] **Step 2: Implement.** In `weather.js` add to each condition (starting values from the spec §3):

  | key | setupClimb | setupSoften |
  |---|---|---|
  | clear | 1.15 | 0 |
  | fair | 1.0 | 0 |
  | breezy | 1.0 | 0 |
  | blowy | 1.1 | 0 |
  | drizzle | 0.6 | 0 |
  | rain | 0.25 | 2 |
  | storm | 0 | 4 |

  with a comment saying why (wet greens cannot be firmed; wind dries). In `nextSetup(setup, { keepers, conditioning, target, hold, climb = 1, soften = 0 })`: the climb is `setupClimb(keepers) * climb`; when `hold` is true (booked) subtract `soften` before the climb/hold logic (so a held course drops by `soften` today and climbs back from tomorrow). In `day.js` pass `climb: sky.setupClimb, soften: sky.setupSoften` (the day's `sky` must be computed before the setup update — move the `weatherKey`/`sky` lines above it if needed; they are pure functions of seed and day, so order is safe).
- [ ] **Step 3: Calibrate (spec §7.2).** Write a scratch measurement (not committed) or a test: for each rung, the smallest crew that reaches the band midpoint inside `RUN_UP_DAYS` with `climb = 1` every day; then over 120 weather seeds, the share of run-ups where that crew reaches the target by round 1 with real weather. Must be ≥ 90%. If not, soften the multipliers (raise rain/drizzle climb, lower softening) one step at a time and re-measure. Record the final table and the measured share per rung in the `weather.js` comment. Add a committed test asserting ≥ 85% on 40 seeds per rung (slack below the 90% measured at 120).
- [ ] **Step 4:** `npm test` green; sabotage (`climb` ignored → the rain test fails); commit "Let the weather slow the crew's setup climb, and soften a held course in heavy rain".

---

### Task 2: The practice-round forecast (pure)

**Files:** create `src/sim/practiceRound.js`; test `tests/practiceRound.test.js`.

- [ ] **Step 1: Interface.**

  ```js
  /** The setup the crew will have on the first morning, carried forward
   * day by day with nextSetup in neutral weather (climb 1, soften 0). */
  export function projectSetup({ setup, target, keepers, days }) { ... }

  /** What the officials' practice round reports.
   * holes: the playable holes today. Returns
   * { setupAtRoundOne, difficulty, median, low, high, samples } where
   * low/high are the 10th/90th percentile winning totals over `samples`
   * simulated weeks of the rung's rounds, fair pins, fixed field per week,
   * weather drawn from weatherOn(weatherSeedFor(i), dayFor(r)) so it never
   * reads the real days ahead. Deterministic in `seed`. */
  export function practiceForecast(holes, {
    rungId, setup, turfQuality, teeInterval, seed, samples = 16,
  }) { ... }
  ```

  Use `newWeek`/`recordRound`/`winningTotal` and `playField`/`drawFieldHandicaps` exactly as `tools/calibrateWeek.js`'s `simulateWeek` does (read it) — but do not import from `tools/`; `src/sim` cannot depend on tools. Factor the shared week-simulation loop into `practiceRound.js` and make `tools/calibrateWeek.js` import it from there, so there is one week simulator. Weather seeds for samples: derive from `seed` (e.g. `seed * 7919 + i`), so the forecast does not use the real weather seed.
- [ ] **Step 2: Tests.**
  - `projectSetup`: 8 keepers from 0 toward 86 over 21 days reaches 86; 2 keepers do not; a course above target eases down to it; matches stepping `nextSetup` by hand.
  - `practiceForecast` is deterministic for the same seed; `low <= median <= high`; a harder setup gives a higher median; returns `difficulty === courseDifficultyOf(holes)`.
  - **Honesty (spec §7.1):** for 40 seeds per rung on a course narrowed to the rung's minimum + 3 (use `tools/championshipPolicy.js` `narrowToDifficulty` in the test) at the band midpoint, compute the forecast, then play one real week with a *different* weather seed and fair pins; the real winning total lands inside `[low, high]` in 70–90% of seeds. Measure first at 120 seeds in a scratch run; set the committed test's bounds with margin from that measurement; record both in a comment.
  - Runtime: the honesty test should take under ~15 s; measure and report.
- [ ] **Step 3:** `npm test` green; sabotage (report `low`/`high` as the min/max over only 4 samples → the honesty band test fails, or the median from setup 0 → monotonic test fails); commit "Forecast what a practice round would tell the officials".

---

### Task 3: The practice evening, the card and the sheet

**Files:** `src/sim/championshipWeek.js` (`newWeek` gains `practice: null`), `src/sim/day.js`, `src/ui/championshipCard.js`, `src/ui/championship.js`, tests in `tests/tournamentDay.test.js`, `tests/championshipCard.test.js`, `tests/championship.test.js`, `tests/championshipWeek.test.js`.

- [ ] **Step 1: Sim.** In `runDay`, when a week is booked, not under way, `week.practice == null`, and `next.day === week.day - PRACTICE_DAYS_BEFORE` (export `PRACTICE_DAYS_BEFORE = 11` from `practiceRound.js`; if a booking somehow starts closer than that — e.g. tests — the practice evening is skipped, never doubled), compute `practiceForecast(playableHoles(next), { rungId, setup: projectSetup({ setup: next.resort.setup, target: next.resort.setupTarget, keepers, days: week.day - next.day }), turfQuality: next.turfQuality, teeInterval, seed: <derived from next.seed and day> })`, store `{ day: next.day, ...forecast }` on `next.tournament.practice`, and put `report.practiceRound = { rung, target, minDifficulty, ...forecast }`. It must not consume the day's `rng` (use its own seed) so no other number in the day changes. `normaliseWeek` must default `practice` to null for old saves.
- [ ] **Step 2: Card.** In `championshipCards(report, state)`, a card with id `practice-round-<day>`, kicker `THE PRACTICE ROUND`, speaker the governing body, an acknowledge button, and a prompt read only from `report.practiceRound`: the setup it assumed, the median and range (`toParText`), the target, and the difficulty against the minimum (one decimal, floored like the report) — and that it is "on the course as it stands". Order: before any result card the same evening.
- [ ] **Step 3: Sheet.** `computeChampionshipData(state).booked.practice` = the stored forecast (or null); in the dial section, when present and the week is not under way, a short block: "Practice round (day N): on pace for about +11 (+8 to +14) at setup 86." Mobile-short.
- [ ] **Step 4: Tests.** Booked national: no practice before day `week.day - 11`; exactly one on that evening; stored on the week; survives `serialize/deserialize`; the card prints the report's numbers (assert the median and range strings appear); the sheet shows it during the run-up and not once the week is under way; a booking made 5 days before round 1 never gets one; the day's other numbers (e.g. `report.revenue.total`) are identical to the same day computed without the practice (compare against a run with `week.practice` pre-filled so the practice is skipped).
- [ ] **Step 5:** `npm test`; sabotage; commit "Hold the officials' practice round eleven days out and report it".

---

### Task 4: The championship event library and its effects

**Files:** create `src/sim/championshipEvents.js`; `src/sim/day.js` (`applyEventChoice`); `src/sim/field.js`; `src/sim/championshipWeek.js` (`roundSettings` defaults); tests `tests/championshipEvents.test.js`, `tests/field.test.js`, `tests/tournamentDay.test.js`.

- [ ] **Step 1: Library.** `CHAMPIONSHIP_EVENTS` in the exact shape of `EVENTS` (read `src/sim/events.js` for shape, `SPEAKERS`, `STANCES`, and how costs are worded). Each event has `phase: 'runUp' | 'week'`. Write 7 run-up and 9 week events from the spec's list (§4), in the house voice, nameless, each with 2–3 choices whose `cost` text states every effect honestly. Effects allowed: `money`, `prestige`, `turf`, `goodwill`, `setup`, `nextRound: { handicap, pace }` (week events only for `nextRound`). Speakers: reuse existing ones where they fit; add `officials` (the governing body) and any other needed to `SPEAKERS` with a label. Keep magnitudes sensible: `nextRound.handicap` within ±1 (the pins span 2.25), `pace` within 0.9–1.15, `setup` within ±8, money within the scale of the rung's prep bill.
- [ ] **Step 2: Effects.** `applyEventChoice` looks the id up in `EVENTS` then `CHAMPIONSHIP_EVENTS`. New effects: `setup` adds to `next.resort.setup` (clamped 0–100); `nextRound.handicap`/`pace` are added to `next.tournament.roundSettings.eventHandicap` (sum) / multiplied into `eventPace` (product) on the normalised week. `playField` accepts `eventHandicap = 0`, `eventPace = 1` (added to the handicap adjustment; multiplied into hole minutes after the weather pace), and `day.js` passes them from `roundSettings` and resets both to 0/1 after the round is recorded.
- [ ] **Step 3: Tests.** Port the invariants from `tests/events.test.js` to the new library (unique ids distinct from `EVENTS` ids, known speaker, ≥2 choices, explicit costs, known stances, no stance twice, no dominating choice, effects only from the allowed set, "a choice that pays says so", no unrendered escapes) — reuse the helpers if exported, or copy the checks. Plus: `nextRound` only in week events; each new effect reaches the sim (`applyEventChoice` then the next `runDay` round shows the handicap/pace applied and then cleared); `setup` effect changes `resort.setup`.
- [ ] **Step 4:** `npm test`; sabotage; commit "Write the championship's own events and let them reach the course and the next round".

---

### Task 5: The rhythm

**Files:** `src/sim/championshipEvents.js` (`drawEventPlan`, `pickChampionshipEvent`), `src/sim/championshipWeek.js` (`eventPlan: null`, `eventsSeen: []` on the week… or on state if it should persist across the ladder — it should: put `championshipEventsSeen` on state, default `[]` in `newGame` and `deserialize`), `src/sim/day.js` (the decision-event block ~line 925), tests `tests/championshipEvents.test.js`, `tests/tournamentDay.test.js`.

- [ ] **Step 1: Plan.** `drawEventPlan(rng, { bookedDay, firstRoundDay, rounds })` returns `{ runUp: [day, ...], week: [day, ...] }`: one run-up evening drawn uniformly from `bookedDay .. firstRoundDay - 2` excluding the practice evening (`firstRoundDay - 11`); 50% a second distinct one; week evenings are `firstRoundDay - 1` (the eve of round 1) and each round day except the last (`firstRoundDay .. firstRoundDay + rounds - 2`), each kept with 50%, and if none kept, one chosen. In `runDay`, when a booking has no `eventPlan`, draw it from a dedicated rng seeded from `next.seed` and the booking (not the day's rng, so the day's other numbers don't change) and store it.
- [ ] **Step 2: Firing.** In the decision-event block: if today's evening is in the plan, pick a championship event of the right phase (`pickChampionshipEvent(context, rng, seen)`, mirroring `pickEvent` — eligible by `when`, not repeated until the phase's pool is exhausted) and set it as `report.pendingEvent` (same shape as now); record it in `championshipEventsSeen`. Ordinary events do not roll on: round days (`championshipToday`), the practice evening, or an evening a championship event fired. Keep the ordinary roll's rng draw order unchanged on ordinary days.
- [ ] **Step 3: Tests.** Over 30 seeds per rung: every week gets ≥ 1 championship event; every run-up gets 1 or 2; no ordinary event ever on a round day or the practice evening; never two in one evening; plans are deterministic and survive save/load; a save taken with a championship event pending reloads and `applyEventChoice` works on it; a week event's `nextRound` effect lands on the very next round.
- [ ] **Step 4:** `npm test`; sabotage; commit "Give every championship its own events, on a rhythm the player can count on".

---

### Task 6: The operator answers them, and the ladder is re-measured

**Files:** `tools/operator.js`, `tools/actThree.js`, `src/sim/tournaments.js` (purses, only if needed), spec §7/§8, tests `tests/operator.test.js`.

- [ ] **Step 1:** `playActThree` already answers `report.pendingEvent` with the pragmatic choice via `EVENTS.find`; make it find championship events too (import `CHAMPIONSHIP_EVENTS`), same policy. Test that a pending championship event is answered and the game continues.
- [ ] **Step 2:** Re-run the ladder: `node tools/actThree.js --seeds 8 --samples 4 --force=hosted,neverBid` (settled states reuse the cache; run in the background and poll). Record the new all-hit / missed distributions, target hit rates and how hostingWorth moved, in the dated table above `playActThree`. If the all-hit median has drifted more than about ±$100k from break-even, rescale the purse factor exactly as last time (the purse only moves money) and record it in `tournaments.js` and spec §9 of the week spec; otherwise leave the purses.
- [ ] **Step 3:** `npm test`; commit "Let the operator answer championship events, and re-measure the ladder".

---

### Task 7: Release notes

- [ ] `BUILD = '2026-10-04a'`, `version.json` to match, and a first `CHANGES` entry in the existing voice: the practice round (when, what it tells you, that it's on the course as it stands); weather slows the crew and heavy rain softens a firm course; championships now have their own events in the run-up and the week, which can shift the next round. Use typographic apostrophes (’) inside single-quoted strings, never a bare `'`. `npm test`; commit.

---

## After the last task

Final whole-implementation review (cross-cutting: card/sheet/sim agreement, saves on every evening, one card per evening, purity, spec matches code); fix findings; then proceed to the known-issues fixes list kept by the controller.
