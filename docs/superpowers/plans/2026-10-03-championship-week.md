# Championship Week Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Act III's one-day championship into a week of two to four rounds, with a pin call each morning, the field visible on the playback, a per-rung minimum course difficulty, and the winning total landing in a target range as the judge.

**Spec:** `docs/superpowers/specs/2026-10-03-course-tycoon-championship-week-design.md`. Read it first; this plan implements it and does not restate the reasoning.

**Architecture:** Each round is an ordinary `runDay` with the course closed (the existing `championshipToday` path). A new pure module, `src/sim/championshipWeek.js`, owns the week's state — the field's handicaps and running totals, the pins, the round log — so `day.js` only plays a round and hands it over. `playField` gains pins, weather and fixed handicaps, and keeps the shot events it currently throws away so the playback can show the field. The judge moves from the setup band to the winning total in `scoreTournament`.

**Tech Stack:** Plain ES modules, `node --test`, no dependencies. Run the suite with `npm test` (≈ 770 tests, all passing at the start).

---

## Ground rules for every task

- **`src/sim/` is pure.** No DOM, no clock, no `Math.random` — `tests/purity.test.js` greps the source. Randomness comes from the `rng` passed in.
- **Holes live at `state.resort.courses[0].holes`.** Assigning `state.resort.holes` is silently ignored and has wasted two measurements in this project.
- **Comments match the house style:** explain *why*, record measurements with the numbers, and say what was tried and rejected. Read the file you are editing before writing in it.
- **Verify tests by sabotage** (spec §15c of the original design): after a test passes, break the code it guards, see it fail, restore. Every task's test step says what to sabotage.
- **Commit after every task**, staging files by explicit path (never `git add -A`). End each message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Never `git push`, `git fetch` or `git pull`.** The author pushes from GitHub Desktop.

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/sim/hole.js` | modify | `courseDifficultyOf(holes)` — the mean difficulty, one definition |
| `src/sim/tournaments.js` | modify | rungs gain `rounds`, `minDifficulty`, `target`; `withinTarget`; the judge; round-day turf constants |
| `src/sim/championshipWeek.js` | **create** | pins, the week's state shape, recording a round, the winning total, `weekUnderWay` |
| `src/sim/field.js` | modify | pins, weather, fixed handicaps, per-player scores, playback events |
| `src/sim/day.js` | modify | play a round per day, resolve on the last, difficulty check, turf during rounds, field timeline |
| `src/ui/toPar.js` | **create** | `toParText(n)` → `E`, `+3`, `-2` |
| `src/ui/hud.js` | modify | run-up readout gains difficulty; week readout shows round and leader |
| `src/ui/championship.js` | modify | pin picker, target, difficulty, round progress |
| `src/ui/report.js` | modify | round section; tournament section judged on the target |
| `src/ui/championshipCard.js` | modify | result card rewritten around the winning total |
| `src/main.js` | modify | refuse hole edits while the week is under way |
| `src/ui/changes.js`, `version.json` | modify | release notes, build `2026-10-03a` |
| `tools/championshipPolicy.js` | **create** | the reacting pin policy and course narrowing, shared by the operator and the calibration |
| `tools/calibrateWeek.js` | **create** | `simulateWeek` and the calibration table |
| `tools/operator.js` | modify | host multi-round weeks, set pins, toughen the course, record each week |
| `tools/actThree.js` | **create** | checkpointed ladder measurement, hosting vs not bidding |
| tests | modify/create | per task |

---

### Task 1: Rung data and course difficulty

**Files:**
- Modify: `src/sim/hole.js` (add an export near `holeStats`)
- Modify: `src/sim/tournaments.js` (the `LIST` of rungs, `RUNGS` freeze, new `withinTarget`)
- Modify: `src/sim/day.js:259-261` (use the new helper)
- Test: `tests/tournaments.test.js`, `tests/hole.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/hole.test.js` (add `courseDifficultyOf` to its existing import from `../src/sim/hole.js`):

```js
test('course difficulty is the mean of the holes, and zero for no holes', () => {
  const a = makeHole('shortPar3', 1);
  const b = makeHole('doglegPar4', 2);
  const mean = (holeStats(a).difficulty + holeStats(b).difficulty) / 2;
  assert.equal(courseDifficultyOf([a, b]), mean);
  assert.equal(courseDifficultyOf([]), 0, 'an empty course is not NaN');
});

test('narrowing a corridor makes the course harder', () => {
  // The lever the run-up uses: the spec's minimum difficulty is meant to be
  // reachable by redesign, and the cheapest redesign is a tighter fairway.
  const wide = makeHole('straightPar4', 1);
  const narrow = { ...wide, corridorWidth: 26 };
  assert.ok(courseDifficultyOf([narrow]) > courseDifficultyOf([wide]) + 5);
});
```

Append to `tests/tournaments.test.js` (add `withinTarget` to the import line at the top):

```js
test('each rung declares its week: rounds, a difficulty floor and a winning-score target', () => {
  const rounds = { countyOpen: 2, regional: 3, national: 4 };
  for (const id of RUNG_IDS) {
    const rung = RUNGS[id];
    assert.equal(rung.rounds, rounds[id], `${id} plays ${rounds[id]} rounds`);
    assert.ok(rung.minDifficulty > 0 && rung.minDifficulty < 100);
    assert.ok(rung.target.low < rung.target.high, `${id}: a target is a range`);
  }
  assert.ok(RUNGS.regional.minDifficulty > RUNGS.countyOpen.minDifficulty);
  assert.ok(RUNGS.national.minDifficulty > RUNGS.regional.minDifficulty,
    'each rung asks for a harder course than the last');
  assert.ok(RUNGS.national.target.low > RUNGS.countyOpen.target.high,
    'a harder course over more rounds wins with a higher total');
  assert.throws(() => { RUNGS.national.target.low = -99; }, TypeError,
    'the target is frozen like the band');
});

test('the target includes both edges and nothing outside them', () => {
  const target = { low: -4, high: 2 };
  assert.equal(withinTarget(-4, target), true);
  assert.equal(withinTarget(2, target), true);
  assert.equal(withinTarget(-5, target), false);
  assert.equal(withinTarget(3, target), false);
  assert.equal(withinTarget(null, target), false, 'no rounds played is not a winner');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test tests/hole.test.js tests/tournaments.test.js`
Expected: FAIL — `courseDifficultyOf` and `withinTarget` are not exported; `rung.rounds` is undefined.

- [ ] **Step 3: Implement**

In `src/sim/hole.js`, directly after `export function holeStats(...) { ... }`:

```js
/**
 * How hard the course plays, 0-100: the mean of its holes.
 *
 * One definition, because three places need it -- the crowd's appeal in
 * `day.js`, a championship's minimum in `tournaments.js`, and the HUD -- and
 * three copies of an average are three chances to disagree about whether a
 * course qualifies.
 */
export function courseDifficultyOf(holes) {
  if (!holes.length) return 0;
  return holes.reduce((sum, h) => sum + holeStats(h).difficulty, 0) / holes.length;
}
```

In `src/sim/tournaments.js`, add three fields to each rung in `LIST` (keep every existing field):

```js
  // countyOpen
    rounds: 2,
    minDifficulty: 45,
    target: { low: -4, high: 2 },
  // regional
    rounds: 3,
    minDifficulty: 55,
    target: { low: 2, high: 8 },
  // national
    rounds: 4,
    minDifficulty: 65,
    target: { low: 12, high: 18 },
```

Above `const LIST`, a comment block recording where these came from:

```js
/*
 * `rounds`, `minDifficulty` and `target` are the championship week (see
 * docs/superpowers/specs/2026-10-03-course-tycoon-championship-week-design.md).
 *
 * `target` is the winning total to par after the last round. Measured on
 * 2026-10-03 across 24 seeds on a course at each rung's minimum difficulty,
 * the band's midpoint, fair pins: the median winner was -1 at the County
 * Open, +5 at the Regional and +15 at the National, and each range is that
 * centre plus or minus three strokes. Re-measured on the real field in
 * Task 11 of the plan -- if those numbers moved, so did these.
 *
 * `minDifficulty` is the course's own design, `courseDifficultyOf`. The
 * template rotation an untouched resort is built from measures 40.8;
 * narrowing every fairway to 40 yards reaches 45.5, to 34 reaches 54, to 26
 * reaches 64.4. So each rung asks for some redesign and none asks for a
 * rebuild.
 */
```

Change the `RUNGS` freeze so the target is frozen too:

```js
export const RUNGS = Object.freeze(Object.fromEntries(
  LIST.map((r) => [r.id, Object.freeze({
    ...r, band: Object.freeze(r.band), target: Object.freeze(r.target),
  })])
));
```

After `withinBand`:

```js
/** Whether a winning total is one the rung asked for. Null -- nobody has
 * finished a round -- is never a winner. */
export function withinTarget(total, target) {
  if (total === null || total === undefined) return false;
  return total >= target.low && total <= target.high;
}
```

In `src/sim/day.js`, add `courseDifficultyOf` to the `./hole.js` import and replace

```js
  const baseDifficulty = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).difficulty, 0) / holes.length
    : 0;
```

with

```js
  const baseDifficulty = courseDifficultyOf(holes);
```

- [ ] **Step 4: Run the tests and the suite**

Run: `node --test tests/hole.test.js tests/tournaments.test.js` → PASS.
Run: `npm test` → all pass (the `day.js` change is behaviour-preserving).
Sabotage: change `courseDifficultyOf` to divide by `holes.length + 1`; the first hole test fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add src/sim/hole.js src/sim/tournaments.js src/sim/day.js tests/hole.test.js tests/tournaments.test.js
git commit -m "Give each championship rung its rounds, a difficulty floor and a target

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The week module

**Files:**
- Create: `src/sim/championshipWeek.js`
- Test: `tests/championshipWeek.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/championshipWeek.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, newGame } from '../src/sim/state.js';
import { RUNGS } from '../src/sim/tournaments.js';
import {
  PINS, PIN_IDS, pinHandicap, newWeek, normaliseWeek, recordRound,
  winningTotal, weekFinished, weekUnderWay, withPins,
} from '../src/sim/championshipWeek.js';

test('four pin settings, harder in order, fair changing nothing', () => {
  assert.deepEqual(PIN_IDS, ['easy', 'fair', 'tough', 'brutal']);
  assert.equal(pinHandicap('fair'), 0);
  const steps = PIN_IDS.map(pinHandicap);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] > steps[i - 1]);
  assert.equal(pinHandicap('nonsense'), 0, 'an unknown setting plays as fair');
  for (const id of PIN_IDS) assert.ok(PINS[id].label.length > 2);
});

test('the pins span less than the setup dial does', () => {
  // The free-ride rule from the spec: brutal pins on an unconditioned
  // course must not reach a conditioned one. The whole setup dial is worth
  // 26/3 = 8.7 handicap points; the County band starts 45 points up it,
  // which is 3.9. The pins' whole span has to be well under that.
  const span = pinHandicap('brutal') - pinHandicap('easy');
  assert.ok(span < 3.9 * 0.75, `the pins span ${span} handicap points`);
});

test('a new week carries everything the rung decides', () => {
  const week = newWeek('national', 120);
  assert.equal(week.rung, 'national');
  assert.equal(week.day, 120);
  assert.equal(week.resolved, false);
  assert.equal(week.rounds, RUNGS.national.rounds);
  assert.equal(week.roundsPlayed, 0);
  assert.deepEqual(week.roundSettings, { pins: 'fair' });
  assert.equal(week.field, null);
  assert.deepEqual(week.roundLog, []);
});

test('an old-shaped booking is filled in rather than refused', () => {
  // Saves and tests from before the week existed carry { rung, day,
  // resolved } and nothing else.
  const week = normaliseWeek({ rung: 'countyOpen', day: 40, resolved: false });
  assert.equal(week.rounds, 2);
  assert.equal(week.roundSettings.pins, 'fair');
  assert.deepEqual(week.roundLog, []);
  assert.equal(normaliseWeek(null), null);
});

test('recording rounds adds each player\'s score to their own total', () => {
  let week = newWeek('regional', 10);
  const handicaps = [0, 3, 6];
  week = recordRound(week, { handicaps, playerToPar: [2, -1, 5], entry: { pins: 'fair' } });
  week = recordRound(week, { handicaps, playerToPar: [-3, 4, 0], entry: { pins: 'tough' } });
  assert.deepEqual(week.field.totals, [-1, 3, 5]);
  assert.deepEqual(week.field.handicaps, handicaps, 'the same field every round');
  assert.equal(week.roundsPlayed, 2);
  assert.equal(winningTotal(week), -1, 'the lowest total, not the lowest round');
  assert.equal(week.roundLog.length, 2);
  assert.equal(week.roundLog[1].round, 2);
  assert.equal(week.roundLog[1].pins, 'tough');
  assert.equal(week.roundLog[1].leaderToPar, -1);
  assert.equal(weekFinished(week), false, 'a regional is three rounds');
  week = recordRound(week, { handicaps, playerToPar: [0, 0, 0], entry: {} });
  assert.equal(weekFinished(week), true);
});

test('the first round\'s handicaps are kept, whatever later rounds pass in', () => {
  let week = newWeek('countyOpen', 10);
  week = recordRound(week, { handicaps: [1, 2], playerToPar: [0, 0], entry: {} });
  week = recordRound(week, { handicaps: [9, 9], playerToPar: [0, 0], entry: {} });
  assert.deepEqual(week.field.handicaps, [1, 2]);
});

test('no winner before anybody has finished a round', () => {
  assert.equal(winningTotal(newWeek('countyOpen', 1)), null);
});

test('the week is under way from the first round\'s morning until it resolves', () => {
  const state = newGame(1);
  state.day = 50;
  assert.equal(weekUnderWay(state), false, 'nothing booked');
  state.tournament = newWeek('countyOpen', 60);
  assert.equal(weekUnderWay(state), false, 'still the run-up');
  state.day = 60;
  assert.equal(weekUnderWay(state), true, 'the first round is today');
  state.day = 61;
  assert.equal(weekUnderWay(state), true, 'between rounds');
  state.tournament = { ...state.tournament, resolved: true };
  assert.equal(weekUnderWay(state), false);
});

test('setting the pins keeps everything else and refuses nonsense', () => {
  const week = newWeek('national', 5);
  assert.equal(withPins(week, 'brutal').roundSettings.pins, 'brutal');
  assert.equal(withPins(week, 'brutal').rounds, 4);
  assert.equal(withPins(week, 'sideways').roundSettings.pins, 'fair');
  assert.equal(week.roundSettings.pins, 'fair', 'and does not mutate');
});

test('a week survives a save', () => {
  const state = newGame(2);
  let week = newWeek('national', 5);
  week = recordRound(week, { handicaps: [1, 2], playerToPar: [3, -2], entry: { pins: 'tough' } });
  state.tournament = withPins(week, 'easy');
  const revived = deserialize(serialize(state));
  assert.deepEqual(revived.tournament, state.tournament);
});
```

- [ ] **Step 2: Run and see it fail**

Run: `node --test tests/championshipWeek.test.js`
Expected: FAIL — cannot find module `championshipWeek.js`.

- [ ] **Step 3: Implement**

Create `src/sim/championshipWeek.js`:

```js
/**
 * The championship week: what lasts from the first round to the last.
 *
 * A championship used to be a single day: the setup was checked against a
 * band, a cheque arrived, and the playback showed an empty course. The
 * author's verdict was "very anticlimactic". So it is now two, three or
 * four rounds by rung, each one an ordinary closed day in `runDay`, and
 * this file holds what has to carry from one to the next: the same sixty
 * players and their running totals, the pins the player has set for the
 * next round, and a log of how each round went.
 *
 * `day.js` plays a round and hands the result here. Nothing in this file
 * plays golf.
 *
 * Pure. Nothing here computes with a DOM or a clock.
 */
import { RUNGS } from './tournaments.js';

/**
 * Where the holes are cut, the one call the player makes each morning.
 *
 * Handicap points added to the field, on the same scale as the setup dial
 * (`setupDifficultyBonus(setup) / 3`, worth 0-8.7), so pins and setup are
 * one lever at two timescales.
 *
 * Measured 2026-10-03, and the first values were wrong. At -1.5 / 0 / +1.5
 * / +3, brutal pins on a course nobody had conditioned put the County Open
 * winner at -3 against -2 for a course set properly -- the free ride the
 * band gate was built to close, back through a new door. At a third of
 * that (below), an unconditioned course with brutal pins every round hit
 * the County target in 13% of 24 seeds and the Regional and National in
 * none, while a player reacting to the leader each morning still moved the
 * winning total by a stroke or so a round.
 */
export const PINS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', handicap: -0.75,
    blurb: 'Centre of the greens. Birdies, and a crowd that enjoys itself.' }),
  fair: Object.freeze({ id: 'fair', label: 'Fair', handicap: 0,
    blurb: 'Where the governing body would put them if you did not ask.' }),
  tough: Object.freeze({ id: 'tough', label: 'Tough', handicap: 0.75,
    blurb: 'Tucked behind the bunkers. Pars are a good score.' }),
  brutal: Object.freeze({ id: 'brutal', label: 'Brutal', handicap: 1.5,
    blurb: 'On the slopes. Slow, and somebody will complain to a newspaper.' }),
});

export const PIN_IDS = Object.freeze(['easy', 'fair', 'tough', 'brutal']);

/** Handicap points for a pin setting. Unknown plays as fair. */
export function pinHandicap(id) {
  return PINS[id]?.handicap ?? 0;
}

/** A booked championship, before a ball is struck. */
export function newWeek(rungId, day) {
  return {
    rung: rungId,
    day,
    resolved: false,
    rounds: RUNGS[rungId]?.rounds ?? 1,
    roundsPlayed: 0,
    // Tomorrow's calls. A later lever -- green speed, tee placement -- is a
    // new key here rather than a new code path.
    roundSettings: { pins: 'fair' },
    // Drawn on the first round, from that day's rng, then carried.
    field: null,
    roundLog: [],
    // Measured on the first morning: the course the field meets is the one
    // judged against the rung's minimum.
    difficulty: null,
    difficultyMet: null,
  };
}

/**
 * Fills in a booking from before the week existed.
 *
 * Saves and a great many tests carry `{ rung, day, resolved }` and nothing
 * else. Filling them in here, once, beats every reader guarding against a
 * missing field.
 */
export function normaliseWeek(t) {
  if (!t) return t;
  const base = newWeek(t.rung, t.day);
  return {
    ...base,
    ...t,
    roundSettings: { ...base.roundSettings, ...(t.roundSettings ?? {}) },
    roundLog: t.roundLog ?? [],
  };
}

/** The same week with tomorrow's pins changed. Refuses a setting that is
 * not one of the four rather than storing it. */
export function withPins(week, id) {
  if (!PIN_IDS.includes(id)) return week;
  return { ...week, roundSettings: { ...week.roundSettings, pins: id } };
}

/**
 * A round played, added to the week.
 *
 * `playerToPar` is indexed by player, the same order every round, so a
 * total is one player's week rather than whoever happened to be fifth.
 * `entry` is whatever the day wants remembered about the round; the
 * leader's total is added here so it cannot disagree with the totals.
 */
export function recordRound(week, { handicaps, playerToPar, entry = {} }) {
  const totals = week.field?.totals ?? new Array(playerToPar.length).fill(0);
  const nextTotals = totals.map((total, i) => total + (playerToPar[i] ?? 0));
  const roundsPlayed = week.roundsPlayed + 1;
  return {
    ...week,
    roundsPlayed,
    field: {
      handicaps: week.field?.handicaps ?? handicaps,
      totals: nextTotals,
    },
    roundLog: [
      ...week.roundLog,
      { ...entry, round: roundsPlayed, leaderToPar: Math.min(...nextTotals) },
    ],
  };
}

/** The lowest total so far, or null before the first round is in. */
export function winningTotal(week) {
  const totals = week?.field?.totals;
  return totals?.length ? Math.min(...totals) : null;
}

export function weekFinished(week) {
  return week.roundsPlayed >= week.rounds;
}

/**
 * From the first round's morning until the week resolves.
 *
 * What the hole editor asks before it opens: the design the field meets
 * on the first morning is the design it plays all week, and reworking a
 * hole overnight to drag Sunday's scores up is not a lever.
 */
export function weekUnderWay(state) {
  const t = state?.tournament;
  return Boolean(t && !t.resolved && state.day >= t.day);
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/championshipWeek.test.js tests/purity.test.js` → PASS.
Sabotage: in `recordRound`, use `handicaps` instead of `week.field?.handicaps ?? handicaps`; the "first round's handicaps are kept" test fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add src/sim/championshipWeek.js tests/championshipWeek.test.js
git commit -m "Hold a championship week's field, pins and round log in one module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The field takes pins, weather and a fixed field, and keeps its shots

**Files:**
- Modify: `src/sim/field.js`
- Test: `tests/field.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/field.test.js` (extend the import from `../src/sim/field.js` to `playField, FIELD_SIZE, FIELD_GROUPS, drawFieldHandicaps`):

```js
test('pins move the field, by a stroke or two and not by a setup\'s worth', () => {
  const handicaps = drawFieldHandicaps(makeRng(40));
  const play = (pins) => playField(makeRng(41), course(), { setup: 70, turfQuality: 85, pins, handicaps });
  const easy = play('easy').averageToPar;
  const brutal = play('brutal').averageToPar;
  assert.ok(brutal > easy + 1, `brutal ${brutal} against easy ${easy}`);
  assert.ok(brutal < easy + 4, 'pins fine-tune; they are not a second setup dial');
});

test('wind reaches the field', () => {
  // Weather was always computed on a championship day and the field
  // ignored it. Blowing hard is spread 1.45, clear is 0.95 (weather.js).
  const handicaps = drawFieldHandicaps(makeRng(42));
  let calm = 0;
  let windy = 0;
  for (const seed of [1, 2, 3, 4]) {
    calm += playField(makeRng(seed), course(), { setup: 60, handicaps, spread: 0.95 }).averageToPar;
    windy += playField(makeRng(seed), course(), { setup: 60, handicaps, spread: 1.45 }).averageToPar;
  }
  assert.ok(windy > calm + 2, `windy ${windy / 4} against calm ${calm / 4}`);
});

test('wet weather slows the field', () => {
  const a = playField(makeRng(43), course(), { setup: 60, pace: 1 });
  const b = playField(makeRng(43), course(), { setup: 60, pace: 1.16 });
  assert.ok(b.averageRoundMinutes > a.averageRoundMinutes,
    'heavy rain (pace 1.16) must make rounds longer');
});

test('a field passed in is the field that plays', () => {
  const scratch = new Array(FIELD_SIZE).fill(0);
  const hackers = new Array(FIELD_SIZE).fill(6);
  const good = playField(makeRng(44), course(), { setup: 50, handicaps: scratch });
  const poor = playField(makeRng(44), course(), { setup: 50, handicaps: hackers });
  assert.ok(good.averageToPar < poor.averageToPar);
});

test('every player\'s score is returned in field order', () => {
  const round = playField(makeRng(45), course(), { setup: 55 });
  assert.equal(round.playerToPar.length, FIELD_SIZE);
  assert.equal(Math.min(...round.playerToPar), round.best);
  const mean = round.playerToPar.reduce((s, v) => s + v, 0) / FIELD_SIZE;
  assert.equal(Number(mean.toFixed(2)), round.averageToPar);
});

test('the field\'s shots are kept for the playback', () => {
  const holes = course();
  const round = playField(makeRng(46), holes, { setup: 55 });
  assert.equal(round.playback.schedule.rounds.length, FIELD_GROUPS, 'twenty threeballs tee off');
  assert.equal(round.playback.rawEvents.length, FIELD_GROUPS * holes.length);
  assert.equal(round.playback.holeMinutes.length, holes.length);
  assert.ok(round.playback.rawEvents.some((b) => b.events.some((e) => e.type === 'shot')));
});

test('drawing a field gives sixty championship handicaps', () => {
  const field = drawFieldHandicaps(makeRng(47));
  assert.equal(field.length, FIELD_SIZE);
  assert.ok(field.every((h) => Number.isInteger(h) && h >= 0 && h <= 6));
});
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test tests/field.test.js`
Expected: FAIL — `FIELD_GROUPS` and `drawFieldHandicaps` are not exported; `playerToPar` and `playback` are undefined.

- [ ] **Step 3: Implement**

In `src/sim/field.js`:

1. Add the import: `import { pinHandicap } from './championshipWeek.js';`
2. Export the group count: change `const FIELD_GROUPS = FIELD_SIZE / GROUP_SIZE;` to `export const FIELD_GROUPS = FIELD_SIZE / GROUP_SIZE;`
3. After the handicap constants, add:

```js
/**
 * Sixty championship handicaps, drawn once for a week.
 *
 * Drawn per round, the totals at the end of a four-round week would belong
 * to nobody -- player seven on Thursday and player seven on Sunday would be
 * different golfers. Still nameless: an index and a handicap.
 */
export function drawFieldHandicaps(rng) {
  return Array.from({ length: FIELD_SIZE }, () =>
    FIELD_HANDICAP_LOW + rng.int(FIELD_HANDICAP_HIGH - FIELD_HANDICAP_LOW + 1));
}
```

4. Replace the signature and body of `playField` as follows (comments above the existing `handicapAdjust` and the pace block stay; new comments shown):

```js
export function playField(rng, holes, {
  setup = 0, turfQuality = 100, teeInterval = DEFAULT_TEE_INTERVAL,
  pins = 'fair', spread = 1, pace = 1, handicaps = null,
} = {}) {
  const par = holes.reduce((sum, h) => sum + holeStats(h).par, 0);
  // [existing setup comment unchanged]
  //
  // Pins sit on the same scale, added on top: see PINS in
  // championshipWeek.js for why they are a third of what was first tried.
  const handicapAdjust = setupDifficultyBonus(setup) / 3 + pinHandicap(pins);
  // [existing puttAdjust comment and line unchanged]

  // Indexed by player, in field order, so a week can add round to round.
  const playerToPar = new Array(FIELD_SIZE).fill(0);
  const holeStrokes = holes.map(() => 0);
  const holePar = holes.map((h) => holeStats(h).par);
  // [existing holeMinutesTotal comment unchanged]
  const holeMinutesTotal = holes.map(() => 0);
  // Every shot, kept for the playback. This used to be thrown away, which
  // is why a championship played to an empty course on screen.
  const rawEvents = [];

  for (let g = 0; g < FIELD_GROUPS; g++) {
    const groupStrokes = new Array(GROUP_SIZE).fill(0);
    const guests = [];
    for (let i = 0; i < GROUP_SIZE; i++) {
      const id = g * GROUP_SIZE + i;
      // A field passed in is the week's; with none, draw one as before so
      // a single round still works on its own.
      const handicap = handicaps
        ? handicaps[id]
        : FIELD_HANDICAP_LOW + rng.int(FIELD_HANDICAP_HIGH - FIELD_HANDICAP_LOW + 1);
      guests.push({
        id, name: 'competitor', handicap, wallet: 0,
        segment: 'serious', patience: 100, energy: 100,
      });
    }
    const group = { id: g, guests };

    holes.forEach((hole, i) => {
      // `spread` is the day's weather, the same multiplier the resort's
      // own golfers play in. It was always computed on a championship day
      // and the field ignored it.
      const played = playHole(rng, hole, group, {
        carts: false, handicapAdjust, puttAdjust, spread,
      });
      holeMinutesTotal[i] += played.minutes;
      holeStrokes[i] += played.totalStrokes;
      played.scores.forEach((score, idx) => { groupStrokes[idx] += score.strokes; });
      rawEvents.push({ groupIndex: g, holeIndex: i, events: played.events });
    });

    groupStrokes.forEach((strokes, idx) => {
      playerToPar[g * GROUP_SIZE + idx] = strokes - par;
    });
  }

  const toPar = [...playerToPar].sort((a, b) => a - b);
  const average = toPar.reduce((s, v) => s + v, 0) / toPar.length;

  // [hardest-hole block unchanged]

  // [existing congestion comment unchanged]
  //
  // `pace` is the weather's: rain and wind slow a round, and nothing on a
  // championship day used to read it.
  const averageHoleMinutes = holeMinutesTotal.map((total) => (total / FIELD_GROUPS) * pace);
  const schedule = scheduleRounds({
    groupCount: FIELD_GROUPS,
    teeInterval,
    holeMinutes: averageHoleMinutes,
  });
  const slowestRoundMinutes = schedule.rounds.reduce(
    (max, round) => Math.max(max, round.roundMinutes), 0
  );

  return {
    // [every existing field unchanged: players, par, averageToPar, best,
    //  worst, underPar, hardestHole, hardestHoleOverPar,
    //  averageRoundMinutes, slowestRoundMinutes, bottleneckHole]
    playerToPar,
    // For the renderer, and only the renderer. `day.js` strips this before
    // anything is saved: twenty threeballs' shots are thousands of events,
    // and the report history keeps fourteen days.
    playback: { schedule, rawEvents, holeMinutes: averageHoleMinutes },
  };
}
```

- [ ] **Step 4: Run tests and the suite**

Run: `node --test tests/field.test.js` → PASS (including the six existing tests).
Run: `npm test` → all pass. `day.js` destructures nothing new yet, so `report.tournament.field` temporarily carries `playerToPar` and `playback`; Task 4 strips them.
Sabotage: pass `spread: 1` instead of `spread` to `playHole`; "wind reaches the field" fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add src/sim/field.js tests/field.test.js
git commit -m "Let the field play pins and weather, keep its players, and keep its shots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A championship is a week of rounds

The band is still the judge in this task; Task 5 swaps it. Doing the week first keeps every step green.

**Files:**
- Modify: `src/sim/day.js` (imports; the `if (championshipToday)` block at ~697-779; the `return` at ~1039)
- Test: `tests/tournamentDay.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/tournamentDay.test.js`, add imports:

```js
import { RUNGS, RUN_UP_DAYS, TURF_EXPECTED } from '../src/sim/tournaments.js';
import { newWeek, withPins } from '../src/sim/championshipWeek.js';
```

(the first line replaces the existing `tournaments.js` import). Below `openFullCourse`, add the helper every multi-round test uses:

```js
/**
 * Plays a booked championship to the end and returns the final day.
 *
 * A championship used to resolve on the day it was booked for. It is now
 * two to four rounds, so a test that ran one `runDay` and looked for a
 * result would find a round report and no verdict.
 */
function playWeek(state, seed) {
  let out = runDay(state, seed);
  for (let i = 1; i < 10 && out.state.tournament && !out.state.tournament.resolved; i++) {
    out = runDay(out.state, seed + i);
  }
  return out;
}
```

Append these tests:

```js
test('each rung is a week of rounds, closed every day, resolved on the last', () => {
  for (const rungId of ['countyOpen', 'regional', 'national']) {
    let state = openFullCourse(actThreeResort(70));
    state.resort.setup = RUNGS[rungId].band.low + 5;
    state.resort.setupTarget = state.resort.setup;
    state.tournament = newWeek(rungId, state.day);
    const rounds = RUNGS[rungId].rounds;
    for (let r = 1; r <= rounds; r++) {
      const { state: after, report } = runDay(state, 7000 + r);
      assert.equal(report.tournamentDay, true, `${rungId} round ${r}: the course is shut`);
      assert.equal(report.groupsPlayed, 0);
      assert.equal(report.tournamentRound.round, r);
      assert.equal(report.tournamentRound.rounds, rounds);
      if (r < rounds) {
        assert.equal(report.tournament ?? null, null, `${rungId}: no verdict after round ${r}`);
        assert.equal(after.tournament.roundsPlayed, r);
      } else {
        assert.ok(report.tournament, `${rungId}: the verdict arrives with the last round`);
        assert.equal(after.tournament, null);
      }
      state = after;
    }
    assert.equal(runDay(state, 7100).report.tournamentDay, false, 'and then the course reopens');
  }
});

test('the same sixty play every round', () => {
  let state = openFullCourse(actThreeResort(71));
  state.tournament = newWeek('national', state.day);
  state = runDay(state, 7200).state;
  const handicaps = state.tournament.field.handicaps;
  const totalsAfterOne = state.tournament.field.totals;
  state = runDay(state, 7201).state;
  assert.deepEqual(state.tournament.field.handicaps, handicaps);
  assert.notDeepEqual(state.tournament.field.totals, totalsAfterOne, 'and their totals grow');
});

test('the pins set before a round are the pins it is played with', () => {
  let state = openFullCourse(actThreeResort(72));
  state.tournament = newWeek('regional', state.day);
  state = runDay(state, 7300).state;
  state.tournament = withPins(state.tournament, 'brutal');
  const { state: after, report } = runDay(state, 7301);
  assert.equal(report.tournamentRound.pins, 'brutal');
  assert.equal(after.tournament.roundSettings.pins, 'brutal', 'and they stay set');
});

test('each round is played in that day\'s weather and says so', () => {
  const state = openFullCourse(actThreeResort(73));
  state.tournament = newWeek('countyOpen', state.day);
  const { report } = runDay(state, 7400);
  assert.equal(report.tournamentRound.weather, report.weather.key);
});

test('the playback shows the field', () => {
  // A championship used to play to an empty course on screen.
  const state = openFullCourse(actThreeResort(74));
  state.tournament = newWeek('countyOpen', state.day);
  const { timeline } = runDay(state, 7500);
  assert.equal(timeline.filter((e) => e.type === 'teeOff').length, 20);
  assert.ok(timeline.some((e) => e.type === 'shot'));
});

test('nothing the playback needs is saved into the report history', () => {
  const state = openFullCourse(actThreeResort(75));
  state.tournament = newWeek('countyOpen', state.day);
  const { report } = playWeek(state, 7600);
  assert.equal(report.tournament.field.playback, undefined);
  assert.equal(report.tournament.field.playerToPar, undefined);
});

test('a save taken between rounds finishes the week identically', () => {
  let state = openFullCourse(actThreeResort(76));
  state.resort.setup = 86;
  state.resort.setupTarget = 86;
  state.tournament = newWeek('national', state.day);
  state = runDay(state, 7700).state;
  state = runDay(state, 7701).state;

  const straight = runDay(runDay(state, 7702).state, 7703).report.tournament;
  const reloaded = deserialize(serialize(state));
  const resumed = runDay(runDay(reloaded, 7702).state, 7703).report.tournament;
  assert.deepEqual(resumed, straight);
});

test('the week\'s pace is every round, not the last', () => {
  const state = openFullCourse(actThreeResort(77));
  state.tournament = newWeek('regional', state.day);
  const { report } = playWeek(state, 7800);
  const everyRound = report.tournament.week.roundLog.every((r) => r.paceOnTarget);
  assert.equal(report.tournament.met.includes('pace'), everyRound);
});
```

(The `bidFor` assertions on `rounds`, `roundsPlayed` and `pins` were added in Task 2.)

- [ ] **Step 2: Run and see them fail**

Run: `node --test tests/tournamentDay.test.js tests/tournaments.test.js`
Expected: FAIL — `report.tournamentRound` undefined; the county week resolves after one round.

- [ ] **Step 3: Implement**

`bidFor` already returns `newWeek(...)` (done during Task 2's review), so `tournaments.js` needs no change here.

In `src/sim/day.js`:

1. Imports — add:

```js
import { playField, drawFieldHandicaps } from './field.js';
import {
  normaliseWeek, recordRound, winningTotal, weekFinished,
} from './championshipWeek.js';
```

(replace the existing `import { playField } from './field.js';`).

2. Just before `report.tournamentDay = championshipToday;`, declare:

```js
  // The field's shots, for the renderer. Null on every ordinary day.
  let fieldPlayback = null;
```

3. Replace the whole `if (championshipToday) { ... }` block with:

```js
  // Act III. A championship is two to four rounds by rung, each an ordinary
  // closed day. This plays today's round, adds it to the week, and only on
  // the last round judges the contract.
  if (championshipToday) {
    const week = normaliseWeek(next.tournament);
    const rung = RUNGS[week.rung];
    // Drawn once, on the first round, and carried in the week thereafter,
    // so the same sixty play every round and their totals add up.
    const handicaps = week.field?.handicaps ?? drawFieldHandicaps(rng);
    // [keep the existing comment about the flow-shop scheduler here]
    const { playback, playerToPar, ...field } = playField(rng, holes, {
      setup: next.resort.setup ?? 0,
      turfQuality: next.turfQuality,
      teeInterval,
      pins: week.roundSettings.pins,
      spread: sky.spread,
      pace: sky.pace,
      handicaps,
    });
    fieldPlayback = playback;
    // [keep the existing "Pace is the existing flow-shop target" comment]
    const paceOnTarget = field.averageRoundMinutes <= holes.length * TARGET_MINUTES_PER_HOLE;

    const played = recordRound(week, {
      handicaps,
      playerToPar,
      entry: {
        weather: weatherKey,
        pins: week.roundSettings.pins,
        setup: Math.round(next.resort.setup ?? 0),
        averageToPar: field.averageToPar,
        hardestHole: field.hardestHole,
        averageRoundMinutes: field.averageRoundMinutes,
        paceOnTarget,
        turfAfter: Math.round(next.turfQuality),
      },
    });
    // Every round day gets one, the last included, so the evening report
    // can always say how today went before it says how the week went.
    report.tournamentRound = {
      rung: played.rung,
      rounds: played.rounds,
      target: rung.target,
      ...played.roundLog.at(-1),
    };

    if (!weekFinished(played)) {
      next.tournament = played;
    } else {
      const result = scoreTournament(played.rung, {
        setup: next.resort.setup ?? 0,
        turfQuality: next.turfQuality,
        // Officials judge the week, and one slow round is a slow week.
        paceOnTarget: played.roundLog.every((r) => r.paceOnTarget),
        // [keep the existing crowdHandled comment]
        crowdHandled: crowdHandledFor(next.resort.amenities, played.rung),
      });
      // [the existing body from `next.money += result.paid;` through
      //  `next.tournament = null;` unchanged]
      // [the existing comment about recording the conditions]
      report.tournament = {
        ...result,
        field,
        setup: Math.round(next.resort.setup ?? 0),
        band: rung.band,
        turfQuality: Math.round(next.turfQuality),
        week: {
          rounds: played.rounds,
          roundLog: played.roundLog,
          winningTotal: winningTotal(played),
          target: rung.target,
        },
      };
      // [the existing revenue.tournament, revenue.total, report.profit and
      //  actThreePassed code unchanged]
    }
  }
```

4. In the `return` at the end of `runDay`:

```js
    timeline: fieldPlayback
      // The field, on a round day. The same shape the resort's own day
      // produces, so the playback screen needs no second path.
      ? buildTimeline(fieldPlayback.schedule, fieldPlayback.rawEvents, fieldPlayback.holeMinutes)
      : buildTimeline(schedule, rawEvents, pacedHoleMinutes),
```

5. `sky.pace` exists on every condition in `weather.js` and nothing read it until now; no change needed there.

- [ ] **Step 4: Fix the existing tests that assumed one day**

Each of these ran a single `runDay` and expected a verdict. Change `runDay(state, N)` to `playWeek(state, N)` in:

- `'after the championship resolves, lowering the target still lets setup fall'`
- `'the championship resolves, pays, and does not happen twice'` — also change `const second = runDay(state, 3501);` to `runDay(state, 3510)` so it does not collide with the week's seeds.
- `'a botched championship pays close to base, not 58% of the ceiling'`
- `'the crowd bonus is earned by having somewhere to put them'` (inside `hostWith`)
- `'the report records what the week was judged on, not only the verdict'`
- `'hosting a national properly passes Act III'`, `'a botched national does not pass Act III'`, `'a county open never passes Act III, however perfect'`, `'passing Act III is announced once and then stays passed'` (the first `runDay` in each; the second call in the last test becomes `runDay(first.state, 5440)`)

`'the reported profit and the revenue breakdown agree on a championship day'` compares money across the whole week, so play all but the last round first:

```js
  let state = openFullCourse(actThreeResort(61));
  state.prestige = 90;
  state.resort.setup = 53;
  state.resort.setupTarget = 53;
  state.turfQuality = 92;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };
  state = runDay(state, 5599).state;           // round 1 of 2

  const before = state.money;
  const { state: after, report } = runDay(state, 5600);   // round 2, the verdict
```

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: all pass. If a band-based assertion now fails on a specific seed because the week's last day has a different setup from the old single day, read the failure: the setup the field played is `report.tournament.setup`, and the assertion should be about that number. Do not change seeds to make a failing assertion pass without understanding why it failed.
Sabotage: in the `weekFinished` branch, swap the condition (`if (weekFinished(played))`); the first new test fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/sim/day.js tests/tournamentDay.test.js
git commit -m "Play a championship as a week of rounds, with the field on the playback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The winning total is the judge, and the course has a minimum

**Files:**
- Modify: `src/sim/tournaments.js` (`BONUS_SHARES`, `scoreTournament`)
- Modify: `src/sim/day.js` (the championship block; the Act III pass)
- Create: `tools/championshipPolicy.js` (course narrowing, needed by tests here and by Tasks 11–12)
- Test: `tests/tournaments.test.js`, `tests/tournamentDay.test.js`

- [ ] **Step 1: Create the narrowing helper**

Create `tools/championshipPolicy.js`:

```js
/**
 * How a competent host plays the championship week. Shared by the
 * operator (tools/operator.js) and the calibration (tools/calibrateWeek.js)
 * so the two cannot measure different players.
 */
import { courseDifficultyOf } from '../src/sim/hole.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { winningTotal } from '../src/sim/championshipWeek.js';

/** The narrowest fairway the hole editor allows (MIN_CORRIDOR_WIDTH in
 * src/ui/editor.js), and the step it narrows by. */
export const NARROWEST = 22;
const STEP = 2;

/**
 * Narrows fairways, widest first, until the course reaches `minimum`.
 *
 * The cheapest redesign there is: corridor width costs nothing to change
 * in the editor. What it costs is the locals, who want a course at 30.
 * Mutates `holes` the way the editor does. Returns the difficulty reached,
 * which may fall short if every fairway is already at its narrowest.
 */
export function narrowToDifficulty(holes, minimum) {
  const open = holes.filter((h) => h.open);
  while (courseDifficultyOf(open) < minimum) {
    const widest = open
      .filter((h) => h.corridorWidth - STEP >= NARROWEST)
      .sort((a, b) => b.corridorWidth - a.corridorWidth)[0];
    if (!widest) break;
    widest.corridorWidth -= STEP;
  }
  return courseDifficultyOf(open);
}

/** Spread at or above which a day counts as windy or wet for the pins.
 * Blowing hard is 1.45, heavy rain 1.28, storm 1.6 (weather.js). */
const ROUGH_SPREAD = 1.28;

/**
 * Tomorrow's pins, for a host who reads the leader each evening.
 *
 * Projects the leader's total onto the week's length and compares it with
 * the middle of the target. Running low means the field is taking the
 * course apart, so toughen up; running high, ease off. A rough day eases
 * off whatever the leader says, because wind does the pins' job for them
 * and brutal pins in a gale wreck the pace.
 */
export function reactivePins({ week, spread = 1 }) {
  const target = RUNGS[week.rung].target;
  const centre = (target.low + target.high) / 2;
  const rough = spread >= ROUGH_SPREAD;
  if (week.roundsPlayed === 0) return rough ? 'easy' : 'fair';
  const due = (centre * week.roundsPlayed) / week.rounds;
  const gap = winningTotal(week) - due;
  if (gap <= -3) return rough ? 'tough' : 'brutal';
  if (gap <= -1) return rough ? 'fair' : 'tough';
  if (gap >= 2 || rough) return 'easy';
  return 'fair';
}
```

- [ ] **Step 2: Write the failing tests**

In `tests/tournaments.test.js`, replace these five tests, which judge on `setup`: `'a perfect week earns the ceiling and a shambles earns the base'`, `'overcooking the course fails the band as surely as undercooking'`, `'missing the band pays base only, ...'`, `'a good week is never barred'`, `'the band governs the money, the reputation AND the rung'`, `'inside the band, the other three decide how much credit you get'`. Keep their reasoning comments, retargeted. The replacements:

```js
const COUNTY = RUNGS.countyOpen.target;
const NATIONAL = RUNGS.national.target;
const inside = (t) => Math.round((t.low + t.high) / 2);

test('a perfect week earns the ceiling and a shambles earns the base', () => {
  const perfect = scoreTournament('countyOpen', {
    winningTotal: inside(COUNTY), turfQuality: 88, paceOnTarget: true, crowdHandled: true,
  });
  assert.equal(perfect.paid, RUNGS.countyOpen.purseCeiling);
  assert.equal(perfect.met.length, 4);
  assert.ok(perfect.prestige > 0);

  const shambles = scoreTournament('countyOpen', {
    winningTotal: COUNTY.low - 9, turfQuality: 40, paceOnTarget: false, crowdHandled: false,
  });
  assert.equal(shambles.paid, RUNGS.countyOpen.baseFee);
  assert.equal(shambles.met.length, 0);
  assert.ok(shambles.prestige < 0);
  assert.ok(shambles.barDays > 0);
});

test('a winner over the target misses as surely as one under it', () => {
  // Too soft and the field takes the course apart; overcooked and nobody
  // can score. Both are a week that did not test the field properly.
  for (const total of [COUNTY.low - 1, COUNTY.high + 1]) {
    const result = scoreTournament('countyOpen', {
      winningTotal: total, turfQuality: 88, paceOnTarget: true, crowdHandled: true,
    });
    assert.ok(!result.met.includes('target'), `${total} is outside ${COUNTY.low} to ${COUNTY.high}`);
    assert.equal(result.paid, RUNGS.countyOpen.baseFee);
  }
});

test('missing the target pays base only, even when turf, pace and crowd all hit — '
  + 'and hitting it pays them, in the same three conditions', () => {
  const common = { turfQuality: 88, paceOnTarget: true, crowdHandled: true };
  const missed = scoreTournament('countyOpen', { ...common, winningTotal: COUNTY.high + 5 });
  assert.deepEqual([...missed.met].sort(), ['crowd', 'pace', 'turf']);
  assert.equal(missed.paid, RUNGS.countyOpen.baseFee);

  const hit = scoreTournament('countyOpen', { ...common, winningTotal: inside(COUNTY) });
  assert.equal(hit.met.length, 4);
  assert.equal(hit.paid, RUNGS.countyOpen.purseCeiling);
});

test('a course under the rung\'s minimum is a miss whatever the winner shot', () => {
  const common = { winningTotal: inside(NATIONAL), turfQuality: 95, paceOnTarget: true, crowdHandled: true };
  const under = scoreTournament('national', { ...common, difficultyMet: false });
  assert.ok(!under.met.includes('target'));
  assert.equal(under.paid, RUNGS.national.baseFee);
  assert.ok(under.prestige < 0);
  assert.ok(under.barDays > 0);
  assert.equal(under.difficultyMet, false, 'and the verdict says why');

  const met = scoreTournament('national', { ...common, difficultyMet: true });
  assert.ok(met.met.includes('target'));
});

test('a good week is never barred', () => {
  const good = scoreTournament('regional', {
    winningTotal: inside(RUNGS.regional.target), turfQuality: 85, paceOnTarget: true, crowdHandled: true,
  });
  assert.equal(good.barDays, 0);
});

test('the target governs the money, the reputation AND the rung', () => {
  const common = { turfQuality: 95, paceOnTarget: true, crowdHandled: true };
  const delivered = scoreTournament('national', { winningTotal: inside(NATIONAL), ...common });
  const notDelivered = scoreTournament('national', { winningTotal: NATIONAL.low - 12, ...common });
  assert.deepEqual([...notDelivered.met].sort(), ['crowd', 'pace', 'turf']);
  assert.ok(delivered.paid > notDelivered.paid);
  assert.ok(delivered.prestige > 0);
  assert.ok(notDelivered.prestige < 0);
  assert.ok(notDelivered.barDays > 0);
  assert.equal(delivered.barDays, 0);
});

test('inside the target, the other three decide how much credit you get', () => {
  const hit = (extra) => scoreTournament('national', {
    winningTotal: inside(NATIONAL), turfQuality: 95, paceOnTarget: true, crowdHandled: true, ...extra,
  });
  const perfect = hit({});
  const scruffy = hit({ turfQuality: 40, paceOnTarget: false });
  const missed = hit({ winningTotal: NATIONAL.low - 12 });
  assert.ok(perfect.prestige > scruffy.prestige);
  assert.ok(scruffy.prestige >= 0);
  assert.ok(scruffy.prestige > missed.prestige);
  assert.equal(scruffy.barDays, 0);
});

test('the contract names the winning score as its first condition', () => {
  const contract = contractFor('national');
  assert.equal(contract.bonuses[0].id, 'target');
  assert.match(contract.bonuses[0].label, /target/i);
});
```

In `tests/tournamentDay.test.js`, add `import { narrowToDifficulty } from '../tools/championshipPolicy.js';` and `import { courseDifficultyOf } from '../src/sim/hole.js';`, and a fixture:

```js
/** The course narrowed to a rung's minimum, the way a host would. */
function atMinimum(state, rungId) {
  narrowToDifficulty(state.resort.courses[0].holes, RUNGS[rungId].minDifficulty);
  return state;
}
```

Then:

1. In `'a botched championship pays close to base, ...'` change `!result.met.includes('band')` to `!result.met.includes('target')`, with message `` `${rungId}: an unconditioned, untended week must miss the target` ``.
2. In `'the report records what the week was judged on, ...'` replace the band-agreement assertion with:

```js
  assert.equal(t.met.includes('target'),
    t.difficultyMet && t.week.winningTotal >= t.week.target.low && t.week.winningTotal <= t.week.target.high,
    'the verdict and the numbers printed beside it have to agree');
```

3. In `'the crowd bonus is earned by having somewhere to put them'`, delete the line
   `assert.ok(helped.paid > bare.paid, ...)`. Both weeks now play a template course
   under the National's floor, so neither hits the target and both are paid the
   base fee; what the crowd bonus pays when the target IS hit is asserted
   directly on `scoreTournament` in `tests/tournaments.test.js`. Leave a
   one-line comment saying so. The two `met.includes('crowd')` assertions stay.
4. Replace the four Act III gate tests (`'hosting a national properly passes Act III'`,
   `'a botched national does not pass Act III'`, `'a county open never passes Act III, however perfect'`,
   `'passing Act III is announced once and then stays passed'`) with:

```js
test('the act passes exactly when a national hits its target', () => {
  // Asserted as an invariant over seeds rather than on one lucky seed: the
  // winner of sixty is noisy, and a test that picked a seed where the
  // national happened to land would break the first time anybody tuned
  // the field.
  let passed = 0;
  for (const seed of [41, 42, 43, 44, 45, 46]) {
    const state = atMinimum(nationalReady(seed), 'national');
    state.resort.setup = 86;
    state.resort.setupTarget = 86;
    state.tournament = newWeek('national', state.day);
    const { state: after, report } = playWeek(state, 5400 + seed * 10);
    const hit = report.tournament.met.includes('target');
    assert.equal(Boolean(after.actThreePassed), hit, `seed ${seed}`);
    assert.equal(Boolean(report.actThreePassed), hit);
    if (hit) {
      passed += 1;
      // Announced once, then it stays passed without being announced again.
      const next = runDay(after, 5490 + seed);
      assert.equal(next.state.actThreePassed, true, 'it does not come undone');
      assert.equal(next.report.actThreePassed ?? false, false, 'and is not re-announced');
    }
  }
  assert.ok(passed > 0, 'a well-run national has to be passable');
});

test('a botched national never passes Act III', () => {
  for (const seed of [42, 43, 44]) {
    const state = atMinimum(nationalReady(seed), 'national');
    state.resort.setup = 5;
    state.resort.setupTarget = 0;
    state.tournament = newWeek('national', state.day);
    const { state: after } = playWeek(state, 5500 + seed * 10);
    assert.ok(!after.actThreePassed, `seed ${seed}: turning up is not delivering`);
  }
});

test('a county open never passes Act III, however perfect', () => {
  for (const seed of [43, 44, 45]) {
    const state = atMinimum(nationalReady(seed), 'countyOpen');
    state.resort.setup = 52;
    state.resort.setupTarget = 52;
    state.tournament = newWeek('countyOpen', state.day);
    const { state: after } = playWeek(state, 5600 + seed * 10);
    assert.ok(!after.actThreePassed);
  }
});

test('the course is measured against the minimum on the first morning', () => {
  const under = openFullCourse(actThreeResort(80));
  under.tournament = newWeek('countyOpen', under.day);
  const raw = courseDifficultyOf(under.resort.courses[0].holes);
  assert.ok(raw < RUNGS.countyOpen.minDifficulty, 'sanity: the template course is under the County floor');
  const short = playWeek(under, 8000).report.tournament;
  assert.equal(short.difficultyMet, false);
  assert.ok(!short.met.includes('target'), 'under the minimum is a miss whatever the winner shot');
  assert.equal(short.paid, RUNGS.countyOpen.baseFee);

  const enough = atMinimum(openFullCourse(actThreeResort(80)), 'countyOpen');
  enough.tournament = newWeek('countyOpen', enough.day);
  assert.equal(playWeek(enough, 8000).report.tournament.difficultyMet, true);
});

test('a harder course plays harder', () => {
  // Same seed, same setup, same pins: only the design differs.
  const play = (rungId) => {
    const state = rungId ? atMinimum(openFullCourse(actThreeResort(81)), rungId)
      : openFullCourse(actThreeResort(81));
    state.resort.setup = 60;
    state.resort.setupTarget = 60;
    state.tournament = newWeek('countyOpen', state.day);
    return playWeek(state, 8100).report.tournament.week.winningTotal;
  };
  assert.ok(play('national') > play(null) + 2, 'a course narrowed to 65 must score higher than one at 41');
});
```

- [ ] **Step 3: Run and see them fail**

Run: `node --test tests/tournaments.test.js tests/tournamentDay.test.js`
Expected: FAIL — `met` still uses `'band'`; `difficultyMet` undefined.

- [ ] **Step 4: Implement**

In `src/sim/tournaments.js`:

```js
const BONUS_SHARES = Object.freeze([
  { id: 'target', label: 'Winner inside the target', share: 0.40 },
  { id: 'turf', label: 'Turf still standing', share: 0.27 },
  { id: 'pace', label: 'Rounds inside the pace target', share: 0.20 },
  { id: 'crowd', label: 'Crowd handled without complaint', share: 0.13 },
]);
```

Rewrite `scoreTournament`'s signature and the gate (keep the long comments, replacing "band" with "target" where they describe the gate, and add a paragraph):

```js
/*
 * [existing doc comment, retargeted]
 *
 * The gate moved on 2026-10-03 from the setup band to the winning total.
 * The band asked "is the dial in the right place", which the player
 * answered three weeks early and then watched; the target asks "did the
 * week test the field", which the player is steering right up to the last
 * round. The band survives as guidance on the sheet. And a course under
 * the rung's minimum difficulty fails the gate whatever the winner shot:
 * the field cannot be properly tested on a course too easy to be the venue.
 */
export function scoreTournament(rungId, {
  winningTotal = null, difficultyMet = true,
  turfQuality = 0, paceOnTarget = false, crowdHandled = false,
} = {}) {
  const rung = rungFor(rungId);
  if (!rung) return null;
  const contract = contractFor(rungId);

  const met = [];
  if (difficultyMet && withinTarget(winningTotal, rung.target)) met.push('target');
  if (turfQuality >= TURF_EXPECTED) met.push('turf');
  if (paceOnTarget) met.push('pace');
  if (crowdHandled) met.push('crowd');

  const targetMet = met.includes('target');
  const paid = targetMet
    ? contract.bonuses.reduce(
      (sum, b) => sum + (met.includes(b.id) ? b.amount : 0),
      contract.baseFee
    )
    : contract.baseFee;

  const swing = PRESTIGE_SWING[rungId] ?? 6;
  const earned = ['turf', 'pace', 'crowd'].filter((id) => met.includes(id)).length;
  const prestige = targetMet ? Math.round((earned / 3) * swing) : -swing;

  return {
    rung: rungId,
    met,
    missed: contract.bonuses.map((b) => b.id).filter((id) => !met.includes(id)),
    paid,
    prestige,
    difficultyMet,
    barDays: targetMet ? 0 : BAR_DAYS,
  };
}
```

In `src/sim/day.js`, inside the championship block:

1. Add `courseDifficultyOf` is already imported (Task 1). Right after `const rung = RUNGS[week.rung];`:

```js
    // The course the field meets on the first morning is the course judged
    // against the rung's minimum. Measured once: holes are locked for the
    // week (championshipWeek.weekUnderWay), so later rounds cannot differ.
    const measured = week.roundsPlayed === 0
      ? (() => {
          const difficulty = courseDifficultyOf(holes);
          return { ...week, difficulty, difficultyMet: difficulty >= rung.minDifficulty };
        })()
      : week;
```

and pass `measured` instead of `week` to `recordRound`.

2. In the `weekFinished` branch, call:

```js
      const result = scoreTournament(played.rung, {
        winningTotal: winningTotal(played),
        difficultyMet: played.difficultyMet,
        turfQuality: next.turfQuality,
        paceOnTarget: played.roundLog.every((r) => r.paceOnTarget),
        crowdHandled: crowdHandledFor(next.resort.amenities, played.rung),
      });
```

3. Add to `report.tournament`:

```js
        difficulty: Math.round(played.difficulty * 10) / 10,
        minDifficulty: rung.minDifficulty,
        difficultyMet: played.difficultyMet,
```

4. The Act III pass: `result.met.includes('band')` → `result.met.includes('target')`, and in its comment, "Properly is the band" → "Properly is the target".

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: all pass. `tests/championshipCard.test.js` and `tests/report.test.js` build their own report fixtures with `met: ['band', ...]` and still pass; Tasks 9–10 move them. If `'a harder course plays harder'` fails, print both totals before touching the assertion — a course at 65 against 41 should be several strokes apart over two rounds (Task 1's measurement: the winner moves from about −1 to +15 across the three minimums).
Sabotage: drop `difficultyMet &&` from the target check; "a course under the rung's minimum" fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/sim/tournaments.js src/sim/day.js tools/championshipPolicy.js tests/tournaments.test.js tests/tournamentDay.test.js
git commit -m "Judge a championship on the winning score, on a course hard enough to host it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The turf wears during the week

**Files:**
- Modify: `src/sim/tournaments.js` (two constants)
- Modify: `src/sim/day.js` (the wear and care lines, ~626-628)
- Test: `tests/tournamentDay.test.js`

- [ ] **Step 1: Write the failing tests**

```js
/** A national on its first morning, turf at `turf`, `keepers` on the crew. */
function nationalWeekWith(keepers, turf, seed) {
  const state = atMinimum(nationalReady(seed), 'national');
  state.resort.staff = state.resort.staff.filter((m) => m.role !== 'groundskeeper');
  for (let i = 0; i < keepers; i++) state.resort.staff.push({ role: 'groundskeeper' });
  state.resort.setup = 86;
  state.resort.setupTarget = 86;
  state.turfQuality = turf;
  state.tournament = newWeek('national', state.day);
  return state;
}

test('greens that arrive only just good enough die by the last round', () => {
  // The Act III spec's promise: "greens that die by Saturday". The course
  // is shut to the public, so before this the week was the quietest the
  // turf had ever had and could only improve.
  for (const seed of [90, 91, 92]) {
    const t = playWeek(nationalWeekWith(6, TURF_EXPECTED + 2, seed), 9000 + seed).report.tournament;
    assert.ok(t.turfQuality < TURF_EXPECTED,
      `seed ${seed}: six keepers held the turf at ${t.turfQuality} through a national`);
    assert.ok(!t.met.includes('turf'));
  }
});

test('a crew with real margin holds the turf through the week', () => {
  for (const seed of [90, 91, 92]) {
    const t = playWeek(nationalWeekWith(10, TURF_EXPECTED + 2, seed), 9000 + seed).report.tournament;
    assert.ok(t.turfQuality >= TURF_EXPECTED,
      `seed ${seed}: ten keepers let the turf fall to ${t.turfQuality}`);
  }
});
```

- [ ] **Step 2: Run and see the first fail**

Run: `node --test tests/tournamentDay.test.js`
Expected: the six-keeper test FAILS (turf rises on a closed course); the ten-keeper test passes already.

- [ ] **Step 3: Implement**

In `src/sim/tournaments.js`, after `CARE_DIVERTED_WHILE_CONDITIONING`:

```js
/**
 * On a round day the crew are cutting holes, mowing greens twice and
 * raking bunkers behind the field, so less of their time holds the turf.
 * Higher than the run-up's diversion because the run-up is a few hours a
 * day and a round day is all of it.
 */
export const CARE_DIVERTED_DURING_ROUNDS = 0.3;

/**
 * How much harder sixty championship players are on firm, fast greens
 * than the same traffic on a soft course. Field traffic is multiplied by
 * 1 + this x setup / 100.
 *
 * Set by measurement against tests/tournamentDay.test.js: six keepers who
 * arrive at a national with the turf just above TURF_EXPECTED must lose it
 * by the last round, and ten must hold it. [Record the measured final
 * turf for both crews here when Task 6 is done.]
 */
export const FIELD_WEAR_PER_SETUP = 1.5;
```

In `src/sim/day.js`, import both constants from `./tournaments.js` and `FIELD_GROUPS` from `./field.js`, then replace:

```js
  const wearRate = holes.length * 1.4 + groupCount * 0.45;
  const wear = wearRate * (next.turfQuality / 100);
  const care = keepers * 6.8 * (conditioning ? 1 - CARE_DIVERTED_WHILE_CONDITIONING : 1);
```

with

```js
  // A round day: the public are kept off, and sixty players on firm greens
  // take their place. Without this the closed week was the quietest the
  // turf ever had, and "greens that die by Saturday" could not happen.
  const fieldTraffic = championshipToday
    ? FIELD_GROUPS * (1 + FIELD_WEAR_PER_SETUP * (next.resort.setup ?? 0) / 100)
    : 0;
  const wearRate = holes.length * 1.4 + (groupCount + fieldTraffic) * 0.45;
  const wear = wearRate * (next.turfQuality / 100);
  const diverted = championshipToday ? CARE_DIVERTED_DURING_ROUNDS
    : conditioning ? CARE_DIVERTED_WHILE_CONDITIONING
      : 0;
  const care = keepers * 6.8 * (1 - diverted);
```

and extend the doc comment above it with one sentence pointing at the two new constants.

- [ ] **Step 4: Run, then calibrate if needed**

Run: `node --test tests/tournamentDay.test.js`
- Both pass → record the final turf for each crew and seed in the `FIELD_WEAR_PER_SETUP` comment (print them with a temporary `console.log` in the test, then remove it).
- Six keepers still hold → raise `FIELD_WEAR_PER_SETUP` by 0.5 and re-run.
- Ten keepers fail → lower it by 0.25.
- If no value satisfies both, stop and report the numbers to the controller; do not change the crews in the tests.

Then `npm test` — the run-up turf tests (`'a realistic crew still holds turf ... through a full run-up'`) must still pass; they never reach a round day.
Sabotage: set `fieldTraffic` to 0; the six-keeper test fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tournaments.js src/sim/day.js tests/tournamentDay.test.js
git commit -m "Wear the turf during a championship so a thin crew loses its greens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The course is locked during the week

**Files:**
- Modify: `src/main.js` (`onHoleTap`)

`weekUnderWay` is tested in Task 2. This is DOM wiring, which the project does not unit-test.

- [ ] **Step 1: Implement**

Add `import { weekUnderWay } from './sim/championshipWeek.js';` to `src/main.js`, and at the top of `onHoleTap`:

```js
function onHoleTap(holeId) {
  // The design the field meets on the first morning is the design it
  // plays all week. Building a hole counts too: a new hole is a redesign.
  if (weekUnderWay(state)) {
    sheets.open({
      id: 'course-locked',
      title: 'The course is set',
      render(body) {
        const note = document.createElement('p');
        note.textContent = 'The field is on the course. Nothing is redesigned until the championship '
          + 'is over — what they met on the first morning is what they play all week.';
        body.appendChild(note);
      },
    });
    return;
  }
  // [existing body unchanged]
```

- [ ] **Step 2: Run the suite**

Run: `npm test` → PASS (nothing here is unit-tested; this confirms nothing else broke). The lock is checked in the browser by the controller at the end of the plan, on a real Act III save, rather than by hand-editing a save here.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "Lock the course while a championship is being played

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The HUD and the championship sheet

**Files:**
- Create: `src/ui/toPar.js`
- Modify: `src/ui/hud.js` (`tournamentReadout`, its render at ~252)
- Modify: `src/ui/championship.js` (`computeChampionshipData`, `dialSection`, `applySection`, new `weekSection`, the mount)
- Test: `tests/hud.test.js`, `tests/championship.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/toPar.js` first (it is too small to TDD separately; its test is below):

```js
/** A score to par as a golfer says it: E, +3, -2. A dash before anybody
 * has a score. */
export function toParText(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : String(n);
}
```

Append to `tests/hud.test.js` (add imports: `makeHole` from `../src/sim/hole.js`, `TEMPLATE_NAMES` from `../src/sim/templates.js`, `newWeek, recordRound` from `../src/sim/championshipWeek.js`, `RUNGS` from `../src/sim/tournaments.js`, `toParText` from `../src/ui/toPar.js`):

```js
function eighteen(state) {
  state.resort.courses[0].holes = state.resort.courses[0].holes.map((h, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  return state;
}

test('a score to par reads like golf', () => {
  assert.equal(toParText(0), 'E');
  assert.equal(toParText(3), '+3');
  assert.equal(toParText(-2), '-2');
  assert.equal(toParText(null), '—');
});

test('the run-up readout says whether the course is hard enough', () => {
  const state = eighteen(newGame(5));
  state.day = 40;
  state.tournament = newWeek('national', 61);
  const t = computeHudData(state).tournament;
  assert.equal(t.inWeek, false);
  assert.equal(t.minDifficulty, RUNGS.national.minDifficulty);
  assert.ok(t.difficulty < t.minDifficulty, 'the template course is under the national floor');
  assert.equal(t.difficultyMet, false);
});

test('during the week the readout is the round and the leader', () => {
  const state = eighteen(newGame(6));
  state.day = 61;
  let week = newWeek('regional', 61);
  week = recordRound(week, { handicaps: [0, 0], playerToPar: [1, -2], entry: {} });
  state.tournament = week;
  state.day = 62;
  const t = computeHudData(state).tournament;
  assert.equal(t.inWeek, true);
  assert.equal(t.round, 2);
  assert.equal(t.rounds, 3);
  assert.equal(t.leaderToPar, -2);
  assert.deepEqual(t.target, RUNGS.regional.target);
});
```

Append to `tests/championship.test.js` (add imports for `newWeek, recordRound` and `PIN_IDS` from `../src/sim/championshipWeek.js`):

```js
test('the apply section quotes the week: rounds, target and difficulty floor', () => {
  const data = computeChampionshipData(championshipResort(1));
  assert.equal(data.next.rounds, RUNGS.countyOpen.rounds);
  assert.deepEqual(data.next.target, RUNGS.countyOpen.target);
  assert.equal(data.next.minDifficulty, RUNGS.countyOpen.minDifficulty);
  assert.ok(typeof data.difficulty === 'number');
});

test('a booked week shows the difficulty against the floor all through the run-up', () => {
  const state = championshipResort(2);
  state.tournament = newWeek('countyOpen', state.day + 10);
  const b = computeChampionshipData(state).booked;
  assert.equal(b.inWeek, false);
  assert.equal(b.minDifficulty, RUNGS.countyOpen.minDifficulty);
  assert.equal(typeof b.difficultyMet, 'boolean');
});

test('during the week the sheet has the pins, the leader and today\'s weather', () => {
  const state = championshipResort(3);
  let week = newWeek('national', state.day);
  week = recordRound(week, { handicaps: [0], playerToPar: [4], entry: { pins: 'fair' } });
  state.tournament = week;
  const b = computeChampionshipData(state).booked;
  assert.equal(b.inWeek, true);
  assert.equal(b.roundsPlayed, 1);
  assert.equal(b.rounds, 4);
  assert.equal(b.leaderToPar, 4);
  assert.equal(b.pins, 'fair');
  assert.deepEqual(b.pinChoices.map((p) => p.id), [...PIN_IDS]);
  assert.ok(b.weather.label.length > 2, 'the pins are set against the day they will be played in');
});
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test tests/hud.test.js tests/championship.test.js` → FAIL on the new fields.

- [ ] **Step 3: Implement the data**

`src/ui/hud.js` — imports: add `courseDifficultyOf` to the `../sim/hole.js` import (add the import if `hole.js` is not imported), `normaliseWeek, weekUnderWay, winningTotal` from `../sim/championshipWeek.js`, `toParText` from `./toPar.js`. Replace `tournamentReadout`:

```js
function tournamentReadout(state) {
  const booked = state.tournament;
  if (!booked || booked.resolved) return null;
  const rung = RUNGS[booked.rung];
  if (!rung) return null;
  const week = normaliseWeek(booked);
  const setup = Math.round(state.resort.setup ?? 0);
  const rawDifficulty = courseDifficultyOf(openHoles(state));
  return {
    label: rung.label,
    daysLeft: Math.max(0, booked.day - state.day),
    setup,
    inBand: withinBand(setup, rung.band),
    band: rung.band,
    // Floored, not rounded: 64.6 against a floor of 65 must not print as
    // "65" beside a warning colour.
    difficulty: Math.floor(rawDifficulty),
    minDifficulty: rung.minDifficulty,
    difficultyMet: rawDifficulty >= rung.minDifficulty,
    inWeek: weekUnderWay(state),
    round: week.roundsPlayed + 1,
    rounds: week.rounds,
    leaderToPar: winningTotal(week),
    target: rung.target,
  };
}
```

and its render:

```js
    if (data.tournament) {
      const t = data.tournament;
      if (t.inWeek) {
        tournament.textContent = `${t.label} · Round ${t.round} of ${t.rounds} · `
          + `leads ${toParText(t.leaderToPar)} (target ${toParText(t.target.low)} to ${toParText(t.target.high)})`;
        tournament.classList.remove('hud-tournament--off');
      } else {
        const when = t.daysLeft === 0 ? 'today' : `${t.daysLeft}d`;
        tournament.textContent = `${t.label} ${when} · setup ${t.setup} (want ${t.band.low}-${t.band.high})`
          + ` · course ${t.difficulty}/${t.minDifficulty}`;
        tournament.classList.toggle('hud-tournament--off', !t.inBand || !t.difficultyMet);
      }
      tournament.hidden = false;
    }
```

`src/ui/championship.js` — imports: `courseDifficultyOf` from `../sim/hole.js`; `normaliseWeek, weekUnderWay, winningTotal, withPins, PINS, PIN_IDS` from `../sim/championshipWeek.js`; `weatherOn, effectsOf` from `../sim/weather.js`; `toParText` from `./toPar.js`. In `computeChampionshipData`, compute once near the top:

```js
  const rawDifficulty = courseDifficultyOf(openHoles(state));
  const week = booked ? normaliseWeek(booked) : null;
```

add to the returned object `difficulty: Math.floor(rawDifficulty),`; to `next`:

```js
          rounds: RUNGS[nextId].rounds,
          target: RUNGS[nextId].target,
          minDifficulty: RUNGS[nextId].minDifficulty,
```

and to `booked`:

```js
          rounds: week.rounds,
          roundsPlayed: week.roundsPlayed,
          target: RUNGS[booked.rung].target,
          minDifficulty: RUNGS[booked.rung].minDifficulty,
          difficultyMet: rawDifficulty >= RUNGS[booked.rung].minDifficulty,
          inWeek: weekUnderWay(state),
          leaderToPar: winningTotal(week),
          roundLog: week.roundLog,
          pins: week.roundSettings.pins,
          pinChoices: PIN_IDS.map((id) => PINS[id]),
          // Today's, because the pins are set in the morning for the round
          // about to be played -- and the forecast is the weather, read
          // early (weather.js), so this cannot disagree with the day.
          weather: effectsOf(weatherOn(state.weatherSeed ?? 1, state.day)),
```

- [ ] **Step 4: Implement the sheet**

Add `weekSection`:

```js
/**
 * The morning call. Only while the week is under way: the pins are the
 * one decision a round asks for, set against the leader and the weather.
 */
function weekSection(data, state, commit) {
  const wrap = document.createElement('div');
  wrap.className = 'champ-row';
  const b = data.booked;
  wrap.appendChild(heading(`${b.label} · Round ${b.roundsPlayed + 1} of ${b.rounds}`));
  wrap.appendChild(line('Leader', toParText(b.leaderToPar)));
  wrap.appendChild(line('Target', `${toParText(b.target.low)} to ${toParText(b.target.high)}`));
  wrap.appendChild(line('Today', `${b.weather.label}`));

  const pins = document.createElement('div');
  pins.className = 'champ-dial';
  for (const choice of b.pinChoices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'champ-step';
    button.textContent = choice.label;
    button.setAttribute('aria-pressed', String(choice.id === b.pins));
    if (choice.id === b.pins) button.classList.add('champ-ok');
    button.addEventListener('click', () => {
      const next = structuredClone(state);
      next.tournament = withPins(normaliseWeek(next.tournament), choice.id);
      commit(next);
    });
    pins.appendChild(button);
  }
  wrap.appendChild(pins);

  const note = document.createElement('div');
  note.className = 'champ-detail';
  note.textContent = PINS[b.pins].blurb;
  wrap.appendChild(note);
  return wrap;
}
```

In `dialSection`, after the `'They want'` line add:

```js
  wrap.appendChild(line('Course difficulty', `${data.difficulty} (at least ${b.minDifficulty})`,
    b.difficultyMet ? 'champ-ok' : 'champ-off'));
```

and change the label `'They want'` to `'Setup they suggest'` (the band is guidance now).

In `applySection`, after the `'Course wanted at'` line:

```js
  wrap.appendChild(line('Rounds', String(n.rounds)));
  wrap.appendChild(line('Winning score wanted', `${toParText(n.target.low)} to ${toParText(n.target.high)}`));
  wrap.appendChild(line('Course difficulty', `${data.difficulty} (at least ${n.minDifficulty})`,
    data.difficulty >= n.minDifficulty ? 'champ-ok' : 'champ-off'));
```

and replace the `gate.textContent` with:

```js
  gate.textContent = 'Judged on the winning score: it has to land in the range above. Miss it, or turn up '
    + 'on the first morning with the course easier than they asked for, and the week pays the base fee '
    + 'alone. You can redesign during the run-up; the course is locked once the first round starts.';
```

In `mountChampionshipSheet`'s `rerender`, change the first branch to:

```js
        if (data.booked?.inWeek) {
          body.appendChild(weekSection(data, current, commit));
          body.appendChild(dialSection(data, current, commit));
        } else if (data.booked) body.appendChild(dialSection(data, current, commit));
        else if (data.next) body.appendChild(applySection(data, current, commit));
```

- [ ] **Step 5: Run tests, check the sheet in the browser**

Run: `npm test` → PASS.
Start the dev server (`preview_start`), open the Championship sheet on a game in Act III if one is available, and screenshot the apply section. If no Act III save exists, say so in the report rather than fabricating one.
Sabotage: make `difficultyMet` in `tournamentReadout` always `true`; the run-up readout test fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/ui/toPar.js src/ui/hud.js src/ui/championship.js tests/hud.test.js tests/championship.test.js
git commit -m "Show the round, the leader and the pins, and the course against its floor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The evening report

**Files:**
- Modify: `src/ui/report.js` (`tournamentSection`, new `roundSection`, `computeReportData`, the render block at ~964)
- Test: `tests/report.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/report.test.js`, update the two fixtures from the earlier tests: `met: ['band', 'turf']` → `met: ['target', 'turf']`, `missed: ['band']` → `missed: ['target']`, and add to each fixture `week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [] }, difficulty: 47, minDifficulty: 45, difficultyMet: true`. In the second test, change its comment's "Band gates the rest" to "The target gates the rest" and its message to `'and it paid nothing, because the target was missed'`.

Append:

```js
test('a round day carries a round section, read off the round log', () => {
  const { state, report } = runDay(newGame(74), 74);
  report.tournamentRound = {
    rung: 'national', rounds: 4, round: 2, target: { low: 12, high: 18 },
    weather: 'blowy', pins: 'tough', leaderToPar: 7, averageToPar: 6.2,
    hardestHole: 7, averageRoundMinutes: 281, paceOnTarget: true, turfAfter: 83,
  };
  const r = computeReportData(state, report).tournamentRound;
  assert.equal(r.label, 'National Open');
  assert.equal(r.round, 2);
  assert.equal(r.rounds, 4);
  assert.equal(r.leaderText, '+7');
  assert.equal(r.weatherLabel, 'Blowing hard');
  assert.equal(r.pinsLabel, 'Tough');
  assert.equal(r.tracking, 'on', 'leading +7 after two of four projects to +14, inside 12 to 18');
});

test('tracking says which way the winner is heading', () => {
  const { state, report } = runDay(newGame(75), 75);
  const base = {
    rung: 'national', rounds: 4, round: 2, target: { low: 12, high: 18 },
    weather: 'fair', pins: 'fair', averageToPar: 5, hardestHole: 3,
    averageRoundMinutes: 270, paceOnTarget: true, turfAfter: 85,
  };
  report.tournamentRound = { ...base, leaderToPar: -2 };
  assert.equal(computeReportData(state, report).tournamentRound.tracking, 'under');
  report.tournamentRound = { ...base, leaderToPar: 14 };
  assert.equal(computeReportData(state, report).tournamentRound.tracking, 'over');
});

test('an ordinary day has no round section', () => {
  const { state, report } = runDay(newGame(76), 76);
  assert.equal(computeReportData(state, report).tournamentRound, null);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test tests/report.test.js` → FAIL (`tournamentRound` undefined; `conditions[0].paid` uses `band`).

- [ ] **Step 3: Implement**

In `src/ui/report.js`, import `PINS` from `../sim/championshipWeek.js`, `effectsOf` from `../sim/weather.js` (if not already imported), and `toParText` from `./toPar.js`. Add:

```js
/**
 * Where the winner is heading: the leader's total projected over the
 * week's length against the target. "on", "under" or "over" -- the read
 * the next morning's pins are set from.
 */
function trackingFor(leader, round, rounds, target) {
  const projected = (leader * rounds) / round;
  if (projected < target.low) return 'under';
  if (projected > target.high) return 'over';
  return 'on';
}

function roundSection(report) {
  const r = report?.tournamentRound;
  if (!r) return null;
  return {
    label: RUNGS[r.rung]?.label ?? r.rung,
    round: r.round,
    rounds: r.rounds,
    target: r.target,
    leaderText: toParText(r.leaderToPar),
    averageToPar: r.averageToPar,
    hardestHole: r.hardestHole,
    averageRoundMinutes: r.averageRoundMinutes,
    paceOnTarget: r.paceOnTarget,
    turfAfter: r.turfAfter,
    weatherLabel: effectsOf(r.weather).label,
    pinsLabel: PINS[r.pins]?.label ?? 'Fair',
    tracking: trackingFor(r.leaderToPar, r.round, r.rounds, r.target),
    final: r.round >= r.rounds,
  };
}
```

In `tournamentSection`, replace `bandMet` with `targetMet = (t.met ?? []).includes('target')`, return `targetMet`, `winningTotal: t.week?.winningTotal ?? null`, `target: t.week?.target ?? null`, `difficulty: t.difficulty`, `minDifficulty: t.minDifficulty`, `difficultyMet: t.difficultyMet !== false`, and use `targetMet` for each condition's `paid`. Keep `setup` and `band` (they are still shown as guidance). Add `tournamentRound: roundSection(report),` to `computeReportData`'s return beside `tournament`.

In the render, before `if (data.tournament)`:

```js
  // --- Today's round, on every round day --------------------------------
  if (data.tournamentRound) {
    const r = data.tournamentRound;
    const round = document.createElement('div');
    round.className = 'report-champ';
    const head = document.createElement('div');
    head.className = 'report-champ-head';
    head.textContent = `${r.label} · Round ${r.round} of ${r.rounds}`;
    round.appendChild(head);

    const story = document.createElement('div');
    story.className = 'report-champ-field';
    const heading = r.final ? ''
      : r.tracking === 'under' ? ' The field is taking it apart: the winner is heading under the target.'
        : r.tracking === 'over' ? ' Nobody can score: the winner is heading over the target.'
          : ' On course for the target.';
    story.textContent = `${r.weatherLabel}, ${r.pinsLabel.toLowerCase()} pins. `
      + `The leader is ${r.leaderText}; the target is ${toParText(r.target.low)} to ${toParText(r.target.high)}.`
      + `${heading} The field averaged ${r.averageToPar.toFixed(1)} over and the ${ordinal(r.hardestHole)} `
      + `played hardest. Rounds took ${Math.round(r.averageRoundMinutes)} minutes`
      + `${r.paceOnTarget ? '' : ', which is over the pace target'}; the turf is at ${r.turfAfter}.`;
    round.appendChild(story);
    screen.appendChild(round);
  }
```

In the tournament block, replace the `setup` line's text with the judge:

```js
    setup.className = `report-champ-setup ${t.targetMet ? 'report-champ-ok' : 'report-champ-off'}`;
    setup.textContent = !t.difficultyMet
      ? `The course measured ${Math.floor(t.difficulty)} on the first morning. They asked for at least ${t.minDifficulty}.`
      : t.targetMet
        ? `Won at ${toParText(t.winningTotal)}, inside the ${toParText(t.target.low)} to ${toParText(t.target.high)} they wanted.`
        : `Won at ${toParText(t.winningTotal)}. They wanted ${toParText(t.target.low)} to ${toParText(t.target.high)}.`;
```

Change the comment `"Earned and paid are different things -- the band gates the rest --"` to name the target, and `t.bandMet ? 'The contract paid' : 'Base fee only'` to use `t.targetMet`.

- [ ] **Step 4: Run tests; check the report in the browser**

Run: `npm test` → PASS.
In the dev server, if an Act III save is available, play a round day and screenshot the evening report; otherwise say it was not available.
Sabotage: invert `trackingFor`'s `'under'`/`'over'`; the tracking test fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add src/ui/report.js tests/report.test.js
git commit -m "Report each round of a championship and judge the week on its winner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The result card

**Files:**
- Modify: `src/ui/championshipCard.js` (the `// --- The week` block)
- Test: `tests/championshipCard.test.js`

- [ ] **Step 1: Update and add tests**

In every fixture in `tests/championshipCard.test.js`: `'band'` → `'target'` in `met`/`missed`, and add `week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [{ round: 1, leaderToPar: -2, pins: 'fair', weather: 'fair' }, { round: 2, leaderToPar: -1, pins: 'tough', weather: 'breezy' }] }, difficulty: 47, minDifficulty: 45, difficultyMet: true`. Rename `'a missed band says the other conditions were earned but not paid'` to `'a missed target says ...'`; its fixture's `week.winningTotal` becomes `-9`. In `'the result names every condition, met or missed'`, loop over `['target', 'turf', 'pace', 'crowd']`.

Append:

```js
test('the write-up is about the winning score, round by round', () => {
  const report = {
    day: 95,
    tournament: {
      rung: 'regional', met: ['target', 'turf', 'pace', 'crowd'], missed: [],
      paid: 240000, prestige: 11, barDays: 0, setup: 70,
      band: RUNGS.regional.band, turfQuality: 86, difficulty: 57, minDifficulty: 55, difficultyMet: true,
      field: { averageToPar: 6, underPar: 1, best: -1, hardestHole: 12, averageRoundMinutes: 270 },
      week: {
        rounds: 3, winningTotal: 5, target: { low: 2, high: 8 },
        roundLog: [
          { round: 1, leaderToPar: -1, pins: 'fair', weather: 'clear' },
          { round: 2, leaderToPar: 1, pins: 'tough', weather: 'fair' },
          { round: 3, leaderToPar: 5, pins: 'brutal', weather: 'blowy' },
        ],
      },
    },
  };
  const card = championshipCards(report, { act: 3 })[0];
  assert.match(card.prompt, /\+5/, 'the winning score is in the words');
  assert.match(card.prompt, /\+2 to \+8/, 'and what was wanted');
  assert.doesNotMatch(card.prompt, /competitor|player [0-9]/i, 'and nobody is named');
});

test('a course under the floor is told as that, not as a scoring miss', () => {
  const report = {
    day: 96,
    tournament: {
      rung: 'national', met: ['turf'], missed: ['target', 'pace', 'crowd'],
      paid: 55000, prestige: -18, barDays: 120, setup: 86,
      band: RUNGS.national.band, turfQuality: 90, difficulty: 61.4, minDifficulty: 65, difficultyMet: false,
      field: { averageToPar: 8, underPar: 0, best: 2, hardestHole: 4, averageRoundMinutes: 290 },
      week: { rounds: 4, winningTotal: 14, target: { low: 12, high: 18 }, roundLog: [] },
    },
  };
  const card = championshipCards(report, { act: 3 })[0];
  assert.match(card.prompt, /61/);
  assert.match(card.prompt, /65/);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test tests/championshipCard.test.js` → FAIL.

- [ ] **Step 3: Implement**

In `championshipCard.js`, import `toParText` from `./toPar.js`. In the week block: `bandMet` → `targetMet = (t.met ?? []).includes('target')`, used for each condition's `paid`, the `kicker`, and the button label. Replace `opening` with:

```js
    const w = t.week ?? {};
    const range = w.target
      ? `${toParText(w.target.low)} to ${toParText(w.target.high)}`
      : '';
    const opening = t.difficultyMet === false
      ? `The course measured ${Math.floor(t.difficulty)} on the first morning, and they had asked `
        + `for at least ${t.minDifficulty}. A venue that easy has not staged a championship, whatever `
        + 'the field shot — the week pays the base fee and nothing on top of it.'
      : targetMet
        ? `The winner finished ${toParText(w.winningTotal)}, inside the ${range} they wanted.`
        : `The winner finished ${toParText(w.winningTotal)}. They wanted ${range}, and a week that `
          + 'misses it has not tested the field — the base fee, and nothing on top of it.';
```

Add a one-sentence story of the week from the round log, placed after `opening`:

```js
/**
 * The week in a sentence: where the leader stood after the first round
 * and how it moved. Not a table -- the evening reports had the detail.
 */
function weekStory(week) {
  const log = week?.roundLog ?? [];
  if (log.length < 2) return '';
  const first = log[0];
  const last = log.at(-1);
  const moved = last.leaderToPar - first.leaderToPar;
  const toughened = log.slice(1).some((r) => r.pins === 'tough' || r.pins === 'brutal');
  const eased = log.slice(1).some((r) => r.pins === 'easy');
  const steer = toughened && !eased ? ' The pins went in harder as the week went on.'
    : eased && !toughened ? ' The pins came out easier as the week went on.'
      : '';
  return `The leader was ${toParText(first.leaderToPar)} after the first round and `
    + `${moved >= 0 ? 'gave back' : 'found'} ${Math.abs(moved)} by the end.${steer}`;
}
```

and build the prompt as `` `${opening} ${weekStory(t.week)} ${fieldStory(t.field)} ${money}${withheld}${standing}` ``. Update the header comment's "the week, named condition by named condition" to mention the winning score, and the `standing` comment's "band" to "target".

- [ ] **Step 4: Run tests**

Run: `npm test` → PASS.
Sabotage: make `opening` ignore `difficultyMet`; the floor test fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add src/ui/championshipCard.js tests/championshipCard.test.js
git commit -m "Write up a championship around its winning score and how the week got there

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Calibrate on the real field, and prove the judge

**Files:**
- Create: `tools/calibrateWeek.js`
- Create: `tests/championshipCalibration.test.js`
- Modify: `src/sim/tournaments.js` (targets, only if the measurement says so)

- [ ] **Step 1: Write the calibration tool**

Create `tools/calibrateWeek.js`:

```js
/**
 * Where a championship's winning score lands, and how often each way of
 * playing the week hits the target.
 *
 * The spec's criteria (§8, "Target ranges"):
 *
 *   band midpoint, reacting to the leader   >= 80%
 *   band midpoint, fair pins all week        >= 60%
 *   setup 0, brutal pins all week            <= 15%
 *   setup 100, easy pins -- County, Regional <= 25%
 *
 * Plays the week through `playField` and `recordRound` directly rather
 * than through `runDay`: the field is the whole question, and a resort
 * around it would only add noise and minutes. Weather is the real
 * weather for each day, so wind and rain are in the numbers.
 *
 * Short-running (well under a minute), so no checkpointing.
 *
 *   node tools/calibrateWeek.js
 */
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { RUNG_IDS, RUNGS, withinTarget } from '../src/sim/tournaments.js';
import { playField, drawFieldHandicaps } from '../src/sim/field.js';
import { weatherOn, effectsOf } from '../src/sim/weather.js';
import { newWeek, recordRound, winningTotal, withPins } from '../src/sim/championshipWeek.js';
import { pathToFileURL } from 'node:url';
import { narrowToDifficulty, reactivePins } from './championshipPolicy.js';

export const SEEDS = Array.from({ length: 24 }, (_, i) => (i + 1) * 101);

/** The template rotation an untouched resort is built from, narrowed to a
 * rung's minimum the way a host would. */
export function courseFor(rungId) {
  const holes = Array.from({ length: 18 }, (_, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  narrowToDifficulty(holes, RUNGS[rungId].minDifficulty);
  return holes;
}

export const POLICIES = {
  reacting: reactivePins,
  fair: () => 'fair',
  brutal: () => 'brutal',
  easy: () => 'easy',
};

/** One week, start to finish. Returns the winning total. */
export function simulateWeek(holes, {
  rungId, setup, policy, seed, turfQuality = 90, teeInterval = 14,
}) {
  const rng = makeRng(seed);
  const handicaps = drawFieldHandicaps(rng);
  let week = newWeek(rungId, 100);
  for (let r = 0; r < week.rounds; r++) {
    const sky = effectsOf(weatherOn(seed, 100 + r));
    week = withPins(week, policy({ week, spread: sky.spread }));
    const { playerToPar } = playField(rng, holes, {
      setup, turfQuality, teeInterval, handicaps,
      pins: week.roundSettings.pins, spread: sky.spread, pace: sky.pace,
    });
    week = recordRound(week, { handicaps, playerToPar, entry: { pins: week.roundSettings.pins } });
  }
  return winningTotal(week);
}

/** Share of seeds whose winner lands in the rung's target. */
export function hitRate(rungId, { setup, policy, seeds = SEEDS, holes = courseFor(rungId) }) {
  const hits = seeds.filter((seed) => withinTarget(
    simulateWeek(holes, { rungId, setup, policy, seed }), RUNGS[rungId].target,
  )).length;
  return hits / seeds.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function main() {
  for (const rungId of RUNG_IDS) {
    const rung = RUNGS[rungId];
    const holes = courseFor(rungId);
    const mid = Math.round((rung.band.low + rung.band.high) / 2);
    const centre = median(SEEDS.map((seed) =>
      simulateWeek(holes, { rungId, setup: mid, policy: POLICIES.fair, seed })));
    const rate = (setup, policy) => `${Math.round(100 * hitRate(rungId, { setup, policy, holes }))}%`;
    console.log(`\n${rung.label}: target ${rung.target.low} to ${rung.target.high}, `
      + `measured centre ${centre} (fair pins at setup ${mid})`);
    console.log(`  midpoint, reacting  ${rate(mid, POLICIES.reacting)}   (want >= 80%)`);
    console.log(`  midpoint, fair      ${rate(mid, POLICIES.fair)}   (want >= 60%)`);
    console.log(`  setup 0, brutal     ${rate(0, POLICIES.brutal)}   (want <= 15%)`);
    console.log(`  setup 100, easy     ${rate(100, POLICIES.easy)}   (want <= 25%, County and Regional)`);
  }
}

// Run as a script, not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 2: Run it and calibrate**

Run: `node tools/calibrateWeek.js`

For each rung, compare the measured centre with the middle of `RUNGS[id].target`. If they differ by more than one stroke, set the target to `centre - 3` to `centre + 3` in `src/sim/tournaments.js`, update the comment block from Task 1 with the new date-stamped numbers (centre, and all four rates per rung), and re-run. Repeat until every criterion holds. If one cannot be met by moving the centre alone, stop and report the table to the controller — do not widen the range or change the pins without the author.

Paste the final table into the Task 1 comment block in `tournaments.js`.

- [ ] **Step 3: Write the proofs as tests**

Create `tests/championshipCalibration.test.js`:

```js
/**
 * The spec's shipping criteria for the judge (§11, items 1-5), on the real
 * field. Sixteen seeds rather than the tool's twenty-four, to keep the
 * suite quick; the thresholds have the slack that costs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNG_IDS, RUNGS } from '../src/sim/tournaments.js';
import { playField, drawFieldHandicaps } from '../src/sim/field.js';
import { makeRng } from '../src/sim/rng.js';
import { hitRate, POLICIES, SEEDS, courseFor } from '../tools/calibrateWeek.js';

const FEWER = SEEDS.slice(0, 16);
const mid = (id) => Math.round((RUNGS[id].band.low + RUNGS[id].band.high) / 2);

for (const id of RUNG_IDS) {
  test(`${id}: the free ride is still dead`, () => {
    const rate = hitRate(id, { setup: 0, policy: POLICIES.brutal, seeds: FEWER });
    assert.ok(rate <= 0.2, `an unconditioned course with brutal pins hit the target ${Math.round(rate * 100)}% of the time`);
  });

  test(`${id}: a well-run week is reachable`, () => {
    const reacting = hitRate(id, { setup: mid(id), policy: POLICIES.reacting, seeds: FEWER });
    assert.ok(reacting >= 0.75, `reacting at the band midpoint hit ${Math.round(reacting * 100)}%`);
    const fair = hitRate(id, { setup: mid(id), policy: POLICIES.fair, seeds: FEWER });
    assert.ok(fair >= 0.55, `fair pins at the band midpoint hit ${Math.round(fair * 100)}%`);
  });
}

for (const id of ['countyOpen', 'regional']) {
  test(`${id}: overcooking still fails`, () => {
    // Not asserted at the National: its band tops out at 92 and the dial
    // at 100, so there is no room to overcook into. The spec records this.
    const rate = hitRate(id, { setup: 100, policy: POLICIES.easy, seeds: FEWER });
    assert.ok(rate <= 0.3, `setup 100 with easy pins hit ${Math.round(rate * 100)}%`);
  });
}

test('pins matter: brutal against easy moves the field by more than a stroke', () => {
  const holes = courseFor('regional');
  const handicaps = drawFieldHandicaps(makeRng(5));
  let gap = 0;
  for (const seed of [1, 2, 3, 4]) {
    const easy = playField(makeRng(seed), holes, { setup: 70, handicaps, pins: 'easy' }).averageToPar;
    const brutal = playField(makeRng(seed), holes, { setup: 70, handicaps, pins: 'brutal' }).averageToPar;
    gap += brutal - easy;
  }
  assert.ok(gap / 4 > 1, `brutal pins only cost the field ${(gap / 4).toFixed(2)} a round`);
});
```

- [ ] **Step 4: Run tests and time them**

Run: `node --test tests/championshipCalibration.test.js` and note the wall time. If over 60 seconds, cut `FEWER` to 12 seeds and loosen each threshold by 0.05, noting why in the file header. Then `npm test` → PASS.
Sabotage: set `pinHandicap('brutal')` to 3; the free-ride test fails at the County. Restore.

- [ ] **Step 5: Commit**

```bash
git add tools/calibrateWeek.js tests/championshipCalibration.test.js src/sim/tournaments.js
git commit -m "Calibrate the championship targets on the real field and prove the judge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The operator hosts a week, and the ladder is re-measured

**Files:**
- Modify: `tools/operator.js` (`spendTheTournamentMorning`, `playActThree`)
- Create: `tools/actThree.js` (checkpointed runner)
- Test: `tests/operator.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/operator.test.js` (add imports: `spendTheTournamentMorning` from `../tools/operator.js` if not already imported, `newWeek, recordRound` from `../src/sim/championshipWeek.js`, `RUNGS` from `../src/sim/tournaments.js`, `courseDifficultyOf` from `../src/sim/hole.js`, `makeHole` and `TEMPLATE_NAMES` if missing):

```js
function actThreeCourse(seed) {
  const state = newGame(seed);
  state.act = 3;
  state.money = 600000;
  state.prestige = 90;
  state.resort.courses[0].holes = state.resort.courses[0].holes.map((h, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  return state;
}

test('during the run-up the operator redesigns the course up to the rung\'s floor', () => {
  const state = actThreeCourse(3);
  state.tournament = newWeek('regional', state.day + 10);
  spendTheTournamentMorning(state, { holesOpen: 18 });
  const holes = state.resort.courses[0].holes.filter((h) => h.open);
  assert.ok(courseDifficultyOf(holes) >= RUNGS.regional.minDifficulty);
});

test('during the week the operator sets the pins from the leader', () => {
  const state = actThreeCourse(4);
  let week = newWeek('national', state.day - 1);
  // Two rounds in and far under: a host reading this toughens the pins.
  week = recordRound(week, { handicaps: [0], playerToPar: [-6], entry: {} });
  week = recordRound(week, { handicaps: [0], playerToPar: [-6], entry: {} });
  state.tournament = week;
  spendTheTournamentMorning(state, { holesOpen: 18 });
  assert.ok(['tough', 'brutal'].includes(state.tournament.roundSettings.pins));
});
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test tests/operator.test.js` → FAIL (the morning returns early when a tournament is booked).

- [ ] **Step 3: Implement**

In `tools/operator.js`, import `narrowToDifficulty, reactivePins` from `./championshipPolicy.js`, `normaliseWeek, weekUnderWay, withPins` from `../src/sim/championshipWeek.js`, and `weatherOn, effectsOf` from `../src/sim/weather.js`. Replace the first line of `spendTheTournamentMorning`:

```js
export function spendTheTournamentMorning(state, { holesOpen }) {
  const booked = state.tournament && !state.tournament.resolved ? state.tournament : null;
  if (booked) {
    if (weekUnderWay(state)) {
      // The morning call: read the leader against the target, and the sky.
      const week = normaliseWeek(booked);
      const sky = effectsOf(weatherOn(state.weatherSeed ?? 1, state.day));
      state.tournament = withPins(week, reactivePins({ week, spread: sky.spread }));
    } else {
      // The run-up: bring the course up to the floor before the first
      // morning, by the cheapest redesign there is -- narrower fairways.
      narrowToDifficulty(state.resort.courses[0].holes, RUNGS[booked.rung].minDifficulty);
    }
    return false;
  }
  // [rest unchanged]
```

and after a successful bid (just before `return true;`), also narrow:

```js
  narrowToDifficulty(state.resort.courses[0].holes, RUNGS[next].minDifficulty);
```

Extend the function's doc comment with a paragraph on the run-up and the pins.

In `playActThree`:
1. Add an option `host = true`; when false, skip the `spendTheTournamentMorning` call entirely (the never-bid baseline).
2. Count round days: add `weekDays`, `weekTakings`, `weekProfit` accumulators, incremented when `result.report.tournamentDay` is true; return `weekDays`, `weekTakingsPerDay`, `weekProfitPerDay` alongside the existing per-day figures.
3. In the per-championship record, replace `inBand: hosted.met.includes('band'),` with:

```js
        inTarget: hosted.met.includes('target'),
        winningTotal: hosted.week.winningTotal,
        target: hosted.week.target,
        rounds: hosted.week.rounds,
        pins: hosted.week.roundLog.map((r) => r.pins),
        difficulty: hosted.difficulty,
        difficultyMet: hosted.difficultyMet,
```

Update the `day:` field to `state.day - hosted.week.rounds` (the first round), and the comment above `setup:` to say the setup is guidance now.

- [ ] **Step 4: Write the checkpointed runner**

Create `tools/actThree.js`:

```js
/**
 * Measures Act III end to end: a resort played through Acts I and II by
 * the operator, then the ladder hosted against the same resort never
 * bidding.
 *
 * Long-running (minutes per seed), so it checkpoints per phase per seed in
 * tools/.cache/act-three/, skips anything already done on relaunch, and
 * `--force` redoes everything.
 *
 *   node tools/actThree.js [--seeds 8] [--force]
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { serialize, deserialize } from '../src/sim/state.js';
import { openingResort } from './scenarios.js';
import { play, playActTwo, playActThree } from './operator.js';

const DIR = new URL('./.cache/act-three/', import.meta.url);
const args = process.argv.slice(2);
const force = args.includes('--force');
const seedCount = Number(args[args.indexOf('--seeds') + 1]) || 8;
const LEVERS = { greenFee: 80, teeInterval: 14, roomRate: 300 };

if (force && existsSync(DIR)) rmSync(DIR, { recursive: true });
mkdirSync(DIR, { recursive: true });

function phase(name, seed, run) {
  const file = new URL(`${name}-${seed}.json`, DIR);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const result = run();
  writeFileSync(file, JSON.stringify(result));
  return result;
}

const rows = [];
for (let seed = 1; seed <= seedCount; seed++) {
  const settled = phase('settled', seed, () => {
    const one = play(openingResort(seed), { ...LEVERS, days: 200, seed });
    if (!one.gateDay) return { skipped: 'Act I gate never opened' };
    const two = playActTwo(one.state, { ...LEVERS, days: 300, seed });
    if (two.state.act !== 3) return { skipped: `Act II ended ${two.ending ?? 'unsettled'}` };
    return { state: serialize(two.state) };
  });
  if (settled.skipped) {
    rows.push({ seed, skipped: settled.skipped });
    continue;
  }
  const measure = (host) => phase(host ? 'hosted' : 'neverBid', seed, () => {
    const r = playActThree(deserialize(settled.state), { ...LEVERS, days: 240, seed, host });
    const { state, ...rest } = r;
    return rest;
  });
  const hosted = measure(true);
  const neverBid = measure(false);
  rows.push({
    seed,
    hosted: hosted.hosted.join(' > ') || 'none',
    weeks: hosted.tournaments.map((t) =>
      `${t.rung} ${t.winningTotal}/${t.target.low}..${t.target.high} ${t.inTarget ? 'HIT' : 'miss'} $${t.paid}`),
    hostedMoney: hosted.money,
    neverBidMoney: neverBid.money,
    hostingWorth: hosted.money - neverBid.money,
    weekProfitPerDay: hosted.weekProfitPerDay,
    ordinaryProfitPerDay: hosted.ordinaryProfitPerDay,
  });
}
console.log(JSON.stringify(rows, null, 2));
```

Add `tools/.cache/` to `.gitignore` if it is not already ignored.

- [ ] **Step 5: Run the tests and the measurement**

Run: `npm test` → PASS.
Run: `node tools/actThree.js --seeds 8` (run in the background; it checkpoints, so a kill loses at most one phase).

Report to the controller, per seed: the ladder reached, each week's winning total against its target, `hostingWorth`, and round-day against ordinary profit per day. The spec's money target (§9): hosting a passed ladder still beats never bidding, by noticeably less than the $61k–$167k measured before this change. If hosting **loses** to never bidding on most seeds, report it — the spec says retune the purse, and that is the author's call, not this task's.

Record the table in the doc comment above `playActThree`, dated, the way `tournaments.js` records its measurements.

- [ ] **Step 6: Commit**

```bash
git add tools/operator.js tools/actThree.js tests/operator.test.js .gitignore
git commit -m "Teach the operator to host a championship week and re-measure the ladder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Release notes

**Files:**
- Modify: `src/ui/changes.js` (`BUILD`, a new first entry in `CHANGES`)
- Modify: `version.json`

- [ ] **Step 1: Write the entry**

Set `BUILD = '2026-10-03a'` and `version.json` to `{ "build": "2026-10-03a" }`. Add as the first element of `CHANGES`:

```js
  {
    version: '2026-10-03a',
    notes: [
      'A championship is now a week, not a day. The County Open is two rounds, the Regional three and the National four, and the course is shut to the public for every one of them.',
      'Each morning of the week you set the pins — easy, fair, tough or brutal — on the Championship sheet, with the leader and the day\'s weather beside them. Then watch the field play your course: they are on the playback now, instead of an empty course.',
      'The week is judged on the winning score. Each rung wants the winner inside a range, and too low is as bad as too high: the field took the course apart, or nobody could score. The setup band is still there, as the governing body\'s advice on where to start.',
      'Every rung also has a minimum course difficulty, checked on the first morning. Narrower fairways and bunkers in the landing zones will get you there, and the locals will not thank you for it. You can redesign during the run-up; once the first round starts the course is locked.',
      'Wind and rain now reach the field, and a hard week on firm greens wears the turf. A crew that only just held it through the run-up can lose it by the last round.',
    ],
  },
```

- [ ] **Step 2: Run tests**

Run: `npm test` → PASS (`tests/changes.test.js` checks `CHANGES[0].version === BUILD`).

- [ ] **Step 3: Commit**

```bash
git add src/ui/changes.js version.json
git commit -m "Write the release notes for the championship week

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

The controller (not a subagent) should:

1. Run `npm test` and report the count.
2. Play a County Open in the browser from an Act III save if one exists: tap a hole on a round morning and confirm the "The course is set" sheet opens instead of the editor; set pins on the Championship sheet; screenshot a round's evening report and the result card, and send them to the author. If no Act III save exists, say so rather than constructing one by hand.
3. Remind the author to push from GitHub Desktop.
