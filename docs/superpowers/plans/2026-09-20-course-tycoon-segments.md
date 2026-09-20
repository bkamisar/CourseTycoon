# Course Tycoon — Segments and Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the resort three customer segments who want incompatible things, let the course the player builds decide which of them turns up, and have the world say so out loud.

**Architecture:** Segments live in the simulation as pure data and pure functions, exactly like everything else in `src/sim/`. The course's own derived statistics decide each segment's appeal; appeal decides the crowd; the crowd decides satisfaction and money. Narration events are authored text selected deterministically from state.

**Tech Stack:** Unchanged — plain ES modules, `node --test`, no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md` §15a
**Preceding plans:** the Act I simulation and game layer plans, both complete. 276 tests green.

**Commits:** End every commit message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Never `git push`, `git fetch` or `git pull`. **Stage by naming paths** — `git add -A` has already swept unrelated work into the wrong commit once on this project.

---

## Why this slice, and what it must achieve

The first playthrough found the failure mode of the genre: *"I hit my stride in act one and it was a way to sort of put on autopilot."* The world is static, so a good configuration stays good forever.

This slice is the smallest thing that fixes that on its own. When it is done, **there must be no course configuration that pleases everybody.** If an implementer finds a setting that maximises every segment at once, that is a design failure to report, not a balance detail to shrug at.

The second requirement is legibility. Emergent positioning that the player cannot read feels arbitrary rather than earned, so the evening report and the narration events have to make the crowd's composition and opinion obvious.

---

## Hard rules

- `src/sim/` stays pure: no `Math.random`, no `Date.now`, no DOM, no imports from `render`/`ui`/`audio`. `tests/purity.test.js` enforces it.
- The UI never computes game outcomes.
- No raw hex colours outside `src/render/palette.js`.
- Touch targets ≥44px; the game must work at 375×812 **and** 390×664.
- All 276 existing tests stay green unless a task explicitly authorises a change, and then only where the new value is genuinely correct. **Never weaken an assertion to make it pass.**

---

## File Structure

| File | Responsibility |
|---|---|
| `src/sim/segments.js` | Segment definitions, appeal scoring, crowd mix |
| `src/sim/golfer.js` | *(modify)* guests carry a segment |
| `src/sim/satisfaction.js` | *(modify)* satisfaction weighted per segment |
| `src/sim/economy.js` | *(modify)* demand is the sum of per-segment demand |
| `src/sim/day.js` | *(modify)* orchestration, segment mix in the report |
| `src/sim/narration.js` | Authored narration lines and deterministic selection |
| `src/ui/report.js` | *(modify)* who came, and what each of them thought |
| `src/ui/narration.js` | The narration card |
| `tests/segments.test.js`, `tests/narration.test.js` | New suites |

---

## Task 1: Segment definitions and appeal — TEST FIRST

**Files:** Create `src/sim/segments.js`, `tests/segments.test.js`

The heart of the slice. Appeal is how attractive the course is to each segment, 0–1, computed from statistics the simulation already derives.

- [ ] **Step 1: Write the tests first.** They must include, at minimum:
  - A short, easy, cheap, fast course appeals to **locals** far more than to serious golfers.
  - A long, hard, pristine, expensive course appeals to **serious golfers** far more than to locals.
  - A scenic, amenity-rich course appeals to **destination guests** most.
  - **No course maximises all three.** Sweep a grid of difficulty × price × scenery and assert that no combination puts every segment above 0.8. This is the anti-autopilot guarantee and it is the most important test in the slice.
  - Appeal is always within 0 and 1.
  - Destination appeal is heavily suppressed when there are no rooms (Act I), since they are mostly an Act II crowd.

- [ ] **Step 2: Run them; confirm they fail.**

- [ ] **Step 3: Implement.**

```js
// src/sim/segments.js
import { clamp } from './hole.js';

/**
 * Three crowds who want incompatible things.
 *
 * `idealDifficulty` is the point each segment enjoys most, and `tolerance`
 * how far from it they will stray before losing interest. Locals and
 * serious golfers sit far apart on that axis deliberately: it is the
 * central tension of the game and no course can satisfy both.
 */
export const SEGMENTS = {
  locals: {
    label: 'Locals',
    idealDifficulty: 30,
    tolerance: 26,
    priceSensitivity: 1.6,   // how hard an overpriced round drives them off
    sceneryWeight: 0.15,
    turfWeight: 0.35,
    amenityWeight: 0.2,
    waitWeight: 1.5,         // multiplier on the wait penalty in satisfaction
    spendMultiplier: 0.8,    // relative wallet
  },
  serious: {
    label: 'Serious golfers',
    idealDifficulty: 72,
    tolerance: 24,
    priceSensitivity: 0.5,
    sceneryWeight: 0.3,
    turfWeight: 1.4,         // the only segment that really notices turf
    amenityWeight: 0.3,
    waitWeight: 1.3,
    spendMultiplier: 1.5,
  },
  destination: {
    label: 'Destination guests',
    idealDifficulty: 52,
    tolerance: 40,           // forgiving about the test itself
    priceSensitivity: 0.35,
    sceneryWeight: 1.3,
    turfWeight: 0.7,
    amenityWeight: 1.4,
    waitWeight: 0.8,
    spendMultiplier: 2.1,
  },
};

export const SEGMENT_KEYS = Object.keys(SEGMENTS);

/** Bell-shaped preference: 1 at the ideal, falling away either side. */
function difficultyFit(difficulty, { idealDifficulty, tolerance }) {
  const d = (difficulty - idealDifficulty) / tolerance;
  return Math.exp(-(d * d));
}

/**
 * How attractive this course is to one segment, 0–1.
 *
 * `courseDifficulty`, `scenery` and `turfQuality` are 0–100. `valueRatio`
 * is green fee over perceived value — 1 means priced exactly at worth.
 */
export function segmentAppeal(key, {
  courseDifficulty, scenery, turfQuality, amenityScore, valueRatio, hasRooms,
}) {
  const seg = SEGMENTS[key];
  const fit = difficultyFit(courseDifficulty, seg);

  const overpriced = Math.max(0, valueRatio - 1);
  const priceFit = clamp(1 - overpriced * seg.priceSensitivity, 0, 1);

  const quality = clamp(
    (scenery / 100) * seg.sceneryWeight +
    (turfQuality / 100) * seg.turfWeight +
    amenityScore * seg.amenityWeight,
    0, 1.2
  ) / 1.2;

  // Destination guests are largely an Act II crowd: without beds they are
  // day-trippers and far rarer.
  const lodging = key === 'destination' && !hasRooms ? 0.25 : 1;

  return clamp(fit * priceFit * (0.45 + 0.55 * quality) * lodging, 0, 1);
}

/** Appeal for every segment, plus each one's share of the crowd. */
export function crowdMix(conditions) {
  const appeal = {};
  for (const key of SEGMENT_KEYS) appeal[key] = segmentAppeal(key, conditions);
  const total = SEGMENT_KEYS.reduce((s, k) => s + appeal[k], 0);
  const share = {};
  for (const key of SEGMENT_KEYS) share[key] = total > 0 ? appeal[key] / total : 0;
  return { appeal, share, total };
}
```

- [ ] **Step 4: Run the tests. If the no-universal-course test fails, the coefficients are wrong — fix them, not the test.** Report the grid sweep's best-case result either way: the highest minimum-across-segments appeal you could find, and at what settings.

- [ ] **Step 5: Commit** (`src/sim/segments.js`, `tests/segments.test.js`).

---

## Task 2: Guests carry a segment — TEST FIRST

**Files:** Modify `src/sim/golfer.js`; extend `tests/golfer.test.js`

- [ ] **Step 1: Tests.** A guest has a `segment`. Drawing many guests from a given share produces roughly that distribution. Handicaps differ by segment — serious golfers are markedly better players than locals. Wallets scale by `spendMultiplier`. Existing golfer tests still pass.

- [ ] **Step 2: Fail, then implement.** `makeGuest(rng, { prestige, greenFee, share })` picks a segment by weighted draw from `share`, then adjusts handicap and wallet from that segment's parameters. Default `share` to locals-only so existing callers and tests are unaffected.

- [ ] **Step 3: Commit.**

---

## Task 3: Satisfaction is felt per segment — TEST FIRST

**Files:** Modify `src/sim/satisfaction.js`; extend `tests/satisfaction.test.js`

- [ ] **Step 1: Tests.** The same round satisfies segments differently: on a hard, pristine, expensive course the serious golfer leaves happy and the local does not. Waiting hurts locals more than destination guests. Turf matters far more to serious golfers. Existing satisfaction tests still pass.

- [ ] **Step 2: Fail, then implement.** `guestSatisfaction` gains a `segment` argument (defaulting to `locals`) and a `courseDifficulty` input. Apply the segment's `waitWeight` to the wait penalty, its `priceSensitivity` to the price term, its `sceneryWeight`/`turfWeight`/`amenityWeight` to those bonuses, and add a difficulty-fit term from the same bell curve Task 1 uses — **import it rather than rewriting it**, so the two can never disagree.

- [ ] **Step 3: Commit.**

---

## Task 4: Demand is the sum of its parts — TEST FIRST

**Files:** Modify `src/sim/economy.js`; extend `tests/economy.test.js`

- [ ] **Step 1: Tests.** Total demand is the sum of per-segment demand. Raising difficulty grows the serious share and shrinks the locals share. Raising price shrinks locals hardest. Total is still capped by the tee sheet. Existing economy tests still pass.

- [ ] **Step 2: Fail, then implement.** `demandGroups` gains the course statistics it needs, calls `crowdMix`, and returns both a total and the per-segment breakdown. Keep the existing word-of-mouth and reputation terms — they apply to the whole crowd.

- [ ] **Step 3: Commit.**

---

## Task 5: Wire it into the day — TEST FIRST

**Files:** Modify `src/sim/day.js`; extend `tests/day.test.js`

- [ ] **Step 1: Tests.** The report carries a `crowd` breakdown (count and average satisfaction per segment) and a `courseDifficulty`. Segment counts sum to the total golfers. Determinism holds — same state and seed, same crowd. A course with no appeal to anyone draws nobody without crashing.

- [ ] **Step 2: Fail, then implement.** Compute mean course difficulty from `holeStats` across open holes, pass it everywhere it is needed, generate the crowd from the mix, and record per-segment counts and satisfaction in the report.

- [ ] **Step 3: Commit.**

---

## Task 6: Re-balance

**Files:** possibly any simulation constant; `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md`

Segments change who turns up and how they feel, which moves demand, revenue and prestige. The economy must be re-checked.

- [ ] **Step 1: Run `npm run balance`** and report the numbers verbatim, before touching anything.

- [ ] **Step 2: Compare against the targets in §8.3 and §13** — bankruptcy, gate reach, money, groups per day, round time, satisfaction, turf. Note that bankruptcy at 0% is a known structural limit until weather exists; do not chase it.

- [ ] **Step 3: Tune constants if measures have drifted out of range**, one or two at a time, re-running after each. **Never loosen a test to make a number look better.**

- [ ] **Step 4: Record the new values in the spec** and commit.

---

## Task 7: Narration lines — TEST FIRST

**Files:** Create `src/sim/narration.js`, `tests/narration.test.js`

Authored text that tells the player who is showing up and what they make of the place. This is the fix for emergent positioning being opaque.

- [ ] **Step 1: Tests.** A locals-dominated resort produces locals-flavoured lines; a serious-dominated one does not produce them. Selection is deterministic for a given state and seed. The same line does not repeat on consecutive days. There is always at least one line available for any state — **a silent day is a bug**, because silence is indistinguishable from the feature being broken.

- [ ] **Step 2: Fail, then implement.**

Each entry is `{ id, speaker, text, when(state, report) }`. Selection filters by `when`, then picks deterministically from the seeded generator, avoiding the previous day's id.

Write at least **twenty** lines across these situations, in the voices of the people saying them:
- Each segment dominating the crowd
- The crowd shifting from one segment toward another
- A course too hard for the crowd it is drawing, and too easy
- Prices above and below what the course is worth
- Turf conspicuously good, and conspicuously bad
- A quiet day, and a heaving one
- A magazine or local-paper review reflecting course rating

Voice matters more than coverage here. *"Drove two hours for this. Worth it."* does more work than a sentence explaining that serious-golfer appeal has risen.

- [ ] **Step 3: Commit.**

---

## Task 8: The report says who came — visual checkpoint

**Files:** Modify `src/ui/report.js`; extend `tests/report.test.js`

- [ ] **Step 1: Implement.** A section showing the crowd: each segment's count, its share, and how satisfied it was — and **the change since yesterday**, since the shift is the interesting part. A local mix drifting toward serious golfers is the story the player needs to see.

- [ ] **Step 2: Look at it** at 375×812 and 390×664, in a fresh browser tab for a clean console. **You should see** at a glance which crowd you are running and whether it is changing. **It is wrong if** you cannot tell the segments apart or the section pushes the gate checklist off the screen.

- [ ] **Step 3: Commit.**

---

## Task 9: The narration card — visual checkpoint

**Files:** Create `src/ui/narration.js`; modify `src/main.js`

- [ ] **Step 1: Implement.** A card showing the speaker and their line, appearing after the evening report. Dismissible with one tap. Keep it light — this fires most days, so it must never feel like an obstacle.

Per the spec, a recurring character is the preferred delivery. If one voice does not fit every line, keep a small cast — a course marshal, a regular, a visiting golfer — rather than anonymous text.

- [ ] **Step 2: Play five days** at 375×812 and report honestly whether the lines feel informative or noisy.

- [ ] **Step 3: Commit.**

---

## Definition of done

- [ ] All 276 prior tests green, plus the new suites
- [ ] `tests/purity.test.js` still passes — `src/sim/` stayed pure
- [ ] The grid sweep confirms **no course configuration satisfies every segment**
- [ ] `npm run balance` is inside the targets, or any drift is recorded and explained
- [ ] Five days playable at 375×812 with the crowd legible in the report
- [ ] Nothing pushed

## Out of scope

Decision events, staff morale and slack, weather, amenity tiers. All are later slices in §15a.8. This plan ends when the player can tell who is playing their course and why.
