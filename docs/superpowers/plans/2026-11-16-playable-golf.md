# Playable Golf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sixth screen, `play`, on which the player plays the hole they were editing: aim, three-tap swing, flight, putt, score.

**Architecture:** The physics, swing meter, camera and scorecard are **already built and tested** (commit `9f1a3d3`). This plan builds what sits on top: two small pure modules (ball-in-flight position, result copy), one renderer, one screen module, and the wiring. Nothing in this plan changes a number; if a number looks wrong, stop and say so rather than retuning.

**Tech stack:** Plain ES modules, no dependencies, no build step. Tests are `node --test` (currently **1041 passing**). Browser checks use the Claude Browser preview tools.

**Spec:** `docs/superpowers/specs/2026-11-16-course-tycoon-playable-golf-design.md` — read §3, §4 and §6 before starting.

> **STATUS, 2026-11-16: Tasks 1–6 are done and committed.** This plan was written for a
> cheaper model to build from. To make sure it could be built from, its code was
> extracted, wired up and run in a real page — and at that point the feature existed,
> so it was committed rather than thrown away and typed in again. The code blocks below
> are the code in the repository. The tasks are kept as the record of how it was built.
> **What still needs doing is the section "What is left" at the very end** — start there.

---

## Ground rules (read once, apply to every task)

1. **Never run `git push`, `git fetch` or `git pull`.** Commit locally only. Commit after each task with a descriptive message (not "updates"), ending with the `Co-Authored-By` line your own session instructions give you.
2. **Work on `master`.** Do not create a branch.
3. **Check the test totals before every commit:** `node --test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`. `fail` must be `0`. Do not chain the commit to a `grep` with `&&` — a grep that matches does not mean the tests passed.
4. **No raw hex colours.** Every colour comes from `PALETTE` in `src/render/palette.js`. Keys you will need: `OUTLINE`, `WHITE`, `ACCENT`, `UI_DARK`, `UI_LIGHT`, `TREE`, `FAIRWAY`, `FAIRWAY_SHADOW`, `PATH`, `SAND_SHADOW`, `FOOD_RED`.
5. **Strings with apostrophes:** this repo uses single-quoted JS strings. An apostrophe inside one breaks the file. Use a typographic apostrophe (`’`) in copy, or avoid the contraction.
6. **Sabotage checks:** after a test passes, break the code it covers, confirm the test fails, then restore. Restore by **copying a backup file back**, never with `git checkout` — checkout throws away your uncommitted work.
7. **`src/sim/` and `src/play/` must not touch `document`, `window`, `Math.random` or `Date`.** `tests/purity.test.js` enforces this for `src/sim/` and is a plain text scan, so even the *word* "window" in a string or identifier inside `src/sim/` fails it.
8. **Do not edit** `src/sim/playGolf.js`, `src/sim/putting.js`, `src/play/swingMeter.js`, `src/render/playCamera.js` or their tests. They are the measured core.
9. Bugs you notice in *other* parts of the game go in `docs/known-issues.md`, not into a fix.

## What already exists (the API you build on)

```js
// src/play/swingMeter.js
METER = { SPEED: 0.001, MAX: 1.1, MIN_POWER: 0.05, LATE_LIMIT: -0.1, ACC_WINDOW: 0.08, PERFECT: 0.012 }
newSwing()                 // -> { phase: 'ready' }
tapSwing(swing, nowMs)     // ready -> rising -> falling -> done { power, accuracy, cursor, perfect }
tickSwing(swing, nowMs)    // advances past the top of the bar / the miss zone; call every frame
cursorAt(swing, nowMs)     // cursor position on the bar, LATE_LIMIT..MAX

// src/sim/playGolf.js
startHole(hole)            // -> play = { holeId, ball:{x,y}, lie, strokes, holed, pickedUp }
isFinished(play)           // holed || pickedUp
reachFrom(lie)             // yards reachable at power 1.0
defaultTarget(hole, play)  // where the caddie points
clampTarget(hole, play, point)
planShot(hole, play, target)   // -> { kind:'swing'|'putt', club:{id,name}, target, yards, full, needed }
resolveStroke(hole, play, target, swing, weatherSpread)
   // -> outcome = { kind, club, from, to, lie, yards, angle, holed, penalty:null|'water'|'lost', path?, seconds? }
applyStroke(play, outcome) // -> next play
scoreName(strokes, par)    // 'Birdie', 'Par', '+4', 'Hole in one'
bestOn(state, hole)        // number | null
recordPlay(state, hole, play)  // -> state (same object if no new record)
parOf(hole)
MAX_STROKES                // 12

// src/sim/putting.js
greenSlope(hole)           // { x, y } yards/s², direction the green falls
slopeFraction(greenPreset) // 0.03..0.2

// src/render/playCamera.js
shotFrame(hole, play, target)          // world rectangle to show
makePlayCamera(hole, viewRect, frame)  // -> { toScreen, toWorld, scale, zoom, tx, ty }
```

World coordinates are yards; `y` grows from tee to green. Screen `y` grows downward. `hole.teePos` is the tee; `greenCentre(hole)` (from `src/sim/hole.js`) is the cup. `LIE` values (from `src/sim/terrain.js`): `'tee' 'fairway' 'rough' 'sand' 'water' 'trees' 'green'`.

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/play/flight.js` | create | Where the ball is `t` ms after the strike. Pure. |
| `tests/flight.test.js` | create | |
| `src/ui/playCopy.js` | create | Every line of text the play screen shows. Pure. |
| `tests/playCopy.test.js` | create | |
| `src/render/holeView.js` | modify | `drawHole` gains an optional `{ flag }`. |
| `src/render/playView.js` | create | Draws one frame. |
| `tests/playView.test.js` | create | The two pure helpers only. |
| `src/ui/playHole.js` | create | The screen: header, dock, meter, input, phases. |
| `tests/playHole.test.js` | create | `meterPercent` only. |
| `src/ui/screens.js`, `tests/ui.test.js` | modify | Sixth screen. |
| `src/ui/editor.js` | modify | **Play** button. |
| `src/main.js` | modify | Wiring. |
| `src/ui/changes.js`, `version.json` | modify | Release note. |

---

### Task 1: Ball in flight (`src/play/flight.js`)

**Files:** Create `src/play/flight.js`, `tests/flight.test.js`.

- [ ] **Step 1: Write the failing tests** — `tests/flight.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightDuration, flightAt } from '../src/play/flight.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const swing = (yards) => ({ kind: 'swing', from: { x: 0, y: 0 }, to: { x: 30, y: yards }, yards });
const putt = { kind: 'putt', seconds: 2, from: { x: 0, y: 0 }, to: { x: 4, y: 0 },
  path: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3.5, y: 0 }, { x: 4, y: 0 }] };

test('a longer shot is in the air longer, within fixed limits', () => {
  assert.ok(flightDuration(swing(250)) > flightDuration(swing(120)));
  assert.equal(flightDuration(swing(5)), 450);
  assert.equal(flightDuration(swing(2000)), 1500);
});

test('a swing starts at the ball, ends at the landing point, and is done only at the end', () => {
  const out = swing(200);
  const d = flightDuration(out);
  assert.deepEqual(flightAt(out, 0), { x: 0, y: 0, lift: 0, done: false });
  const end = flightAt(out, d);
  near(end.x, 30); near(end.y, 200); near(end.lift, 0); assert.equal(end.done, true);
  assert.equal(flightAt(out, d + 5000).done, true);
  near(flightAt(out, d + 5000).y, 200);
});

test('a swing is highest at the middle of its flight', () => {
  const out = swing(200);
  const d = flightDuration(out);
  const mid = flightAt(out, d / 2);
  near(mid.x, 15); near(mid.y, 100);
  assert.ok(mid.lift > flightAt(out, d / 4).lift);
  assert.ok(mid.lift > 2 && mid.lift <= 24);
});

test('a putt never leaves the ground and takes as long as it really rolled', () => {
  assert.equal(flightDuration(putt), 2000);
  for (const t of [0, 500, 1000, 1999]) assert.equal(flightAt(putt, t).lift, 0);
});

test('a putt follows its path: fast at first, slow at the end', () => {
  near(flightAt(putt, 0).x, 0);
  near(flightAt(putt, 500).x, 2);      // a quarter of the time, half the distance
  near(flightAt(putt, 750).x, 2.5);    // halfway between two samples
  const end = flightAt(putt, 2000);
  near(end.x, 4); assert.equal(end.done, true);
});

test('a putt whose path is a single point is over at once', () => {
  const still = { kind: 'putt', seconds: 0, path: [{ x: 1, y: 1 }], from: { x: 1, y: 1 }, to: { x: 1, y: 1 } };
  assert.deepEqual(flightAt(still, 0), { x: 1, y: 1, lift: 0, done: true });
});
```

- [ ] **Step 2: Run, expect failure.** `node --test tests/flight.test.js` → fails with "Cannot find module".

- [ ] **Step 3: Implement** — `src/play/flight.js`:

```js
/**
 * Where a struck ball is, some milliseconds after the strike.
 *
 * The outcome of a stroke is decided the instant it is struck
 * (playGolf.js#resolveStroke). This only replays it: a full shot as a
 * straight run from `from` to `to` with a hump of height for the eye, a
 * putt along the path the roll actually took, in the time it actually
 * took. Pure, so the screen can ask "where is it now?" every frame.
 */
const SWING_MS_BASE = 350;
const SWING_MS_PER_YARD = 4.5;
const SWING_MS_MIN = 450;
const SWING_MS_MAX = 1500;
/** Peak height of the drawn arc, in canvas pixels. */
const LIFT_PX_PER_YARD = 0.1;
const LIFT_PX_MIN = 2;
const LIFT_PX_MAX = 24;
/** A putt that stopped at once still gets a beat on screen. */
const PUTT_MS_MIN = 200;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function flightDuration(outcome) {
  if (outcome.kind === 'putt') {
    return outcome.path.length < 2 ? 0 : Math.max(PUTT_MS_MIN, outcome.seconds * 1000);
  }
  return clamp(SWING_MS_BASE + outcome.yards * SWING_MS_PER_YARD, SWING_MS_MIN, SWING_MS_MAX);
}

/** `{ x, y, lift, done }` — world yards, plus pixels of height to draw the ball above its shadow. */
export function flightAt(outcome, elapsedMs) {
  const duration = flightDuration(outcome);
  const t = duration <= 0 ? 1 : clamp(elapsedMs / duration, 0, 1);
  const done = t >= 1;

  if (outcome.kind === 'putt') {
    const path = outcome.path;
    if (path.length < 2) return { x: path[0].x, y: path[0].y, lift: 0, done: true };
    const f = t * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    const k = f - i;
    return {
      x: path[i].x + (path[i + 1].x - path[i].x) * k,
      y: path[i].y + (path[i + 1].y - path[i].y) * k,
      lift: 0,
      done,
    };
  }

  const peak = clamp(outcome.yards * LIFT_PX_PER_YARD, LIFT_PX_MIN, LIFT_PX_MAX);
  // t is clamped, so sin(pi * 1) is ~1e-16 rather than 0: say 0.
  const lift = done || t === 0 ? 0 : Math.sin(Math.PI * t) * peak;
  return {
    x: outcome.from.x + (outcome.to.x - outcome.from.x) * t,
    y: outcome.from.y + (outcome.to.y - outcome.from.y) * t,
    lift,
    done,
  };
}
```

- [ ] **Step 4: Run, expect 6 passing.** `node --test tests/flight.test.js`
- [ ] **Step 5: Sabotage.** Copy `src/play/flight.js` to a backup. Change `Math.sin(Math.PI * t)` to `t`; confirm "highest at the middle" fails. Restore from the backup.
- [ ] **Step 6: Full suite, then commit.** Expect 1047 tests, 0 fail. Message: `Add the ball-in-flight replay for playable golf`.

---

### Task 2: The words (`src/ui/playCopy.js`)

Every string the play screen shows is produced here, so it can be tested without a browser.

**Files:** Create `src/ui/playCopy.js`, `tests/playCopy.test.js`.

- [ ] **Step 1: Write the failing tests** — `tests/playCopy.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerLines, caddieLine, strokeLine, finishLine, roundLine, meterHint } from '../src/ui/playCopy.js';
import { makeHole, greenCentre } from '../src/sim/hole.js';
import { LIE } from '../src/sim/terrain.js';
import { startHole, planShot, MAX_STROKES } from '../src/sim/playGolf.js';

const hole = makeHole('straightPar4', 4);                 // tee (0,0), cup (0,390)
const cup = greenCentre(hole);
const play = (over = {}) => ({ ...startHole(hole), ...over });
const out = (over = {}) => ({ kind: 'swing', from: { x: 0, y: 0 }, to: { x: 0, y: 238 }, lie: LIE.FAIRWAY, penalty: null, holed: false, ...over });

test('the header names the hole, the stroke about to be played, and how far is left', () => {
  const h = headerLines({ hole, par: 4, lengthYards: 390.4, play: play(), best: null, weatherShort: 'Fair', round: '' });
  assert.equal(h.title, 'Hole 4 · Par 4 · 390y');
  assert.equal(h.status, 'Stroke 1 · 390y · Tee');
  assert.equal(h.right, '');
  assert.equal(h.weather, 'Fair');
});

test('the header shows the best score and the round when there is one', () => {
  const h = headerLines({ hole, par: 4, lengthYards: 390, play: play(), best: 3, weatherShort: 'Breezy', round: 'Round: +1 thru 2' });
  assert.equal(h.right, 'Best 3 · Round: +1 thru 2');
});

test('on the green the distance is in feet', () => {
  const onGreen = play({ ball: { x: cup.x, y: cup.y - 5 }, lie: LIE.GREEN, strokes: 2 });
  const h = headerLines({ hole, par: 4, lengthYards: 390, play: onGreen, best: null, weatherShort: 'Fair', round: '' });
  assert.equal(h.status, 'Stroke 3 · 15 ft · Green');
});

test('the caddie names the club and the distance', () => {
  const p = play();
  assert.equal(caddieLine(planShot(hole, p, { x: 0, y: 250 })), 'Driver · 250y');
  const onGreen = play({ ball: { x: cup.x, y: cup.y - 5 }, lie: LIE.GREEN });
  assert.equal(caddieLine(planShot(hole, onGreen, cup)), 'Putter · 15 ft');
});

test('a result line says where the ball is and how far is left', () => {
  const after = play({ ball: { x: 0, y: 238 }, lie: LIE.FAIRWAY, strokes: 1 });
  assert.equal(strokeLine(hole, out(), after, { perfect: false }), 'Fairway. 152y to the pin.');
  assert.equal(strokeLine(hole, out({ lie: LIE.SAND }), { ...after, lie: LIE.SAND }, { perfect: false }), 'In the bunker. 152y to the pin.');
  assert.equal(strokeLine(hole, out({ lie: LIE.ROUGH }), { ...after, lie: LIE.ROUGH }, { perfect: false }), 'In the rough. 152y to the pin.');
  assert.equal(strokeLine(hole, out({ lie: LIE.TREES }), { ...after, lie: LIE.TREES }, { perfect: false }), 'In the trees. 152y to the pin.');
});

test('a perfect strike is called one, but only when it did some good', () => {
  const after = play({ ball: { x: 0, y: 238 }, lie: LIE.FAIRWAY, strokes: 1 });
  assert.equal(strokeLine(hole, out(), after, { perfect: true }), 'Perfect strike. Fairway. 152y to the pin.');
  const wet = strokeLine(hole, out({ lie: LIE.WATER, penalty: 'water' }), play({ strokes: 2 }), { perfect: true });
  assert.equal(wet, 'In the water. One-stroke penalty — play it again.');
});

test('penalties say what they cost', () => {
  assert.equal(strokeLine(hole, out({ lie: LIE.TREES, penalty: 'lost' }), play({ strokes: 2 }), { perfect: false }),
    'Lost in the woods. One-stroke penalty — play it again.');
});

test('reaching the green and missing a putt are both given in feet', () => {
  const after = play({ ball: { x: cup.x, y: cup.y - 6 }, lie: LIE.GREEN, strokes: 2 });
  assert.equal(strokeLine(hole, out({ lie: LIE.GREEN }), after, { perfect: false }), 'On the green, 18 feet.');
  const missed = play({ ball: { x: cup.x, y: cup.y - 0.2 }, lie: LIE.GREEN, strokes: 3 });
  assert.equal(strokeLine(hole, out({ kind: 'putt', lie: LIE.GREEN }), missed, { perfect: false }), '1 foot left.');
  const longer = play({ ball: { x: cup.x, y: cup.y - 2 }, lie: LIE.GREEN, strokes: 3 });
  assert.equal(strokeLine(hole, out({ kind: 'putt', lie: LIE.GREEN }), longer, { perfect: true }), '6 feet left.');
});

test('the finish line names the score, and a new best', () => {
  assert.equal(finishLine(play({ strokes: 3, holed: true }), 4, true), 'Birdie — 3 on a par 4. New best.');
  assert.equal(finishLine(play({ strokes: 5, holed: true }), 4, false), 'Bogey — 5 on a par 4.');
  assert.equal(finishLine(play({ strokes: 1, holed: true }), 3, true), 'Hole in one — 1 on a par 3. New best.');
  assert.equal(finishLine(play({ strokes: MAX_STROKES, pickedUp: true }), 4, false), `Picked up after ${MAX_STROKES}. It happens.`);
});

test('the round line adds up against par', () => {
  assert.equal(roundLine([]), '');
  assert.equal(roundLine([{ strokes: 4, par: 4 }]), 'Round: E thru 1');
  assert.equal(roundLine([{ strokes: 5, par: 4 }, { strokes: 2, par: 3 }, { strokes: 6, par: 5 }]), 'Round: +1 thru 3');
  assert.equal(roundLine([{ strokes: 3, par: 4 }, { strokes: 2, par: 3 }]), 'Round: -2 thru 2');
});

test('the meter hint follows the swing', () => {
  assert.equal(meterHint('rising'), 'Tap at the mark');
  assert.equal(meterHint('falling'), 'Tap on the line');
  assert.equal(meterHint('done'), '');
});
```

- [ ] **Step 2: Run, expect failure** (module missing).

- [ ] **Step 3: Implement** — `src/ui/playCopy.js`:

```js
/**
 * Every line of text the play screen shows.
 *
 * Kept apart from the screen (playHole.js) for the usual reason: words
 * are worth testing and a DOM is not needed to test them. Nothing here
 * decides anything — it reports what playGolf.js already decided, in the
 * units a golfer uses: yards from the fairway, feet on the green.
 */
import { greenCentre } from '../sim/hole.js';
import { LIE } from '../sim/terrain.js';
import { scoreName, MAX_STROKES } from '../sim/playGolf.js';

const LIE_WORD = {
  [LIE.TEE]: 'Tee', [LIE.FAIRWAY]: 'Fairway', [LIE.ROUGH]: 'Rough', [LIE.SAND]: 'Bunker',
  [LIE.TREES]: 'Trees', [LIE.GREEN]: 'Green', [LIE.WATER]: 'Water',
};

const RESTING = {
  [LIE.TEE]: 'On the tee.', [LIE.FAIRWAY]: 'Fairway.', [LIE.ROUGH]: 'In the rough.',
  [LIE.SAND]: 'In the bunker.', [LIE.TREES]: 'In the trees.',
};

function yardsToCup(hole, point) {
  const cup = greenCentre(hole);
  return Math.hypot(cup.x - point.x, cup.y - point.y);
}

function feet(yards) {
  const n = Math.max(1, Math.round(yards * 3));
  return n === 1 ? '1 foot' : `${n} feet`;
}

function remaining(hole, play) {
  const yards = yardsToCup(hole, play.ball);
  return play.lie === LIE.GREEN ? `${Math.max(1, Math.round(yards * 3))} ft` : `${Math.round(yards)}y`;
}

/** The two header rows. `round` is `roundLine(...)`, possibly ''. */
export function headerLines({ hole, par, lengthYards, play, best, weatherShort, round }) {
  const right = [best === null ? '' : `Best ${best}`, round].filter(Boolean).join(' · ');
  return {
    title: `Hole ${hole.id} · Par ${par} · ${Math.round(lengthYards)}y`,
    right,
    status: `Stroke ${play.strokes + 1} · ${remaining(hole, play)} · ${LIE_WORD[play.lie] ?? ''}`,
    weather: weatherShort,
  };
}

/** What the caddie says while the player aims. */
export function caddieLine(plan) {
  if (plan.kind === 'putt') return `${plan.club.name} · ${Math.max(1, Math.round(plan.yards * 3))} ft`;
  return `${plan.club.name} · ${Math.round(plan.yards)}y`;
}

/**
 * What happened to the stroke just played. `after` is the play state once
 * the stroke has been applied (so a penalised ball is already back where
 * it was hit from); `swing` is the finished swing from the meter.
 */
export function strokeLine(hole, outcome, after, swing) {
  if (outcome.penalty === 'water') return 'In the water. One-stroke penalty — play it again.';
  if (outcome.penalty === 'lost') return 'Lost in the woods. One-stroke penalty — play it again.';

  const left = yardsToCup(hole, after.ball);
  if (after.lie === LIE.GREEN) {
    return outcome.kind === 'putt' ? `${feet(left)} left.` : `${praise(swing, outcome)}On the green, ${feet(left)}.`;
  }
  return `${praise(swing, outcome)}${RESTING[after.lie] ?? ''} ${Math.round(left)}y to the pin.`;
}

function praise(swing, outcome) {
  return swing?.perfect && outcome.kind === 'swing' ? 'Perfect strike. ' : '';
}

/** The line shown when the hole is over. */
export function finishLine(play, par, isNewBest) {
  if (play.pickedUp) return `Picked up after ${MAX_STROKES}. It happens.`;
  return `${scoreName(play.strokes, par)} — ${play.strokes} on a par ${par}.${isNewBest ? ' New best.' : ''}`;
}

/** "Round: +1 thru 3" for the holes played this visit; '' before the first. */
export function roundLine(holes) {
  if (!holes.length) return '';
  const diff = holes.reduce((sum, h) => sum + h.strokes - h.par, 0);
  const text = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  return `Round: ${text} thru ${holes.length}`;
}

/** The prompt under the meter while a swing is under way. */
export function meterHint(swingPhase) {
  if (swingPhase === 'rising') return 'Tap at the mark';
  if (swingPhase === 'falling') return 'Tap on the line';
  return '';
}
```

- [ ] **Step 4: Run, expect 11 passing.** If a distance is off by one, check the test's geometry before touching the code: the cup of `straightPar4` is at y = 390.
- [ ] **Step 5: Sabotage.** Backup, then make `praise` always return `'Perfect strike. '`; two tests must fail. Restore.
- [ ] **Step 6: Full suite (1058, 0 fail), commit.** Message: `Add the play screen's copy: header, caddie, result and round lines`.

---

### Task 3: Drawing a frame (`src/render/playView.js`)

**Files:** Modify `src/render/holeView.js`; create `src/render/playView.js`, `tests/playView.test.js`.

- [ ] **Step 1: Give `drawHole` two options.** At full zoom the flag sprite is scaled up ninefold and hides the top of the green, so the play screen draws its own, unzoomed. And `drawHole` clips to `rect`, which under a zoom cuts the rough's rounded ends off along a straight line and shows woods where `lieAt` says rough — so the play screen clips to its own view instead. In `src/render/holeView.js` change the signature, the clip at the top and the last drawing lines of `drawHole`:

```js
export function drawHole(ctx, hole, rect, { flag = true, clip = true } = {}) {
```
```js
  ctx.save();
  // The play screen draws under a zoom, with its own clip to its own view.
  // Clipping to `rect` there would cut the rough's rounded ends off along
  // a straight line and show woods where lieAt says rough.
  if (clip) {
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
  }
```
```js
  drawTeeBox(ctx, t, hole);
  // The play screen draws the hole under a zoom and wants the flag at its
  // ordinary size on top, so it asks for the hole without one.
  if (flag) drawFlag(ctx, t, gc);
```
Update the doc comment above `drawHole` with one sentence saying the same. Run `node --test tests/holeView.test.js` — still passing.

- [ ] **Step 2: Write the failing tests** — `tests/playView.test.js` (only the pure helpers; the drawing is checked in the browser in Task 7):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slopeMarks, slopeArrowAnchors, dottedPoints } from '../src/render/playView.js';
import { makeHole, greenCentre } from '../src/sim/hole.js';
import { greenRadius } from '../src/sim/terrain.js';
import { slopeFraction } from '../src/sim/putting.js';

test('a steeper green gets a longer arrow', () => {
  assert.equal(slopeMarks(slopeFraction('large')), 1);
  assert.equal(slopeMarks(slopeFraction('small')), 2);
  assert.equal(slopeMarks(slopeFraction('tiered')), 3);
});

test('slope arrows sit on the green and clear of the cup', () => {
  const hole = makeHole('shortPar3', 1);
  const cup = greenCentre(hole);
  const anchors = slopeArrowAnchors(hole);
  assert.equal(anchors.length, 4);
  for (const a of anchors) {
    const d = Math.hypot(a.x - cup.x, a.y - cup.y);
    assert.ok(d > 3 && d < greenRadius(hole), `anchor ${d} yards from the cup`);
  }
});

test('a dotted line runs from one end to the other in even steps', () => {
  const pts = dottedPoints({ x: 0, y: 0 }, { x: 0, y: 20 }, 4);
  assert.deepEqual(pts[0], { x: 0, y: 0 });
  assert.deepEqual(pts.at(-1), { x: 0, y: 20 });
  assert.equal(pts.length, 6);
  assert.deepEqual(dottedPoints({ x: 3, y: 3 }, { x: 3, y: 3 }, 4), [{ x: 3, y: 3 }]);
});
```

- [ ] **Step 3: Run, expect failure** (module missing).

- [ ] **Step 4: Implement** — `src/render/playView.js`:

```js
/**
 * Draws one frame of the play screen.
 *
 * The hole itself is `drawHole` — the same function the editor and the
 * resort map use — under the play camera's zoom. This file never paints
 * terrain of its own, so what the player sees under the ball is by
 * construction what `lieAt` will say about it.
 *
 * Everything else (cup, flag, slope arrows, reach ring, aim line, target,
 * ball) is drawn AFTER the zoom is undone, at `camera.toScreen(point)`,
 * so a ball is two crisp pixels at any zoom.
 */
import { PALETTE } from './palette.js';
import { SPRITES, drawSprite } from './sprites.js';
import { drawHole } from './holeView.js';
import { greenCentre } from '../sim/hole.js';
import { greenRadius } from '../sim/terrain.js';

/** How steep a green reads: 1 gentle, 2 firm, 3 severe — drawn as the
 * length of its slope arrows. Thresholds sit between the five green
 * presets' slopeFraction values (0.04 … 0.15). */
export function slopeMarks(fraction) {
  if (fraction < 0.07) return 1;
  if (fraction < 0.13) return 2;
  return 3;
}

/** Four points on the green, on the diagonals, clear of the cup. */
export function slopeArrowAnchors(hole) {
  const cup = greenCentre(hole);
  const d = greenRadius(hole) * 0.45;
  return [
    { x: cup.x - d, y: cup.y - d }, { x: cup.x + d, y: cup.y - d },
    { x: cup.x - d, y: cup.y + d }, { x: cup.x + d, y: cup.y + d },
  ];
}

/** Points every `step` px from `a` to `b`, both ends included. */
export function dottedPoints(a, b, step) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-6) return [{ x: a.x, y: a.y }];
  const n = Math.max(1, Math.round(length / step));
  const points = [];
  for (let i = 0; i <= n; i++) {
    points.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  return points;
}

function dot(ctx, p, size = 1) {
  ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
}

function drawCupAndFlag(ctx, camera, hole) {
  const s = camera.toScreen(greenCentre(hole));
  const sprite = SPRITES.flag;
  drawSprite(ctx, sprite, s.x - sprite[0].length / 2, s.y - sprite.length);
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 2, 2);
}

function drawSlopeArrows(ctx, camera, hole, slope, fraction) {
  const length = Math.hypot(slope.x, slope.y) || 1;
  // Screen y runs the other way from world y.
  const dir = { x: slope.x / length, y: -slope.y / length };
  const perp = { x: -dir.y, y: dir.x };
  // A steeper green gets a longer arrow: 6, 10 or 14 px of shaft.
  const shaft = 2 + slopeMarks(fraction) * 4;
  ctx.fillStyle = PALETTE.FAIRWAY_SHADOW;
  for (const anchor of slopeArrowAnchors(hole)) {
    const mid = camera.toScreen(anchor);
    const tail = { x: mid.x - (dir.x * shaft) / 2, y: mid.y - (dir.y * shaft) / 2 };
    const tip = { x: mid.x + (dir.x * shaft) / 2, y: mid.y + (dir.y * shaft) / 2 };
    for (const p of dottedPoints(tail, tip, 1)) dot(ctx, p);
    for (const back of [1, 2, 3]) {
      dot(ctx, { x: tip.x - dir.x * back + perp.x * back, y: tip.y - dir.y * back + perp.y * back });
      dot(ctx, { x: tip.x - dir.x * back - perp.x * back, y: tip.y - dir.y * back - perp.y * back });
    }
  }
}

function drawReachRing(ctx, camera, ball, reachYards) {
  const centre = camera.toScreen(ball);
  const radius = reachYards * camera.scale;
  const steps = Math.max(24, Math.round((2 * Math.PI * radius) / 5));
  ctx.fillStyle = PALETTE.UI_LIGHT;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    dot(ctx, { x: centre.x + Math.cos(a) * radius, y: centre.y + Math.sin(a) * radius });
  }
  ctx.globalAlpha = 1;
}

function drawAim(ctx, camera, ball, target) {
  const from = camera.toScreen(ball);
  const to = camera.toScreen(target);
  ctx.fillStyle = PALETTE.WHITE;
  ctx.globalAlpha = 0.75;
  for (const p of dottedPoints(from, to, 4)) dot(ctx, p);
  ctx.globalAlpha = 1;

  const x = Math.round(to.x);
  const y = Math.round(to.y);
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(x - 4, y - 1, 9, 3);
  ctx.fillRect(x - 1, y - 4, 3, 9);
  ctx.fillStyle = PALETTE.ACCENT;
  ctx.fillRect(x - 3, y, 7, 1);
  ctx.fillRect(x, y - 3, 1, 7);
}

function drawBall(ctx, camera, ball, lift) {
  const s = camera.toScreen(ball);
  const x = Math.round(s.x);
  const y = Math.round(s.y);
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(x, y, 2, 1);                       // shadow, on the ground
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fillRect(x - 1, y - 1 - Math.round(lift), 2, 2);
}

/**
 * scene = {
 *   hole, viewRect, camera,
 *   ball: { x, y },          // world yards; the animated position during flight
 *   lift,                    // px of height above the shadow (0 on the ground)
 *   target,                  // world yards, or null to hide the aim line
 *   reachYards,              // number, or null to hide the ring (hidden on the green)
 *   slope, slopeFraction,    // the green's slope, or slope null when not putting
 * }
 * `canvasWidth`/`canvasHeight` are the surface's, for the clear.
 */
export function drawPlayScene(ctx, canvasWidth, canvasHeight, scene) {
  const { hole, viewRect, camera } = scene;

  // The strip outside viewRect sits behind opaque chrome, but is cleared
  // anyway so a previous screen's last frame cannot show through a gap.
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);
  ctx.clip();

  // Beyond the hole is woods — exactly what lieAt returns out there.
  ctx.fillStyle = PALETTE.TREE;
  ctx.fillRect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);

  ctx.save();
  ctx.translate(camera.tx, camera.ty);
  ctx.scale(camera.zoom, camera.zoom);
  drawHole(ctx, hole, viewRect, { flag: false, clip: false });
  ctx.restore();

  if (scene.slope) drawSlopeArrows(ctx, camera, hole, scene.slope, scene.slopeFraction);
  drawCupAndFlag(ctx, camera, hole);
  if (scene.target) {
    if (scene.reachYards) drawReachRing(ctx, camera, scene.ball, scene.reachYards);
    drawAim(ctx, camera, scene.ball, scene.target);
  }
  drawBall(ctx, camera, scene.ball, scene.lift ?? 0);

  ctx.restore();
}
```

- [ ] **Step 5: Run, expect 3 passing**, and `node --test tests/holeView.test.js` still passing.
- [ ] **Step 6: Full suite (1061, 0 fail), commit.** Message: `Add the play screen renderer: drawHole under the play camera, plus ball, aim and slope overlays`.

---

### Task 4: The screen (`src/ui/playHole.js`)

**Files:** Create `src/ui/playHole.js`, `tests/playHole.test.js`.

The screen is a small state machine. `phase` is one of:

| phase | what is happening | leaves when |
|---|---|---|
| `aim` | player moves the target | **Swing** / Space → `swing` |
| `swing` | the meter is running | meter reaches `done` → `flight` |
| `flight` | ball in the air or rolling | `flightAt(...).done` → `message` or `finished` |
| `message` | result line on screen | 1100 ms pass → `aim` |
| `finished` | holed or picked up | player picks Next / Replay / Done |

- [ ] **Step 1: Write the failing test** — `tests/playHole.test.js`. Importing a UI module in Node is fine as long as it touches `document` only inside functions (see how `tests/panels.test.js` imports `src/ui/panels.js`).

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterPercent } from '../src/ui/playHole.js';
import { METER } from '../src/play/swingMeter.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('the meter maps the whole cursor range onto the bar, miss zone to overswing', () => {
  near(meterPercent(METER.LATE_LIMIT), 0);
  near(meterPercent(METER.MAX), 100);
  near(meterPercent(0), (0.1 / 1.2) * 100);
  near(meterPercent(1), (1.1 / 1.2) * 100);
  assert.equal(meterPercent(5), 100);
  assert.equal(meterPercent(-5), 0);
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — `src/ui/playHole.js`. Type this in full; the comments are part of the deliverable.

```js
/**
 * The play screen: one hole, one ball, played by the person holding the
 * phone.
 *
 * This module owns the DOM (a header, a dock with the swing meter and
 * buttons) and the input, and holds the little state machine that walks a
 * stroke through aim → swing → flight → message. It decides nothing about
 * golf: where a ball goes is playGolf.js#resolveStroke, how a swing is
 * timed is swingMeter.js, what the words say is playCopy.js, and what is
 * drawn is playView.js. Keeping it that way is what lets every one of
 * those be tested without a browser.
 *
 * Same contract as mountHoleEditor: returns `{ render, destroy }`, and
 * the caller calls `render(ctx, rect, nowMs)` every frame while the
 * `play` screen is active. `nowMs` must be the requestAnimationFrame
 * timestamp — it shares a clock with `performance.now()`, which is what
 * the tap handlers read.
 */
import { PALETTE } from '../render/palette.js';
import { topChromeOverlapPx, bottomChromeOverlapPx } from '../render/pixel.js';
import { drawPlayScene } from '../render/playView.js';
import { shotFrame, makePlayCamera } from '../render/playCamera.js';
import { METER, newSwing, tapSwing, tickSwing, cursorAt } from '../play/swingMeter.js';
import { flightAt } from '../play/flight.js';
import {
  startHole, isFinished, defaultTarget, clampTarget, planShot, resolveStroke, applyStroke, reachFrom,
} from '../sim/playGolf.js';
import { greenSlope, slopeFraction } from '../sim/putting.js';
import { LIE } from '../sim/terrain.js';
import { headerLines, caddieLine, strokeLine, finishLine, meterHint } from './playCopy.js';

/** Internal canvas px a finger may wander and still count as a tap. */
const TAP_THRESHOLD_PX = 4;
/** How long a result line holds the screen before the next shot. */
const MESSAGE_MS = 1100;

/** Where a cursor value sits along the meter bar, 0–100. */
export function meterPercent(value) {
  const span = METER.MAX - METER.LATE_LIMIT;
  return Math.max(0, Math.min(100, ((value - METER.LATE_LIMIT) / span) * 100));
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .play-header {
      position: fixed; left: 0; right: 0; top: 0; z-index: 8;
      padding: 6px 10px; background: ${PALETTE.UI_DARK};
      border-bottom: 1px solid ${PALETTE.OUTLINE};
      font-family: monospace; font-size: 12px; line-height: 1.5; color: ${PALETTE.WHITE};
      pointer-events: none;
    }
    /* Rows wrap rather than clip: 'Hole 12 · Par 5 · 520y' beside a best
       score and a round tally does not fit one line of a narrow phone. */
    .play-header-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 8px; }
    .play-header-row > span { white-space: nowrap; }
    .play-header-row > span:last-child { color: ${PALETTE.ACCENT}; }
    .play-header-row + .play-header-row { color: ${PALETTE.UI_LIGHT}; }
    .play-dock {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 8;
      display: flex; flex-direction: column; gap: 6px; padding: 8px;
      background: ${PALETTE.UI_DARK}; border-top: 1px solid ${PALETTE.OUTLINE};
      font-family: monospace; color: ${PALETTE.WHITE}; pointer-events: auto;
    }
    .play-caddie { min-height: 18px; font-size: 13px; font-weight: bold; }
    .play-meter {
      position: relative; height: 20px; overflow: hidden;
      background: ${PALETTE.OUTLINE}; border: 1px solid ${PALETTE.UI_LIGHT}; border-radius: 3px;
    }
    .play-meter > div { position: absolute; top: 0; bottom: 0; }
    .play-meter-miss { left: 0; background: ${PALETTE.SAND_SHADOW}; opacity: 0.5; }
    .play-meter-over { right: 0; background: ${PALETTE.FOOD_RED}; opacity: 0.7; }
    .play-meter-window { background: ${PALETTE.ACCENT}; opacity: 0.25; }
    .play-meter-line { width: 2px; margin-left: -1px; background: ${PALETTE.WHITE}; }
    .play-meter-mark { width: 2px; margin-left: -1px; background: ${PALETTE.ACCENT}; }
    .play-meter-power { width: 2px; margin-left: -1px; background: ${PALETTE.FAIRWAY}; }
    .play-meter-cursor {
      width: 4px; margin-left: -2px; background: ${PALETTE.WHITE};
      box-shadow: 0 0 0 1px ${PALETTE.OUTLINE};
    }
    .play-buttons { display: flex; gap: 6px; min-height: 44px; align-items: stretch; }
    .play-hint { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13px; color: ${PALETTE.ACCENT}; }
    .play-btn {
      min-height: 44px; min-width: 64px; padding: 4px 12px;
      background: ${PALETTE.PATH}; color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.OUTLINE}; border-radius: 6px;
      font-family: monospace; font-size: 13px;
    }
    .play-btn--primary { flex: 1; background: ${PALETTE.FAIRWAY}; color: ${PALETTE.OUTLINE}; font-weight: bold; }
  `;
  document.head.appendChild(style);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Mounts the play screen for one hole.
 *
 *   hole, par, lengthYards   the hole and the two figures the header shows
 *   best                     the player's best here, or null
 *   weather                  { short, spread } for today
 *   round                    roundLine(...) for the holes already played this visit
 *   hasNext                  whether there is a built hole after this one
 *   topInsetPx               px to leave clear at the top when embedded (main.js knows)
 *   sfx                      chiptune.sfx (tok / splash / cheer); they mute themselves
 *   onFinish(play)           called once when the hole ends; returns
 *                            { isNewBest, best, round } for the finished display
 *   onNext / onReplay / onExit   the three ways out
 */
export function mountPlayHole({
  canvas, surface, container, hole, par, lengthYards, best = null, weather, round = '', hasNext = false,
  topInsetPx = 0, sfx, onFinish, onNext, onReplay, onExit,
}) {
  injectStyles();

  // --- DOM ---------------------------------------------------------------
  const headerEl = el('div', 'play-header');
  // Inside a host that draws its own bar over the top of the frame, top:0
  // is underneath it — the same allowance main.js makes for the HUD.
  headerEl.style.top = `${topInsetPx}px`;
  const titleRow = el('div', 'play-header-row');
  const titleEl = el('span');
  const rightEl = el('span');
  titleRow.append(titleEl, rightEl);
  const statusRow = el('div', 'play-header-row');
  const statusEl = el('span');
  const weatherEl = el('span');
  statusRow.append(statusEl, weatherEl);
  headerEl.append(titleRow, statusRow);

  const dockEl = el('div', 'play-dock');
  const caddieEl = el('div', 'play-caddie');
  const meterEl = el('div', 'play-meter');
  const missEl = el('div', 'play-meter-miss');
  const windowEl = el('div', 'play-meter-window');
  const overEl = el('div', 'play-meter-over');
  const lineEl = el('div', 'play-meter-line');
  const markEl = el('div', 'play-meter-mark');
  const powerEl = el('div', 'play-meter-power');
  const cursorEl = el('div', 'play-meter-cursor');
  // The static furniture of the bar, placed once from the meter's own constants.
  missEl.style.width = `${meterPercent(0)}%`;
  overEl.style.width = `${100 - meterPercent(1)}%`;
  windowEl.style.left = `${meterPercent(-METER.ACC_WINDOW)}%`;
  windowEl.style.width = `${meterPercent(METER.ACC_WINDOW) - meterPercent(-METER.ACC_WINDOW)}%`;
  lineEl.style.left = `${meterPercent(0)}%`;
  meterEl.append(missEl, windowEl, overEl, lineEl, markEl, powerEl, cursorEl);
  const buttonsEl = el('div', 'play-buttons');
  dockEl.append(caddieEl, meterEl, buttonsEl);
  container.append(headerEl, dockEl);

  // --- State -------------------------------------------------------------
  let play = startHole(hole);
  let phase = 'aim';
  let target = defaultTarget(hole, play);
  let swing = newSwing();
  let lastSwing = null;       // the finished swing of the stroke on screen
  let struckPlan = null;      // the plan that stroke was played to
  let outcome = null;
  let struckAt = 0;
  let messageUntil = 0;
  let line = '';              // result / finish line, shown in place of the caddie
  let bestNow = best;
  let roundNow = round;
  let viewRect = { x: 0, y: 0, width: surface.width, height: surface.height };
  let camera = null;
  let cameraKey = '';

  function remeasure() {
    const topPx = topChromeOverlapPx(canvas, headerEl, surface.scale);
    const bottomPx = bottomChromeOverlapPx(canvas, dockEl, surface.scale);
    viewRect = {
      x: 0, y: topPx, width: surface.width,
      height: Math.max(40, surface.height - topPx - bottomPx),
    };
  }

  // The camera is framed once per resting ball — not per frame, and not
  // while the target is dragged, or the ground would slide under the
  // finger that is aiming at it.
  function ensureCamera() {
    const key = `${viewRect.y}|${viewRect.height}|${play.strokes}|${play.ball.x}|${play.ball.y}|${play.lie}`;
    if (key === cameraKey && camera) return;
    cameraKey = key;
    camera = makePlayCamera(hole, viewRect, shotFrame(hole, play, defaultTarget(hole, play)));
  }

  function button(label, onClick, primary = false) {
    const btn = el('button', primary ? 'play-btn play-btn--primary' : 'play-btn', label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function updateHeader() {
    const h = headerLines({ hole, par, lengthYards, play, best: bestNow, weatherShort: weather.short, round: roundNow });
    titleEl.textContent = h.title;
    rightEl.textContent = h.right;
    statusEl.textContent = phase === 'finished' ? '' : h.status;
    weatherEl.textContent = h.weather;
  }

  function updateDock() {
    if (phase === 'aim') {
      caddieEl.textContent = caddieLine(planShot(hole, play, target));
      buttonsEl.replaceChildren(
        button('Swing', () => tap(performance.now()), true),
        button('Exit', () => onExit?.()),
      );
    } else if (phase === 'swing') {
      buttonsEl.replaceChildren(el('div', 'play-hint', meterHint(swing.phase)));
    } else if (phase === 'finished') {
      caddieEl.textContent = line;
      const buttons = [];
      if (hasNext) buttons.push(button('Next hole', () => onNext?.(), true));
      buttons.push(button('Replay', () => onReplay?.(), !hasNext));
      buttons.push(button('Done', () => onExit?.()));
      buttonsEl.replaceChildren(...buttons);
    } else {
      // flight, message
      caddieEl.textContent = line;
      buttonsEl.replaceChildren(el('div', 'play-hint', ''));
    }
    remeasure();
  }

  // --- Aiming ------------------------------------------------------------
  // Tap = put the target there. Drag = nudge the target by the drag, from
  // wherever the finger happens to be, so the finger never has to sit on
  // top of the thing being aimed.
  function clampToView(world) {
    const s = camera.toScreen(world);
    const x = Math.max(viewRect.x + 2, Math.min(viewRect.x + viewRect.width - 2, s.x));
    const y = Math.max(viewRect.y + 2, Math.min(viewRect.y + viewRect.height - 2, s.y));
    return clampTarget(hole, play, camera.toWorld({ x, y }));
  }

  let drag = null;
  function onPointerDown(evt) {
    if (phase !== 'aim' || !camera) return;
    const point = surface.toCanvasCoords(evt.clientX, evt.clientY);
    drag = { start: point, targetScreen: camera.toScreen(target), moved: false };
  }
  function onPointerMove(evt) {
    if (!drag || phase !== 'aim') return;
    const point = surface.toCanvasCoords(evt.clientX, evt.clientY);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < TAP_THRESHOLD_PX) return;
    drag.moved = true;
    target = clampToView(camera.toWorld({ x: drag.targetScreen.x + dx, y: drag.targetScreen.y + dy }));
    caddieEl.textContent = caddieLine(planShot(hole, play, target));
  }
  function onPointerUp() {
    if (!drag) return;
    if (!drag.moved && phase === 'aim') {
      target = clampToView(camera.toWorld(drag.start));
      caddieEl.textContent = caddieLine(planShot(hole, play, target));
    }
    drag = null;
  }

  // --- Swinging ----------------------------------------------------------
  function tap(now) {
    if (phase === 'aim') {
      swing = tapSwing(newSwing(), now);
      phase = 'swing';
      line = '';
      updateDock();
    } else if (phase === 'swing') {
      const before = swing.phase;
      swing = tapSwing(swing, now);
      if (swing.phase !== before) updateDock();
    }
  }
  // While a swing is running, a touch ANYWHERE is the tap — nobody should
  // have to find a button with their thumb while watching a cursor.
  function onAnyPointerDown(evt) {
    if (phase !== 'swing') return;
    evt.preventDefault();
    tap(performance.now());
  }
  function onKeyDown(evt) {
    if (evt.code !== 'Space' || evt.repeat) return;
    if (phase !== 'aim' && phase !== 'swing') return;
    evt.preventDefault();
    tap(performance.now());
  }

  function strike(now) {
    lastSwing = swing;
    struckPlan = planShot(hole, play, target);
    outcome = resolveStroke(hole, play, target, swing, weather.spread);
    struckAt = now;
    phase = 'flight';
    sfx?.tok();
    updateDock();
  }

  function land(now) {
    play = applyStroke(play, outcome);
    if (outcome.penalty === 'water') sfx?.splash();
    if (isFinished(play)) {
      phase = 'finished';
      const result = onFinish?.(play) ?? {};
      if (result.best !== undefined) bestNow = result.best;
      if (result.round !== undefined) roundNow = result.round;
      line = finishLine(play, par, Boolean(result.isNewBest));
      if (play.holed && play.strokes <= par) sfx?.cheer();
    } else {
      phase = 'message';
      messageUntil = now + MESSAGE_MS;
      line = strokeLine(hole, outcome, play, lastSwing);
    }
    updateHeader();
    updateDock();
  }

  function nextShot() {
    phase = 'aim';
    target = defaultTarget(hole, play);
    swing = newSwing();
    lastSwing = null;
    outcome = null;
    line = '';
    updateDock();
  }

  // --- The meter ---------------------------------------------------------
  function updateMeter(now) {
    const aiming = phase === 'aim' || phase === 'swing';
    const plan = aiming ? planShot(hole, play, target) : struckPlan;
    markEl.hidden = phase === 'finished' || !plan;
    if (plan) markEl.style.left = `${meterPercent(plan.needed)}%`;

    const shownSwing = phase === 'swing' ? swing : lastSwing;
    const hasPower = shownSwing && (shownSwing.phase === 'falling' || shownSwing.phase === 'done');
    powerEl.hidden = !hasPower || phase === 'finished';
    if (hasPower) powerEl.style.left = `${meterPercent(shownSwing.power)}%`;

    cursorEl.hidden = !shownSwing || phase === 'aim' || phase === 'finished';
    if (shownSwing) cursorEl.style.left = `${meterPercent(cursorAt(shownSwing, now))}%`;
  }

  // --- Frame -------------------------------------------------------------
  function render(ctx, rect, now) {
    if (phase === 'swing') {
      const before = swing.phase;
      swing = tickSwing(swing, now);
      if (swing.phase === 'done') strike(now);
      else if (swing.phase !== before) updateDock();
    }

    let ball = play.ball;
    let lift = 0;
    if (phase === 'flight') {
      const f = flightAt(outcome, now - struckAt);
      if (f.done) {
        land(now);
        ball = play.ball;
      } else {
        ball = f;
        lift = f.lift;
      }
    }
    if (phase === 'message' && now >= messageUntil) nextShot();

    ensureCamera();
    updateMeter(now);

    const putting = play.lie === LIE.GREEN && phase !== 'flight';
    drawPlayScene(ctx, rect.width, rect.height, {
      hole, viewRect, camera, ball, lift,
      target: phase === 'aim' || phase === 'swing' ? target : null,
      reachYards: play.lie === LIE.GREEN ? null : reachFrom(play.lie),
      slope: putting || (outcome && outcome.kind === 'putt') ? greenSlope(hole) : null,
      slopeFraction: slopeFraction(hole.greenPreset),
    });
  }

  function onResize() { remeasure(); }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointerdown', onAnyPointerDown, true);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  updateHeader();
  updateDock();

  function destroy() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointerdown', onAnyPointerDown, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    headerEl.remove();
    dockEl.remove();
  }

  return { render, destroy };
}
```

Two things in that code that look like mistakes and are not:

- **The Swing button and the "touch anywhere" listener do not double-count.** Pressing Swing fires `pointerdown` first (phase is still `aim`, so `onAnyPointerDown` ignores it) and `click` afterwards (which starts the swing). Only later touches arrive while `phase === 'swing'`.
- **`ensureCamera()` runs after `land()`** in the same frame, so the frame the ball lands on is already drawn with the new framing.

- [ ] **Step 4: Run** `node --test tests/playHole.test.js` — 1 passing. If the import fails with "document is not defined", something touches `document` at module load; only `injectStyles()` and `mountPlayHole()` may.
- [ ] **Step 5: Full suite (1062, 0 fail), commit.** Message: `Add the play screen: header, swing meter dock, aiming and the stroke state machine`.

---

### Task 5: The sixth screen and the wiring

**Files:** Modify `src/ui/screens.js`, `tests/ui.test.js`, `src/ui/editor.js`, `src/main.js`.

- [ ] **Step 1: Amend the screen contract, test first.** In `tests/ui.test.js` replace the first test:

```js
test('there are exactly the six documented screens', () => {
  assert.deepEqual(SCREEN_NAMES, ['start', 'overview', 'editor', 'play', 'playback', 'report']);
});
```
Run it — it fails. Then in `src/ui/screens.js`:

```js
/**
 * Six screens. It was five until the course became playable: every
 * feature before that fitted in a sheet over one of the five, and `play`
 * could not — it needs the canvas, the frame loop and the whole of the
 * player's attention. Adding a screen is still meant to be rare. A new
 * feature should have to argue its way past a sheet first.
 */
export const SCREEN_NAMES = Object.freeze(['start', 'overview', 'editor', 'play', 'playback', 'report']);
```
Run `node --test tests/ui.test.js` — passing. Then `grep -rn "five screens\|exactly five" src tests` and reword each hit (there is one in `src/main.js` near `narrationRoot.hidden`: change "a sixth screen would break the \"exactly five screens\" contract" to "a screen of its own is reserved for things that need the whole canvas — see screens.js").

- [ ] **Step 2: A Play button in the editor.** In `src/ui/editor.js`:

  1. Add `onPlay` to the destructured parameters of `mountHoleEditor`: `{ canvas, surface, container, state, hole, carts = false, sheetHost, onDone, onRebuild, onPlay }`.
  2. Add one sentence to the doc comment above it: "`onPlay`, when given, adds a Play button that hands the hole to the play screen; the caller tears this editor down and mounts a fresh one when the player comes back."
  3. In `renderToolbar()`, change the `toolbarEl.replaceChildren(...)` call so Play sits just before Done:

```js
    const playButton = onPlay ? [makeButton('Play', () => onPlay())] : [];

    toolbarEl.replaceChildren(
      ...hazardButtons,
      shrinkButton,
      growButton,
      makeButton('Width −', () => adjustCorridorWidth(-CORRIDOR_WIDTH_STEP)),
      makeButton('Width +', () => adjustCorridorWidth(CORRIDOR_WIDTH_STEP)),
      greenButton,
      rebuildButton,
      ...playButton,
      Object.assign(makeButton('Done', () => onDone?.()), { className: 'editor-btn editor-btn--done' })
    );
```
  Keep the existing minus signs in `'Width −'` exactly as they are in the file (copy the lines, do not retype them). Run `node --test tests/editor.test.js` — still passing.

- [ ] **Step 3: Wire `main.js`.** Add the imports beside the others:

```js
import { mountPlayHole } from './ui/playHole.js';
import { roundLine } from './ui/playCopy.js';
import { bestOn, recordPlay, parOf } from './sim/playGolf.js';
import { weatherOn, effectsOf } from './sim/weather.js';
```
(If `weatherOn`/`effectsOf` are already imported in `main.js`, do not import them twice.)

Beside `let activeEditor = null;` add:

```js
let activePlay = null;
// The holes played since the player last walked onto the course from the
// editor: [{ holeId, strokes, par }]. In memory only — it is a tally for
// the header, not a saved scorecard.
let playRound = [];
```

After `stopEditorLoop()` add:

```js
function stopPlay() {
  activePlay?.destroy();
  activePlay = null;
}

function nextOpenHoleAfter(holeId) {
  const ids = openHoles(state).map((h) => h.id).sort((a, b) => a - b);
  return ids.find((id) => id > holeId) ?? null;
}

/**
 * Puts the player on the tee of one of their own holes.
 *
 * Playing changes exactly one thing in the save — the best score on the
 * hole — and only when a better one is made, so `commitState` is called
 * for a new record and for nothing else.
 */
function openPlayFor(holeId, { fresh = false } = {}) {
  stopEditorLoop();
  stopPlay();
  if (fresh) playRound = [];
  const hole = state.resort.courses[0].holes.find((h) => h.id === holeId);
  const par = parOf(hole);
  const today = effectsOf(weatherOn(state.weatherSeed, state.day));
  const nextId = nextOpenHoleAfter(holeId);
  router.go('play');
  activePlay = mountPlayHole({
    canvas,
    surface,
    container: uiRoot,
    hole,
    par,
    lengthYards: holeStats(hole).length,
    best: bestOn(state, hole),
    weather: { short: today.short, spread: today.spread },
    round: roundLine(playRound),
    hasNext: nextId !== null,
    topInsetPx: embedded ? EMBEDDED_TOP_INSET : 0,
    sfx: chiptune.sfx,
    onFinish(play) {
      const next = recordPlay(state, hole, play);
      const isNewBest = next !== state;
      if (isNewBest) commitState(next);
      // Replaying a hole replaces its line on the card rather than adding one.
      playRound = playRound.filter((r) => r.holeId !== holeId);
      playRound.push({ holeId, strokes: play.strokes, par });
      return { isNewBest, best: bestOn(state, hole), round: roundLine(playRound) };
    },
    onNext: () => openPlayFor(nextId),
    onReplay: () => openPlayFor(holeId),
    onExit: () => {
      stopPlay();
      openEditorFor(holeId);
    },
  });
}
```

In `openEditorFor`, add to the object passed to `mountHoleEditor` (after `onRebuild`):

```js
    // A fresh round every time the player walks out from the editor.
    onPlay: () => openPlayFor(holeId, { fresh: true }),
```

In `syncScreenChrome()`, replace the `topChrome.style.display` line and its comment with:

```js
  // The HUD bar and amenity strip have nothing real to show before a game
  // state exists, and nothing that changes while a hole is being played —
  // and the play screen needs the room — so they are hidden for both.
  const onPlay = router.current === 'play';
  topChrome.style.display = onStart || onPlay ? 'none' : '';
```

In `frame(now)`, add a case after `'editor'`:

```js
    case 'play':
      activePlay?.render(surface.ctx, { x: 0, y: 0, width: surface.width, height: surface.height }, now);
      break;
```

- [ ] **Step 4: Guard the one way play could be left dangling.** Search `main.js` for every `router.go(`. Any place that can leave the `play` screen other than `onExit`/`onNext`/`onReplay` must call `stopPlay()` first. There should be none (the play dock is the only UI on that screen), but confirm by reading, and say what you found in the commit body.

- [ ] **Step 5: Full suite (1062, 0 fail), commit.** Message: `Make the course playable: a sixth screen, a Play button in the hole editor, and the wiring`.

---

### Task 6: Tell the player

**Files:** Modify `src/ui/changes.js`, `version.json`.

- [ ] **Step 1:** In `src/ui/changes.js` set `export const BUILD = '2026-11-16a';` and add a new first entry to `CHANGES`:

```js
  {
    version: '2026-11-16a',
    notes: [
      'You can play your own course. Open any hole and press Play: pick a target, then three taps — start the swing, set the power at the mark, and strike on the line. Early goes right, late goes left. On the green the same three taps roll the putt, and the little arrows show which way the green falls.',
      'It is there for fun and for finding out whether a hole you designed is any good. It costs nothing, earns nothing and passes no time. The game keeps your best score on each hole, and forgets it the moment you redesign the hole, because it is not the same hole any more.',
      'Since the last notes: guests are no longer marked down for playing the back nine, each building now pleases the crowd it was built for, and the Pricing preview shows exactly the day the game will run.',
    ],
  },
```
- [ ] **Step 2:** Set `version.json` to `{ "build": "2026-11-16a" }`.
- [ ] **Step 3:** `node --test tests/changes.test.js tests/copy.test.js` — passing. If `copy.test.js` objects to a word or a claim in the notes, reword the note; do not loosen the test.
- [ ] **Step 4: Full suite, commit.** Message: `Announce playable golf in the change notes and stamp build 2026-11-16a`.

---

### Task 7: Play it in the browser

Nothing so far has been seen. This task is the only evidence the screen works, so do every check and report what you saw, including what looked wrong.

- [ ] **Step 1: Start a preview.** Try `preview_start` with the server named in `.claude/launch.json`. If it does not come up (port 4173 has been taken by another app on this machine before), write this file in your scratchpad directory as `serve.mjs`, add a temporary launch entry that runs `node <scratchpad>/serve.mjs` on port 4317, and when you are finished revert the launch file with `git checkout -- .claude/launch.json` (that one file only).

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = 'C:/Users/bkami/Desktop/AI Tools/CourseTycoon';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path || 'index.html'));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path || '.html')] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(4317);
```

- [ ] **Step 2: Get onto a tee.** `resize_window` to the mobile preset and reload. Start a new game, tap a built hole on the overview to open the editor, confirm a **Play** button sits before **Done**, press it. `read_console_messages` with `onlyErrors: true` must be empty.

- [ ] **Step 3: Check each of these and screenshot the ones marked 📷.**

  1. 📷 **Aim view.** Header shows `Hole N · Par P · Ly` and `Stroke 1 · …y · Tee` with the weather on the right; the HUD bar and amenity strip are gone. The hole is drawn between header and dock with no part hidden under either. A white ball sits on the tee, a yellow crosshair down the fairway, a dotted line between them, a dotted reach ring. The dock says `Driver · 250y` on a par 4 or 5.
  2. **Tap to aim.** Click a spot on the fairway: the crosshair jumps there and the club/yardage changes. Drag: the crosshair moves by the drag, not to the pointer. Drag far past the ring: it stops at the ring.
  3. 📷 **The meter.** Press Space (or Swing). The cursor climbs; the hint reads `Tap at the mark`. Press Space again near the yellow mark: a green tick is left at the power, the cursor runs back, the hint reads `Tap on the line`. Press Space near the white line. The ball flies in an arc with its shadow on the ground, a result line appears, and about a second later the next shot is set up with the camera reframed.
  4. **Let it run out.** Start a swing and touch nothing: the cursor tops out, comes back, runs off the left end, and the ball goes a long way left. No errors.
  5. **Bad lies.** Aim deliberately into a bunker and hit it: the result line says `In the bunker.`, the header lie reads `Bunker`, and the reach ring is visibly smaller for the next shot.
  6. **Water**, on a hole that has a pond (build `Par 3 over water` on an empty plot if needed — it costs money, so do it in a throwaway game): hit into it. The line reads `In the water. One-stroke penalty — play it again.`, the ball is back where it was hit from, and the stroke counter has gone up by two.
  7. 📷 **Putting.** Reach the green. The camera closes in until the green fills the width; slope arrows are visible and do not sit on the cup; the flag is small; the dock says `Putter · N ft`. Putt: the ball rolls and slows, with no arc, and curves the way the arrows point.
  8. 📷 **Finished.** Hole out (or reach 12 strokes). The dock shows the finish line (`Bogey — 5 on a par 4. New best.`) and buttons `Next hole`, `Replay`, `Done`. The header's right side now shows `Best N · Round: … thru 1`.
  9. **Next hole** tees up the next built hole with the round tally carried over. **Replay** tees up the same hole; finishing it again does not add a second line to the round (`thru` does not increase).
  10. **Done** returns to the editor for the hole you were on; **Done** there returns to the overview with the HUD back.
  11. **The record persists.** Reload the page, continue the game, open the same hole, press Play: `Best N` is in the header. Then go back to the editor, add a bunker, press Play again: `Best` is gone.
  12. **Nothing else moved.** Money, day and prestige in the HUD are the same before and after playing (apart from anything you built in the editor).
  13. **Desktop size.** `resize_window` to the desktop preset, reload, play one stroke: layout still clear of header and dock.

- [ ] **Step 4: Fix what is broken** in the four files this plan created or the wiring in `main.js`/`editor.js`. If the fix would mean changing `playGolf.js`, `putting.js`, `swingMeter.js` or `playCamera.js`, stop and report it instead.

  Known rough edges that are **accepted** and should be reported, not fixed: fairway mowing stripes and tree sprites look chunkier when zoomed in; the ball can fly out of view on a wild shot (the camera catches up when it lands).

- [ ] **Step 5: Final suite, final commit** if Step 4 changed anything. Then stop the preview server, revert `.claude/launch.json` if you changed it, and confirm `git status` is clean.

- [ ] **Step 6: Report** — what works, what you fixed, what looks rough, the test total, and the list of commits. Remind the user that the commits are local and need pushing from GitHub Desktop.

---

## Self-check before you say you are done

- `node --test` → 0 failures, about 1062 tests.
- `grep -rn "#[0-9A-Fa-f]\{6\}" src/ui/playHole.js src/render/playView.js src/ui/playCopy.js src/play/flight.js` → no output (no raw hex).
- `git diff 9f1a3d3 --stat -- src/sim/playGolf.js src/sim/putting.js src/play/swingMeter.js src/render/playCamera.js` → no output (the core is untouched).
- `git status` → clean. Nothing pushed.

---

## What is left (start here)

**Checked in a running page**, at phone size (375×812) and at a small desktop size, by
driving the game with scripted input and reading the page and the canvas back:

- The Play button sits before Done in the editor; pressing it shows the header, the
  dock and the hole, with the HUD hidden and nothing drawn under either bar.
- A full stroke: Swing → `Tap at the mark` → power tick → `Tap on the line` → the ball
  flies → `Perfect strike. On the green, 18 feet.` → the camera closes in on the green
  → `Putter · 18 ft`.
- Holing out: `Par — 3 on a par 3. New best.` with Next hole / Replay / Done, and the
  header reading `Best 3 · Round: E thru 1`.
- Replay does not add a second line to the round. Next hole carries the tally. The last
  built hole offers no Next hole.
- A swing left to run out is a full overswing and a full miss, and lands in the trees;
  the next shot is clubbed for the shorter reach from there.
- Done returns to the editor and then the overview with the HUD back; money, day and
  prestige unchanged.
- The best score survives a reload, and is gone after adding a bunker to the hole.
- No console errors at any point.

**Not checked, because it needs a person or a visible browser:**

1. **Nobody has seen the header, the meter or the buttons.** The preview pane was
   hidden, so screenshots were not possible; the canvas was captured directly (and looks
   right), but the DOM chrome was only measured, never looked at. First job: open the
   game, press Play, and look. Fix anything ugly in the CSS in `src/ui/playHole.js`.
2. **Feel.** The constants assume a person taps to within about 35 ms. Play nine holes
   on a phone. If par is out of reach, raise `METER.ACC_WINDOW` in
   `src/play/swingMeter.js` (0.08 → 0.10) and re-run `node tools/playGolfBot.js`; the
   three calibration tests in `tests/playGolf.test.js` will need their bounds moved to
   match, with the new table pasted into the bot's header comment.
3. **Touch.** Tap-to-aim and drag-to-nudge were exercised with synthetic events, not a
   finger. Check that dragging on the canvas does not scroll the page on iOS.
4. **Water and bunkers in the page.** Both are unit-tested; neither was hit on purpose
   in the browser run. Checks 5 and 6 of Task 7 still apply.
5. **Sound.** `tok`, `splash` and `cheer` are called; nobody has listened.
6. **Putting readability.** The slope arrows are small. If they are not readable on a
   phone, lengthen them in `drawSlopeArrows` (`src/render/playView.js`).

Ideas beyond this version are in §12 of the spec.
