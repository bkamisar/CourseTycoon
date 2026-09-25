# Act III Simulation Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a championship playable in the simulation — bid for it, condition the course at a cost, close for the week, and be paid against a contract the player could read in advance.

**Architecture:** Two new pure modules (`tournaments.js` for the ladder, contracts and scoring; `field.js` for what a championship field shoots) plus wiring in `day.js`. Everything follows the existing house rules: nothing in `src/sim/` touches a DOM or a clock, all randomness comes from `makeRng`, and every new number carries the reasoning for its value.

**Tech Stack:** ES modules, no build step, `node --test`. No new dependencies.

**Out of scope for this plan** — a second plan covers the surface: contract cards, the four infrastructure buildings, the tournament report, and the setup dial's own screen. The one exception is a HUD countdown (Task 9), because without something visible none of this can be played, and a plan whose output cannot be sat down with is a plan that only tests can check.

---

## File structure

| File | Responsibility |
|---|---|
| `src/sim/tournaments.js` (new) | The three rungs, their requirements and target bands; the setup dial's climb and decay; contract terms; scoring the four conditions. Pure. |
| `src/sim/field.js` (new) | Plays a championship field over the course and reports how it played. Pure. Reuses `round.js`. |
| `src/sim/state.js` (modify) | `tournament` state on the resort; defaults on load for old saves. |
| `src/sim/day.js` (modify) | Setup climbs and decays; setup raises effective difficulty; a tournament day skips normal play; resolution pays the contract. |
| `tests/tournaments.test.js` (new) | The ladder, the dial, the contract, the scoring. |
| `tests/field.test.js` (new) | A harder course produces higher scores; the report is shaped. |
| `tests/tournamentDay.test.js` (new) | The day loop: run-up cost, the closed week, payout. |

`field.js` is separate from `tournaments.js` because it has a different job and a
different dependency: `tournaments.js` is rules and money and depends on nothing;
`field.js` plays golf and depends on `round.js` and `golfer.js`. Keeping them
apart means the rules can be tested without simulating a single shot.

---

## Task 1: The ladder

**Files:**
- Create: `src/sim/tournaments.js`
- Test: `tests/tournaments.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNGS, RUNG_IDS, rungFor, eligibleFor } from '../src/sim/tournaments.js';

test('there are three rungs, each fully specified', () => {
  assert.equal(RUNG_IDS.length, 3);
  for (const id of RUNG_IDS) {
    const rung = RUNGS[id];
    assert.equal(rung.id, id, `${id}: id does not match its key`);
    assert.ok(rung.label && rung.blurb && rung.blurb.length > 30, `${id}: thin copy`);
    assert.ok(rung.prestige > 0, `${id}: needs a prestige floor`);
    assert.ok(rung.band.low < rung.band.high, `${id}: band is inverted`);
    assert.ok(rung.band.low >= 0 && rung.band.high <= 100, `${id}: band outside 0-100`);
    assert.ok(rung.baseFee > 0 && rung.purseCeiling > rung.baseFee,
      `${id}: the ceiling must beat the base or the bonuses are decoration`);
    assert.ok(Array.isArray(rung.requires), `${id}: requires must be a list`);
  }
});

test('the rungs escalate', () => {
  const order = RUNG_IDS.map((id) => RUNGS[id]);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].prestige > order[i - 1].prestige, 'prestige floor must rise');
    assert.ok(order[i].baseFee > order[i - 1].baseFee, 'the money must rise');
    assert.ok(order[i].band.low > order[i - 1].band.low, 'the course must be asked for more');
  }
});

test('eligibility needs the prestige AND the buildings', () => {
  const resort = { amenities: [], rooms: {} };
  assert.equal(eligibleFor('countyOpen', { prestige: 40, resort, holesOpen: 18 }), false,
    'prestige 40 is below every floor');
  assert.equal(eligibleFor('countyOpen', { prestige: 60, resort, holesOpen: 9 }), false,
    'nine holes cannot host a championship');
  assert.equal(eligibleFor('countyOpen', { prestige: 60, resort, holesOpen: 18 }), true);

  // The regional wants buildings the county did not.
  assert.equal(eligibleFor('regional', { prestige: 75, resort, holesOpen: 18 }), false,
    'no grandstands, no regional');
  const built = { amenities: [{ type: 'grandstands' }, { type: 'overflowParking' }], rooms: {} };
  assert.equal(eligibleFor('regional', { prestige: 75, resort: built, holesOpen: 18 }), true);
});

test('rungFor tolerates nonsense', () => {
  assert.equal(rungFor('nope'), null);
  assert.equal(rungFor(undefined), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournaments.test.js`
Expected: FAIL — `Cannot find module '../src/sim/tournaments.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/sim/tournaments.js`:

```js
/**
 * Championships: what they ask for, what they pay, and how they are judged.
 *
 * Act III's central idea is a shape of time the game has never had. Every
 * day in Acts I and II is the same shape — open, play, read the report,
 * decide. A championship is a spike the player sees coming, pays for in
 * advance, and then survives or does not.
 *
 * Three rungs, climbed in order. Bidding is deliberately NOT a dice roll:
 * the player applies and is accepted if the requirements are met, because
 * a management game should not hinge on luck for its central progression.
 * The uncertainty belongs in how the week goes.
 *
 * Pure. Nothing here computes with a DOM or a clock.
 */

/** The eighteen a championship needs. Named rather than inlined because
 * the Act I gate's nine and this are different numbers for different
 * reasons and should not drift into each other. */
export const CHAMPIONSHIP_HOLES = 18;

const LIST = [
  {
    id: 'countyOpen',
    label: 'County Open',
    blurb: 'Two hundred entries, a local paper, and a trophy somebody has to fetch from a cupboard. Nobody outside the county will hear about it, which is the point of starting here.',
    prestige: 55,
    requires: [],
    band: { low: 45, high: 60 },
    baseFee: 18000,
    purseCeiling: 48000,
  },
  {
    id: 'regional',
    label: 'Regional Championship',
    blurb: 'A field worth watching and a crowd worth seating. The first rung where people arrive who did not drive themselves, and the first where the course is expected to be a test rather than a nice day out.',
    prestige: 70,
    requires: ['grandstands', 'overflowParking'],
    band: { low: 62, high: 78 },
    baseFee: 45000,
    purseCeiling: 120000,
  },
  {
    id: 'national',
    label: 'National Open',
    blurb: 'Television, a press tent, and every hole photographed from the air. A week that makes a resort or files it permanently under "nearly".',
    prestige: 82,
    requires: ['mediaCentre', 'hospitalityPavilion'],
    band: { low: 80, high: 92 },
    baseFee: 110000,
    purseCeiling: 290000,
  },
];

export const RUNGS = Object.freeze(Object.fromEntries(
  LIST.map((r) => [r.id, Object.freeze({ ...r, band: Object.freeze(r.band) })])
));

/** In climbing order. */
export const RUNG_IDS = Object.freeze(LIST.map((r) => r.id));

/** Safe for an unknown id, the way every other lookup in this codebase is. */
export function rungFor(id) {
  return RUNGS[id] ?? null;
}

/**
 * Whether the resort could host this rung today.
 *
 * Prestige is a floor rather than the real gate: a resort leaving Act II
 * measures 78-85, so the buildings are what actually decides. That is
 * deliberate — the decision being asked for is whether to sink money into
 * things that do nothing most of the year.
 */
export function eligibleFor(rungId, { prestige = 0, resort, holesOpen = 0 }) {
  const rung = rungFor(rungId);
  if (!rung) return false;
  if (holesOpen < CHAMPIONSHIP_HOLES) return false;
  if (prestige < rung.prestige) return false;
  const built = new Set((resort?.amenities ?? []).map((a) => a.type));
  return rung.requires.every((type) => built.has(type));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournaments.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/sim/tournaments.js tests/tournaments.test.js
git commit -m "Add the championship ladder, with bidding that is not a dice roll"
```

---

## Task 2: The setup dial

**Files:**
- Modify: `src/sim/tournaments.js`
- Test: `tests/tournaments.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tournaments.test.js`:

```js
import {
  SETUP_DECAY_PER_DAY, setupClimb, nextSetup, setupDifficultyBonus, withinBand,
} from '../src/sim/tournaments.js';

test('the grounds crew decides how fast the course hardens', () => {
  // Groundskeepers have had one job since Act I. This is their second,
  // and a thin crew physically cannot get a course ready in three weeks.
  assert.equal(setupClimb(0), 0, 'nobody working means nothing happens');
  assert.ok(setupClimb(4) > setupClimb(2), 'more staff, faster');
  // Three weeks is the run-up, so a full crew must be able to reach a
  // national's band inside it or the top rung is unreachable.
  const crew = 6;
  let setup = 0;
  for (let d = 0; d < 21; d++) setup = nextSetup(setup, { keepers: crew, conditioning: true });
  assert.ok(setup >= 80, `six keepers reached only ${setup.toFixed(0)} in 21 days`);
});

test('setup falls back when nobody is working on it', () => {
  let setup = 90;
  for (let d = 0; d < 10; d++) setup = nextSetup(setup, { keepers: 6, conditioning: false });
  assert.ok(setup < 90, 'it has to decay');
  assert.ok(setup >= 0, 'and never go below zero');
  assert.equal(nextSetup(0, { keepers: 0, conditioning: false }), 0);
});

test('a hard setup makes the course play harder', () => {
  assert.equal(setupDifficultyBonus(0), 0, 'an unconditioned course plays as itself');
  assert.ok(setupDifficultyBonus(100) > setupDifficultyBonus(50));
  assert.ok(setupDifficultyBonus(100) <= 30,
    'setup must not be able to outweigh the course the player actually built');
});

test('the band is a band, not a threshold', () => {
  assert.equal(withinBand(52, RUNGS.countyOpen.band), true);
  assert.equal(withinBand(30, RUNGS.countyOpen.band), false, 'under-prepared');
  assert.equal(withinBand(85, RUNGS.countyOpen.band), false,
    'a county open tricked up like a national is also wrong');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournaments.test.js`
Expected: FAIL — `SETUP_DECAY_PER_DAY is not defined` / import errors

- [ ] **Step 3: Write minimal implementation**

Append to `src/sim/tournaments.js`:

```js
import { clamp } from './hole.js';

/**
 * How much championship condition one groundskeeper adds in a day.
 *
 * Set so that six keepers reach a national's band (80) inside the
 * 21-day run-up and two cannot. Conditioning is the second job this
 * staff has ever had, which is the point: an existing lever gains a new
 * reason to matter rather than a parallel one being invented.
 */
export const SETUP_PER_KEEPER = 0.72;

/** And it falls back on its own, because firm greens do not stay firm. */
export const SETUP_DECAY_PER_DAY = 3.5;

/** What one day of work adds, given the crew. */
export function setupClimb(keepers = 0) {
  return Math.max(0, keepers) * SETUP_PER_KEEPER * 100 / 21;
}

/**
 * Tomorrow's setup.
 *
 * `conditioning` is whether the resort is working toward a championship
 * at all. When it is not, the course drifts back to being a course.
 */
export function nextSetup(setup = 0, { keepers = 0, conditioning = false } = {}) {
  const moved = conditioning
    ? setup + setupClimb(keepers)
    : setup - SETUP_DECAY_PER_DAY;
  return clamp(moved, 0, 100);
}

/**
 * How much harder a conditioned course plays.
 *
 * Capped well below the range the player's own holes cover, because a
 * setup dial that could outweigh the course would make two acts of hole
 * design irrelevant in the third.
 */
export const MAX_SETUP_DIFFICULTY = 26;

export function setupDifficultyBonus(setup = 0) {
  return (clamp(setup, 0, 100) / 100) * MAX_SETUP_DIFFICULTY;
}

/** Whether the course is set the way this rung wants it. */
export function withinBand(setup, band) {
  return setup >= band.low && setup <= band.high;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournaments.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/sim/tournaments.js tests/tournaments.test.js
git commit -m "Add the championship setup dial, staffed by the grounds crew"
```

---

## Task 3: Tournament state, and setup moving day to day

**Files:**
- Modify: `src/sim/state.js`
- Modify: `src/sim/day.js`
- Test: `tests/tournamentDay.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/tournamentDay.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, serialize, deserialize } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';

/** A resort that has finished Act II, which is where Act III begins. */
function actThreeResort(seed = 3) {
  const state = newGame(seed);
  state.act = 3;
  state.money = 400000;
  state.prestige = 80;
  for (let i = 0; i < 6; i++) state.resort.staff.push({ role: 'groundskeeper' });
  return state;
}

test('a new game carries tournament state that survives a save', () => {
  const state = newGame(1);
  assert.equal(state.resort.setup, 0, 'a course starts unconditioned');
  assert.equal(state.tournament, null, 'and with nothing booked');
  const revived = deserialize(serialize(state));
  assert.equal(revived.resort.setup, 0);
  assert.equal(revived.tournament, null);
});

test('setup climbs while a championship is booked and falls back after', () => {
  let state = actThreeResort();
  state.tournament = { rung: 'countyOpen', day: state.day + 21, resolved: false };

  for (let d = 0; d < 10; d++) state = runDay(state, 3000 + d).state;
  const climbed = state.resort.setup;
  assert.ok(climbed > 20, `setup only reached ${climbed.toFixed(0)} in ten days`);

  state.tournament = null;
  for (let d = 0; d < 10; d++) state = runDay(state, 3100 + d).state;
  assert.ok(state.resort.setup < climbed, 'with nothing booked it must fall back');
});

test('a conditioned course is a worse day out', () => {
  // The sacrifice. Locals want an easy course — SEGMENTS.locals
  // idealDifficulty is 30 — and championship condition is the opposite
  // of that. The run-up has to cost something or it is theatre.
  function satisfactionWith(setup) {
    let state = actThreeResort(7);
    state.resort.setup = setup;
    if (setup > 0) state.tournament = { rung: 'national', day: state.day + 21, resolved: false };
    let total = 0;
    for (let d = 0; d < 6; d++) {
      const out = runDay(state, 3200 + d);
      state = out.state;
      total += out.report.averageSatisfaction;
    }
    return total / 6;
  }
  const easy = satisfactionWith(0);
  const hard = satisfactionWith(90);
  assert.ok(easy - hard > 4,
    `conditioning cost only ${(easy - hard).toFixed(1)} satisfaction; the run-up is theatre`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournamentDay.test.js`
Expected: FAIL — `state.resort.setup` is `undefined`

- [ ] **Step 3: Write minimal implementation**

In `src/sim/state.js`, inside the `resort` object literal in `newGame` (beside `shuttles: []`), add:

```js
      // Act III. How hard the course is set up for a championship, 0-100.
      // Lives on the resort rather than on the tournament because it
      // outlives one: it climbs before an event and decays after, and a
      // resort between championships still has a setting.
      setup: 0,
```

And beside `history: []` in the same state object:

```js
  // Act III. The championship currently booked, or null. See
  // src/sim/tournaments.js.
  tournament: null,
```

In `deserialize`, beside the other back-fills (`if (!parsed.goodwill) ...`), add:

```js
  // Saves from before Act III have neither. Default them rather than let
  // every later reader guard against a missing key.
  if (typeof parsed.resort?.setup !== 'number') parsed.resort.setup = 0;
  if (parsed.tournament === undefined) parsed.tournament = null;
```

In `src/sim/day.js`, add the import beside the other sim imports:

```js
import { nextSetup, setupDifficultyBonus } from './tournaments.js';
```

Immediately after `next.conditions = next.conditions ?? [];` near the top of
`runDay`, add:

```js
  // Act III. The course hardens while a championship is booked and drifts
  // back when one is not.
  const keepers = next.resort.staff.filter((m) => m.role === 'groundskeeper').length;
  next.resort.setup = nextSetup(next.resort.setup ?? 0, {
    keepers,
    conditioning: Boolean(next.tournament && !next.tournament.resolved),
  });
```

Find where `courseDifficulty` is computed for the day and add the setup on top of
it. The existing line reads:

```js
  const courseDifficulty = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).difficulty, 0) / holes.length
    : 50;
```

Replace it with:

```js
  const baseDifficulty = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).difficulty, 0) / holes.length
    : 50;
  // Firm greens and thick rough are what a championship wants and what a
  // Tuesday fourball hates. This is the whole cost of the run-up: the
  // course the regulars are paying for gets worse for weeks before
  // anybody is paid anything.
  const courseDifficulty = clamp(baseDifficulty + setupDifficultyBonus(next.resort.setup ?? 0), 0, 100);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournamentDay.test.js`
Expected: PASS, 3 tests

Then run the whole suite to catch anything the difficulty change disturbed:

Run: `node --test "tests/*.test.js"`
Expected: all pass. If a satisfaction or segment test fails, read it before
changing it — a test that breaks here is reporting that difficulty moved, which
is the intended effect, but the fixture may have been asserting a number rather
than a behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/sim/state.js src/sim/day.js tests/tournamentDay.test.js
git commit -m "Let the course harden for a championship, at the regulars' expense"
```

---

## Task 4: Bidding and award

**Files:**
- Modify: `src/sim/tournaments.js`
- Test: `tests/tournaments.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tournaments.test.js`:

```js
import { RUN_UP_DAYS, bidFor, nextRungFor } from '../src/sim/tournaments.js';

test('winning a bid books a date three weeks out', () => {
  const state = {
    day: 100, prestige: 75, act: 3, tournament: null,
    resort: { amenities: [{ type: 'grandstands' }, { type: 'overflowParking' }] },
    tournamentsHosted: ['countyOpen'],
  };
  const booked = bidFor(state, 'regional', { holesOpen: 18 });
  assert.ok(booked, 'a resort that meets the requirements should be accepted');
  assert.equal(booked.rung, 'regional');
  assert.equal(booked.day, 100 + RUN_UP_DAYS);
  assert.equal(booked.resolved, false);
});

test('a bid is refused when the requirements are not met', () => {
  const state = {
    day: 100, prestige: 40, act: 3, tournament: null,
    resort: { amenities: [] }, tournamentsHosted: [],
  };
  assert.equal(bidFor(state, 'countyOpen', { holesOpen: 18 }), null);
});

test('rungs are climbed in order, and not skipped', () => {
  assert.equal(nextRungFor([]), 'countyOpen');
  assert.equal(nextRungFor(['countyOpen']), 'regional');
  assert.equal(nextRungFor(['countyOpen', 'regional']), 'national');
  assert.equal(nextRungFor(['countyOpen', 'regional', 'national']), null,
    'there is nothing above a national');
});

test('a resort cannot book two championships at once', () => {
  const state = {
    day: 100, prestige: 90, act: 3,
    tournament: { rung: 'countyOpen', day: 110, resolved: false },
    resort: { amenities: [] }, tournamentsHosted: [],
  };
  assert.equal(bidFor(state, 'countyOpen', { holesOpen: 18 }), null,
    'one week at a time');
});

test('a barred rung refuses the bid until the bar expires', () => {
  const state = {
    day: 100, prestige: 90, act: 3, tournament: null,
    resort: { amenities: [] }, tournamentsHosted: [],
    tournamentBars: { countyOpen: 160 },
  };
  assert.equal(bidFor(state, 'countyOpen', { holesOpen: 18 }), null,
    'barred until day 160');
  assert.ok(bidFor({ ...state, day: 161 }, 'countyOpen', { holesOpen: 18 }),
    'and welcome again afterwards');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournaments.test.js`
Expected: FAIL — `bidFor is not defined`

- [ ] **Step 3: Write minimal implementation**

Append to `src/sim/tournaments.js`:

```js
/**
 * Days between winning a bid and the first round.
 *
 * Three weeks rather than the eight first sketched. A long run-up is a
 * grind rather than a sprint, and the cost of conditioning should be
 * visible and sharp rather than a two-month drag on the takings.
 */
export const RUN_UP_DAYS = 21;

/** The next rung this resort is allowed to attempt, or null at the top. */
export function nextRungFor(hosted = []) {
  const done = new Set(hosted);
  return RUN_IDS_IN_ORDER.find((id) => !done.has(id)) ?? null;
}

const RUN_IDS_IN_ORDER = RUNG_IDS;

/**
 * Applies for a championship.
 *
 * Returns the booking, or null if the body says no. Refusal is never a
 * dice roll: every reason is a condition the player can read and fix.
 */
export function bidFor(state, rungId, { holesOpen = 0 } = {}) {
  const rung = rungFor(rungId);
  if (!rung) return null;
  // One week at a time.
  if (state.tournament && !state.tournament.resolved) return null;
  // Rungs are climbed, not skipped.
  if (nextRungFor(state.tournamentsHosted ?? []) !== rungId) return null;
  // A rung you embarrassed yourself at is given to somebody else for a while.
  const barredUntil = state.tournamentBars?.[rungId] ?? 0;
  if (state.day <= barredUntil) return null;
  if (!eligibleFor(rungId, {
    prestige: state.prestige,
    resort: state.resort,
    holesOpen,
  })) return null;

  return { rung: rungId, day: state.day + RUN_UP_DAYS, resolved: false };
}
```

Note: `RUN_IDS_IN_ORDER` is declared with `const` after its use inside
`nextRungFor`, which is legal because the function body does not run until it is
called. Keep it immediately below for readability.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournaments.test.js`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add src/sim/tournaments.js tests/tournaments.test.js
git commit -m "Let a resort bid for a championship, and be refused for reasons it can read"
```

---

## Task 5: The closed week

**Files:**
- Modify: `src/sim/day.js`
- Test: `tests/tournamentDay.test.js`

This is the risky task. `runDay` has always assumed golfers exist, and a
championship day has none of the usual ones. The approach is to short-circuit
*before* the crowd is generated and return a report of the same shape with the
normal-play figures zeroed, so that every existing reader — the HUD, the report,
the investors, the gate — keeps working without knowing tournaments exist.

- [ ] **Step 1: Write the failing test**

Append to `tests/tournamentDay.test.js`:

```js
test('the course closes for the championship week', () => {
  let state = actThreeResort(11);
  state.resort.rooms = { standard: 20, suite: 8 };
  state.resort.pricing.roomRate = 200;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };

  const { state: after, report } = runDay(state, 3300);
  assert.equal(report.tournamentDay, true, 'the report has to say what kind of day this was');
  assert.equal(report.groupsPlayed, 0, 'nobody is playing a casual round');
  assert.equal(report.revenue.greenFees, 0, 'and nobody is paying a green fee');
  assert.ok(report.revenue.rooms > 0, 'but the hotel is the fullest it will ever be');
  assert.ok(report.costs.total > 0, 'the bills do not stop');
  assert.equal(after.day, state.day + 1, 'and the day still advances');
});

test('a closed day does not break anything downstream', () => {
  // Every reader of a report — the HUD, the evening screen, the
  // investors, the gate — predates tournaments and must not need to know
  // about them.
  let state = actThreeResort(12);
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };
  const { state: after, report } = runDay(state, 3400);

  assert.ok(Number.isFinite(report.revenue.total));
  assert.ok(Number.isFinite(report.costs.total));
  assert.ok(Number.isFinite(report.profit));
  assert.ok(Number.isFinite(report.averageSatisfaction));
  assert.ok(Array.isArray(report.crowd ? Object.keys(report.crowd) : []));
  assert.ok(report.gate, 'the gate readout still has to exist');
  assert.doesNotThrow(() => runDay(after, 3401), 'and the next day still plays');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournamentDay.test.js`
Expected: FAIL — `report.tournamentDay` is `undefined`

- [ ] **Step 3: Write minimal implementation**

In `src/sim/day.js`, find where the day's crowd is generated — the line
beginning `const demand = holes.length ? demandGroups({`. Immediately **before**
it, insert:

```js
  // Act III. On the day of a championship the course is closed to normal
  // play: no tee sheet, no green fees, no casual golfers. Everything that
  // bills anyway still bills, and the hotel has its best night of the
  // year.
  //
  // Handled by forcing the crowd to nothing rather than by branching the
  // rest of the function, so that every existing reader of a report — the
  // HUD, the evening screen, the investors, the gate — keeps working
  // without knowing tournaments exist. A second code path through a
  // seven-hundred-line day would be a far better way to produce a bug.
  const championshipToday = Boolean(
    next.tournament && !next.tournament.resolved && next.day >= next.tournament.day
  );
```

Then change the demand line from:

```js
  const demand = holes.length
    ? demandGroups({ ... })
    : { total: 0, share: ..., ceiling: 0, wanted: 0, limitedBy: 'demand' };
```

to guard on both conditions:

```js
  const demand = holes.length && !championshipToday
    ? demandGroups({ ... })
    : { total: 0, share: ..., ceiling: 0, wanted: 0, limitedBy: 'demand' };
```

(Keep the existing contents of both branches exactly as they are; only the
condition changes.)

Finally, beside the other `report.*` assignments near the end of `runDay`, add:

```js
  report.tournamentDay = championshipToday;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournamentDay.test.js`
Expected: PASS, 5 tests

Run: `node --test "tests/*.test.js"`
Expected: all pass. A zero-crowd day already happens when no holes are open, so
the machinery downstream has been exercised since Act I.

- [ ] **Step 5: Commit**

```bash
git add src/sim/day.js tests/tournamentDay.test.js
git commit -m "Close the course for the championship week"
```

---

## Task 6: What the field shoots

**Files:**
- Create: `src/sim/field.js`
- Test: `tests/field.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/field.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { playField, FIELD_SIZE } from '../src/sim/field.js';

function course(count = 18) {
  return Array.from({ length: count }, (_, i) =>
    ({ ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true }));
}

test('a field plays the course and reports how it played', () => {
  const round = playField(makeRng(1), course(), { setup: 60, turfQuality: 80 });
  assert.equal(round.players, FIELD_SIZE);
  assert.ok(Number.isFinite(round.averageToPar), 'the headline number must be a number');
  assert.ok(round.best <= round.averageToPar, 'somebody has to be better than average');
  assert.ok(round.worst >= round.averageToPar);
  assert.equal(round.hardestHole >= 1 && round.hardestHole <= 18, true,
    'the hardest hole must be one of the holes');
  assert.ok(round.underPar >= 0 && round.underPar <= FIELD_SIZE);
});

test('a harder setup produces higher scores', () => {
  // The read-out for the whole act. If the field shoots the same however
  // the course is set, the setup dial is decoration and the player has no
  // way to find the band.
  const soft = playField(makeRng(2), course(), { setup: 20, turfQuality: 85 });
  const hard = playField(makeRng(2), course(), { setup: 95, turfQuality: 85 });
  assert.ok(hard.averageToPar > soft.averageToPar + 1,
    `setup 95 (${hard.averageToPar.toFixed(1)}) barely beat setup 20 (${soft.averageToPar.toFixed(1)})`);
  assert.ok(hard.underPar <= soft.underPar, 'fewer should break par on a harder course');
});

test('a championship field is better than a Tuesday fourball', () => {
  // They are not the resort's usual guests. A field of 14-handicappers
  // would make every setup look brutal and the band unfindable.
  const round = playField(makeRng(3), course(), { setup: 55, turfQuality: 85 });
  assert.ok(round.averageToPar < 12,
    `the field averaged ${round.averageToPar.toFixed(1)} over par, which is not a championship field`);
});

test('the same seed plays the same championship', () => {
  const a = playField(makeRng(9), course(), { setup: 70, turfQuality: 75 });
  const b = playField(makeRng(9), course(), { setup: 70, turfQuality: 75 });
  assert.deepEqual(a, b, 'a replayed game must play out identically');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/field.test.js`
Expected: FAIL — `Cannot find module '../src/sim/field.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/sim/field.js`:

```js
/**
 * What a championship field shoots, and nothing about who they are.
 *
 * This is the read-out for the setup dial, and without it the central
 * decision of Act III is a guess. A course set soft for its rung gets
 * shot to pieces and reads as a resort course that should not have bid;
 * one set past its band produces scores nobody can separate and greens
 * that die by Saturday. Between them is a test.
 *
 * Deliberately impersonal. No names, no leaderboard, no careers — the
 * field is weather with a scorecard. Simulating players is a different
 * game, and this one is about running the venue.
 *
 * Pure. Reuses `playHole` rather than reimplementing golf.
 */
import { playHole } from './round.js';
import { holeStats } from './hole.js';
import { setupDifficultyBonus } from './tournaments.js';

/** Players in the field. Enough that an average means something and few
 * enough that a week is not a thousand simulated rounds. */
export const FIELD_SIZE = 60;

/** A championship field is not the resort's usual Tuesday crowd. */
const FIELD_HANDICAP_LOW = 0;
const FIELD_HANDICAP_HIGH = 6;

/**
 * Plays one round of a championship and reports how the course played.
 *
 * `setup` and `turfQuality` are the two things the player controls; the
 * rng carries everything else, so the same seed replays identically.
 */
export function playField(rng, holes, { setup = 0, turfQuality = 100 } = {}) {
  const par = holes.reduce((sum, h) => sum + holeStats(h).par, 0);
  // A conditioned course plays longer and less forgiving, and worn turf
  // adds its own unpredictability.
  const handicapAdjust = -setupDifficultyBonus(setup) / 10;
  const puttAdjust = (100 - turfQuality) / 100;

  const toPar = [];
  const holeStrokes = holes.map(() => 0);
  const holePar = holes.map((h) => holeStats(h).par);

  for (let p = 0; p < FIELD_SIZE; p++) {
    const handicap = FIELD_HANDICAP_LOW
      + rng.int(FIELD_HANDICAP_HIGH - FIELD_HANDICAP_LOW + 1);
    const player = {
      id: p,
      guests: [{
        id: p, name: 'competitor', handicap, wallet: 0,
        segment: 'serious', patience: 100, energy: 100,
      }],
    };
    let strokes = 0;
    holes.forEach((hole, i) => {
      const played = playHole(rng, hole, player, {
        carts: false, handicapAdjust, puttAdjust, spread: 1,
      });
      strokes += played.totalStrokes;
      holeStrokes[i] += played.totalStrokes;
    });
    toPar.push(strokes - par);
  }

  toPar.sort((a, b) => a - b);
  const average = toPar.reduce((s, v) => s + v, 0) / toPar.length;

  // Which hole took the most off the field, relative to its par.
  let hardest = 0;
  let hardestOver = -Infinity;
  holeStrokes.forEach((total, i) => {
    const over = total / FIELD_SIZE - holePar[i];
    if (over > hardestOver) { hardestOver = over; hardest = i; }
  });

  return {
    players: FIELD_SIZE,
    par,
    averageToPar: Number(average.toFixed(2)),
    best: toPar[0],
    worst: toPar[toPar.length - 1],
    underPar: toPar.filter((v) => v < 0).length,
    hardestHole: hardest + 1,
    hardestHoleOverPar: Number(hardestOver.toFixed(2)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/field.test.js`
Expected: PASS, 4 tests

If "a harder setup produces higher scores" fails, the lever is
`handicapAdjust`: `playHole` takes it as a modifier on the player's handicap, so
a larger negative number makes the course play harder. Tune the divisor in
`-setupDifficultyBonus(setup) / 10` and re-run rather than changing the test —
the test is stating the requirement the act depends on.

- [ ] **Step 5: Commit**

```bash
git add src/sim/field.js tests/field.test.js
git commit -m "Report what a championship field shoots, so the setup band is findable"
```

---

## Task 7: Scoring the contract and paying out

**Files:**
- Modify: `src/sim/tournaments.js`
- Modify: `src/sim/day.js`
- Test: `tests/tournaments.test.js`, `tests/tournamentDay.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tournaments.test.js`:

```js
import { scoreTournament, contractFor } from '../src/sim/tournaments.js';

test('the contract lists every bonus before it is signed', () => {
  // Every cost line in this game tells the player what they are getting
  // into if they read it. The tournament is not an exception.
  for (const id of RUNG_IDS) {
    const contract = contractFor(id);
    assert.equal(contract.baseFee, RUNGS[id].baseFee);
    assert.equal(contract.bonuses.length, 4, 'four named conditions');
    for (const bonus of contract.bonuses) {
      assert.ok(bonus.id && bonus.label && bonus.label.length > 8, 'each bonus needs a name');
      assert.ok(bonus.amount > 0, `${bonus.id} pays nothing`);
    }
    const ceiling = contract.baseFee + contract.bonuses.reduce((s, b) => s + b.amount, 0);
    assert.equal(ceiling, RUNGS[id].purseCeiling,
      `${id}: the advertised ceiling must equal what the bonuses actually add up to`);
  }
});

test('a perfect week earns the ceiling and a shambles earns the base', () => {
  const perfect = scoreTournament('countyOpen', {
    setup: 52, turfQuality: 88, paceOnTarget: true, crowdHandled: true,
  });
  assert.equal(perfect.paid, RUNGS.countyOpen.purseCeiling);
  assert.equal(perfect.met.length, 4);
  assert.ok(perfect.prestige > 0, 'and it should be worth something in reputation');

  const shambles = scoreTournament('countyOpen', {
    setup: 15, turfQuality: 40, paceOnTarget: false, crowdHandled: false,
  });
  assert.equal(shambles.paid, RUNGS.countyOpen.baseFee);
  assert.equal(shambles.met.length, 0);
  assert.ok(shambles.prestige < 0, 'a shambles has to cost reputation');
  assert.ok(shambles.barDays > 0, 'and the rung should go to somebody else for a while');
});

test('overcooking the course fails the band as surely as undercooking', () => {
  const tricked = scoreTournament('countyOpen', {
    setup: 95, turfQuality: 88, paceOnTarget: true, crowdHandled: true,
  });
  assert.ok(!tricked.met.includes('band'),
    'a county open set like a national is not set correctly');
  assert.ok(tricked.paid < RUNGS.countyOpen.purseCeiling);
});

test('a good week is never barred', () => {
  const good = scoreTournament('regional', {
    setup: 70, turfQuality: 85, paceOnTarget: true, crowdHandled: true,
  });
  assert.equal(good.barDays, 0);
});
```

Append to `tests/tournamentDay.test.js`:

```js
test('the championship resolves, pays, and does not happen twice', () => {
  let state = actThreeResort(15);
  state.resort.setup = 52;
  state.turfQuality = 88;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };
  const before = state.money;

  const first = runDay(state, 3500);
  state = first.state;
  assert.ok(first.report.tournament, 'the report has to carry the result');
  assert.ok(state.money > before, 'and the contract has to pay');
  assert.equal(state.tournament, null, 'the booking is spent');
  assert.ok((state.tournamentsHosted ?? []).includes('countyOpen'),
    'and it is recorded as hosted, so the next rung opens');

  const second = runDay(state, 3501);
  assert.equal(second.report.tournament ?? null, null,
    'a championship must not resolve twice');
  assert.equal(second.report.tournamentDay, false, 'and the course reopens');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournaments.test.js tests/tournamentDay.test.js`
Expected: FAIL — `scoreTournament is not defined`

- [ ] **Step 3: Write minimal implementation**

Append to `src/sim/tournaments.js`:

```js
/**
 * What each condition pays, as a share of the gap between the base fee
 * and the advertised ceiling.
 *
 * Shares rather than absolute figures so the four conditions keep their
 * relative weight at every rung, and so a change to a rung's money does
 * not silently make the advertised ceiling a lie.
 */
const BONUS_SHARES = Object.freeze([
  { id: 'band', label: 'Course set as asked', share: 0.40 },
  { id: 'turf', label: 'Turf still standing', share: 0.27 },
  { id: 'pace', label: 'Rounds inside the pace target', share: 0.20 },
  { id: 'crowd', label: 'Crowd handled without complaint', share: 0.13 },
]);

/** The turf a championship expects to leave on. */
export const TURF_EXPECTED = 78;

/** What a rung offers, in full, before anybody agrees to anything. */
export function contractFor(rungId) {
  const rung = rungFor(rungId);
  if (!rung) return null;
  const pot = rung.purseCeiling - rung.baseFee;
  // Rounded to whole dollars, with the last share taking the remainder so
  // the advertised ceiling is exactly what the bonuses add up to. A
  // contract whose total does not match its own line items is the same
  // bug as a cost line that lies.
  let spent = 0;
  const bonuses = BONUS_SHARES.map((b, i) => {
    const amount = i === BONUS_SHARES.length - 1
      ? pot - spent
      : Math.round(pot * b.share);
    spent += amount;
    return { id: b.id, label: b.label, amount };
  });
  return { rung: rungId, baseFee: rung.baseFee, bonuses, ceiling: rung.purseCeiling };
}

/** Prestige a rung moves, won or lost. */
const PRESTIGE_SWING = Object.freeze({ countyOpen: 6, regional: 11, national: 18 });

/** How long a rung is given to somebody else after a shambles. */
export const BAR_DAYS = 120;

/**
 * How the week went.
 *
 * `met` names the conditions that were satisfied, which is what the
 * report shows: four named outcomes traceable to something the player
 * did, rather than one opaque score.
 */
export function scoreTournament(rungId, {
  setup = 0, turfQuality = 0, paceOnTarget = false, crowdHandled = false,
} = {}) {
  const rung = rungFor(rungId);
  if (!rung) return null;
  const contract = contractFor(rungId);

  const met = [];
  if (withinBand(setup, rung.band)) met.push('band');
  if (turfQuality >= TURF_EXPECTED) met.push('turf');
  if (paceOnTarget) met.push('pace');
  if (crowdHandled) met.push('crowd');

  const paid = contract.bonuses.reduce(
    (sum, b) => sum + (met.includes(b.id) ? b.amount : 0),
    contract.baseFee
  );

  // Reputation follows the conditions rather than the money, so a resort
  // that ran a good week on a small rung is not punished for the rung
  // being small.
  const swing = PRESTIGE_SWING[rungId] ?? 6;
  const prestige = Math.round(((met.length / 4) * 2 - 1) * swing);

  return {
    rung: rungId,
    met,
    missed: contract.bonuses.map((b) => b.id).filter((id) => !met.includes(id)),
    paid,
    prestige,
    // Nothing below half the conditions is a week anybody wants repeated.
    barDays: met.length <= 1 ? BAR_DAYS : 0,
  };
}
```

In `src/sim/day.js`, extend the import:

```js
import { nextSetup, setupDifficultyBonus, scoreTournament } from './tournaments.js';
```

Immediately **after** `report.tournamentDay = championshipToday;`, add:

```js
  // Act III. The week resolves on the day it was booked for. Judged on
  // the four conditions the contract named when it was signed, each of
  // which is something the player did rather than a hidden score.
  if (championshipToday) {
    const result = scoreTournament(next.tournament.rung, {
      setup: next.resort.setup ?? 0,
      turfQuality: next.turfQuality,
      // Pace is the existing flow-shop target, pointed at a new audience.
      paceOnTarget: (report.averageRoundMinutes || 0) <= holes.length * TARGET_MINUTES_PER_HOLE * 1.1,
      // Crowd is infrastructure, which the second plan builds. Until it
      // exists, a rung with no building requirements is always handled.
      crowdHandled: true,
    });
    next.money += result.paid;
    next.prestige = clamp(next.prestige + result.prestige, 0, 100);
    next.tournamentsHosted = [...(next.tournamentsHosted ?? []), result.rung];
    if (result.barDays > 0) {
      next.tournamentBars = {
        ...(next.tournamentBars ?? {}),
        [result.rung]: next.day + result.barDays,
      };
    }
    next.tournament = null;
    report.tournament = result;
    revenue.tournament = result.paid;
    revenue.total += result.paid;
  }
```

`TARGET_MINUTES_PER_HOLE` is already imported by `day.js`. `clamp` is already
imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournaments.test.js tests/tournamentDay.test.js`
Expected: PASS

Run: `node --test "tests/*.test.js"`
Expected: all pass. The revenue breakdown on the evening report is data-driven
(`REVENUE_LABELS` in `src/ui/report.js` renders any key it is given, humanising
ones it has no label for), so `revenue.tournament` will appear as "Tournament"
with no UI change required, and the rows will still sum to the total.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tournaments.js src/sim/day.js tests/tournaments.test.js tests/tournamentDay.test.js
git commit -m "Pay the hosting contract against the four conditions it named"
```

---

## Task 8: Teach the operator to host

**Files:**
- Modify: `tools/operator.js`
- Test: none — `tools/` is measurement, not shipped code

Act I shipped broken because spot measurements said it was fine. Act II was never
measured until it was finished, and the first sweep found a money printer. The
operator must learn Act III before any number in this plan is believed.

- [ ] **Step 1: Add the hosting policy**

Append to `tools/operator.js`:

```js
import {
  RUNG_IDS, RUNGS, bidFor, nextRungFor, contractFor,
} from '../src/sim/tournaments.js';

/**
 * A competent host, on the same terms as the operator above.
 *
 * Bids for the next rung as soon as it is eligible, and otherwise leaves
 * the course alone. It does NOT tune the setup toward the band — that is
 * the act's central decision and an operator that always nails it would
 * measure a game nobody is playing. It conditions with whatever crew it
 * has and arrives wherever that puts it.
 */
export function spendTheTournamentMorning(state, { holesOpen }) {
  if (state.tournament && !state.tournament.resolved) return false;
  const next = nextRungFor(state.tournamentsHosted ?? []);
  if (!next) return false;
  const booked = bidFor(state, next, { holesOpen });
  if (!booked) return false;
  state.tournament = booked;
  return true;
}
```

- [ ] **Step 2: Extend LEVERS_NOT_PULLED honestly**

Add to the `LEVERS_NOT_PULLED` array in `tools/operator.js`:

```js
  'Act III: hiring grounds staff FOR a championship. It conditions with '
  + 'whatever crew the course already needed, so nothing here says whether '
  + 'staffing up for a week is worth it.',
  'Act III: aiming at the target band. It bids and lets the setup land '
  + 'where it lands, which is the act\'s central decision left unmade.',
  'Act III: declining a rung it is eligible for. It always bids, so '
  + 'nothing here measures a resort that decides a championship is not '
  + 'worth the closed week.',
```

- [ ] **Step 3: Commit**

```bash
git add tools/operator.js
git commit -m "Teach the operator to bid, and write down what it still cannot do"
```

- [ ] **Step 4: Measure, and report the findings**

Write a throwaway sweep (in the scratch directory, not committed) that carries
eight resorts through Act II into Act III and reports, per rung: how often the
band was hit, what the contract paid against what the closed week cost, and
whether a rung was ever barred.

The four questions from the spec, which the numbers must answer:

1. **Is the contract a real decision?** A tournament run well should be clearly
   worth it and one run badly clearly not. If both win, the bonuses are too easy.
   If both lose, the base is too small.
2. **Does the run-up actually hurt?** If takings barely move while the course
   hardens, the sacrifice is theatre.
3. **Is the band findable?** Setup is a number the player can read, but the field's
   scoring is what tells them whether it was right. Check that a soft course and a
   tricked-up one produce visibly different scoring.
4. **Can a rung be failed and re-attempted without the act stalling?**

Report the numbers before changing any of them. Do not tune to taste in the same
pass as measuring — that is how Act I ended up with a confident, wrong report.

---

## Task 9: A countdown on the HUD

**Files:**
- Modify: `src/ui/hud.js`
- Test: `tests/hud.test.js` (create if absent)

Added at the author's request, and it earns its place in this plan rather than
the next one: without something visible, none of the eight tasks above can be
played. A countdown makes the run-up legible and turns this plan's output from
"tests pass" into "a thing you can sit down with".

Deliberately the only UI in this plan. Everything else — the contract card, the
tournament report, the setup dial's own screen — stays in Plan 2.

- [ ] **Step 1: Write the failing test**

Create (or append to) `tests/hud.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { computeHudData } from '../src/ui/hud.js';

test('the HUD says nothing about tournaments when none is booked', () => {
  const data = computeHudData(newGame(1));
  assert.equal(data.tournament, null);
});

test('the HUD counts down to a booked championship', () => {
  const state = newGame(2);
  state.day = 40;
  state.resort.setup = 70;
  state.tournament = { rung: 'regional', day: 61, resolved: false };

  const data = computeHudData(state);
  assert.ok(data.tournament, 'a booking has to reach the HUD');
  assert.equal(data.tournament.daysLeft, 21);
  assert.equal(data.tournament.label, 'Regional Championship');
  assert.equal(data.tournament.setup, 70);
  // The band is the decision. A countdown that does not show whether the
  // course is set right is a clock, not information. Asserted on both
  // sides, because a readout that always says "fine" is worse than none.
  assert.equal(data.tournament.inBand, true, '70 is inside the regional band of 62-78');

  state.resort.setup = 61;
  assert.equal(computeHudData(state).tournament.inBand, false,
    '61 is one under the band and must not read as ready');
});

test('the countdown says when the championship is today', () => {
  const state = newGame(3);
  state.day = 61;
  state.tournament = { rung: 'countyOpen', day: 61, resolved: false };
  assert.equal(computeHudData(state).tournament.daysLeft, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hud.test.js`
Expected: FAIL — `data.tournament` is `undefined`

- [ ] **Step 3: Write minimal implementation**

In `src/ui/hud.js`, add the import:

```js
import { RUNGS, withinBand } from '../sim/tournaments.js';
```

In `computeHudData`, add to the returned object:

```js
    // Act III. Null when nothing is booked, so the HUD can simply not
    // draw it. `inBand` is included because a countdown that does not say
    // whether the course is set right is a clock rather than information.
    tournament: tournamentReadout(state),
```

And above `computeHudData`, add:

```js
/** What the HUD needs to know about a booked championship, or null. */
function tournamentReadout(state) {
  const booked = state.tournament;
  if (!booked || booked.resolved) return null;
  const rung = RUNGS[booked.rung];
  if (!rung) return null;
  const setup = Math.round(state.resort.setup ?? 0);
  return {
    label: rung.label,
    daysLeft: Math.max(0, booked.day - state.day),
    setup,
    inBand: withinBand(setup, rung.band),
    band: rung.band,
  };
}
```

In `mountHud`, beside the other spans, add:

```js
  const tournament = document.createElement('span');
  tournament.className = 'hud-tournament';
```

Append it to `bar` after the existing children, and in `update(state)` add:

```js
    if (data.tournament) {
      const t = data.tournament;
      const when = t.daysLeft === 0 ? 'today' : `${t.daysLeft}d`;
      // The setup and the band together, because the number alone does
      // not tell the player whether it is the right number.
      tournament.textContent =
        `${t.label} ${when} · setup ${t.setup} (want ${t.band.low}-${t.band.high})`;
      tournament.hidden = false;
      tournament.classList.toggle('hud-tournament--off', !t.inBand);
    } else {
      tournament.hidden = true;
    }
```

And in `injectStyles`, add:

```js
    .hud-tournament { color: ${PALETTE.ACCENT}; }
    .hud-tournament--off { color: ${PALETTE.SAND}; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hud.test.js`
Expected: PASS, 3 tests

Run: `node --test "tests/*.test.js"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hud.js tests/hud.test.js
git commit -m "Count down to the championship on the HUD, with the band it wants"
```


---

## Self-review against the spec

| Spec section | Task |
|---|---|
| §2 How the act opens (18 holes, prestige) | Task 1 — `eligibleFor` |
| §3 The ladder, bidding, 21 days | Tasks 1 and 4 |
| §4 Setup dial, crew-driven, reversible, bands | Tasks 2 and 3 |
| §5 Infrastructure buildings | **Plan 2** — `eligibleFor` already reads `requires`, so the data arrives without a code change |
| §6 The closed week, hotel sells out | Task 5 |
| §6a What the field shoots | Task 6 |
| §6b Weather and callbacks | Partly Task 7 (turf condition carries the cheap-seed and drainage consequences already); the richer callbacks are **Plan 2** |
| §7 The contract, base plus bonuses | Task 7 — `contractFor`, `scoreTournament` |
| §8 Stakes, bars, the gate to Act IV | Task 7 — `barDays`; the Act IV gate itself is Plan 2 |
| §10 What to measure | Task 8 |
| Visible countdown (author's request, not in the spec) | Task 9 |

**Known gaps, deliberately deferred to Plan 2:** the four infrastructure
buildings; `crowdHandled` is hard-coded true until they exist; the contract card
and tournament report; the setup dial's UI; the Act IV gate.

**One thing to watch during Task 3:** raising `courseDifficulty` for setup affects
`crowdMix`, so a heavily conditioned course does not merely annoy locals, it
changes who turns up at all. That is correct and desirable — a championship
course attracts serious golfers — but it means the satisfaction drop measured in
the test is a floor on the effect, not the whole of it.
