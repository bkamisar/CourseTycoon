# Course Tycoon — Act I Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete headless simulation for Act I — a golf resort you can run seasons through from the command line, with no rendering, no UI, and no browser.

**Architecture:** Pure functions over plain data, seeded for determinism. `runDay(state, seed)` returns the next state, an evening report, and a timeline of timestamped events that a renderer will later play back. Nothing in `src/sim/` may import from `src/render/`, `src/ui/`, or touch `document`, `window`, `canvas`, `Date.now()` or `Math.random()`.

**Tech Stack:** Plain ES modules. Node's built-in test runner (`node --test`). Zero dependencies, no build step — the same files run under Node and load directly in a browser.

**Spec:** `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md`

**Commits:** End every commit message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, matching the model executing this plan. Never run `git push`, `git fetch` or `git pull` — the user pushes via GitHub Desktop.

---

## File Structure

All paths relative to the repository root.

| File | Responsibility |
|---|---|
| `package.json` | Declares `"type": "module"` so Node treats `.js` as ESM |
| `src/sim/rng.js` | Seeded PRNG: uniform, normal, integer, pick |
| `src/sim/geometry.js` | Corridor path maths: arc length, point at distance, distance from point to path |
| `src/sim/templates.js` | Par 3/4/5 archetype definitions that populate a hole |
| `src/sim/hole.js` | Hole factory from a template; all derived statistics |
| `src/sim/terrain.js` | Classifies any point on a hole as fairway/rough/sand/water/trees/green |
| `src/sim/golfer.js` | Generates guests from prestige and green fee |
| `src/sim/shot.js` | Single shot resolution, and putting |
| `src/sim/round.js` | One group plays one hole: strokes, minutes, events |
| `src/sim/schedule.js` | Tee sheet and flow-shop queueing across nine holes |
| `src/sim/economy.js` | Demand, revenue, costs |
| `src/sim/satisfaction.js` | Guest satisfaction and complaint generation |
| `src/sim/ratings.js` | Course rating, prestige, pace |
| `src/sim/acts.js` | Act gate conditions |
| `src/sim/state.js` | `GameState` factory and the starting resort |
| `src/sim/day.js` | `runDay()` — orchestration and timeline emission |
| `tools/balance.js` | Headless multi-seed balance harness |
| `tests/*.test.js` | One test file per module above |

**Units used throughout:** distances in **yards**, times in **minutes**, money in **whole dollars**, ratings on **0–100**. Hole coordinates are `{x, y}` in yards on a flat plane; `x` is lateral, `y` runs tee-to-green. These units never change between modules — a function taking feet or seconds is a bug.

---

## Task 1: Project skeleton and a working test runner

**Files:**
- Create: `package.json`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Verify Node is present and new enough**

Run: `node --version`
Expected: `v18.0.0` or higher. Node's built-in test runner does not exist before v18. If this fails or prints an older version, stop and tell the user — do not install anything.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "course-tycoon",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "An 8-bit golf resort management game",
  "scripts": {
    "test": "node --test",
    "balance": "node tools/balance.js"
  }
}
```

The `"type": "module"` line is load-bearing: without it Node treats `.js` as CommonJS and every `import` in this plan fails.

- [ ] **Step 3: Write a smoke test**

```js
// tests/smoke.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the test runner works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: PASS, `1 passing`.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/smoke.test.js
git commit -m "Set up ES module project with Node's built-in test runner

Zero dependencies and no build step, so the same source files run under
Node for tests and load directly in a browser.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Seeded random number generator

Determinism is the foundation of everything else — balance tuning and reliable tests both depend on the same seed producing the same day.

**Files:**
- Create: `src/sim/rng.js`
- Test: `tests/rng.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/rng.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';

test('same seed produces the same sequence', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const seqA = [a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next()];
  assert.deepEqual(seqA, seqB);
});

test('different seeds produce different sequences', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  assert.notEqual(a.next(), b.next());
});

test('next() stays within [0, 1)', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('normal() has roughly the requested mean and deviation', () => {
  const rng = makeRng(99);
  const samples = [];
  for (let i = 0; i < 20000; i++) samples.push(rng.normal(100, 15));
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const variance =
    samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
  assert.ok(Math.abs(mean - 100) < 1, `mean was ${mean}`);
  assert.ok(Math.abs(Math.sqrt(variance) - 15) < 1, `sd was ${Math.sqrt(variance)}`);
});

test('int(n) returns integers in [0, n)', () => {
  const rng = makeRng(3);
  for (let i = 0; i < 500; i++) {
    const v = rng.int(5);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 5, `bad int: ${v}`);
  }
});

test('pick returns a member of the array', () => {
  const rng = makeRng(11);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(rng.pick(arr)));
});

test('chance(p) is deterministic and roughly correct', () => {
  const rng = makeRng(5);
  let hits = 0;
  for (let i = 0; i < 10000; i++) if (rng.chance(0.3)) hits++;
  assert.ok(Math.abs(hits / 10000 - 0.3) < 0.02, `rate was ${hits / 10000}`);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/rng.test.js`
Expected: FAIL — `Cannot find module '../src/sim/rng.js'`.

- [ ] **Step 3: Implement**

```js
// src/sim/rng.js

/**
 * Seeded pseudo-random generator (mulberry32).
 * Every random draw in the simulation must come from one of these —
 * Math.random() anywhere in src/sim/ breaks determinism and is a bug.
 */
export function makeRng(seed) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Box-Muller transform. */
    normal(mean = 0, sd = 1) {
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + z * sd;
    },
    int(n) {
      return Math.floor(next() * n);
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/rng.test.js`
Expected: PASS, 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.js tests/rng.test.js
git commit -m "Add seeded random generator underpinning simulation determinism

Mulberry32 with uniform, normal, integer, pick and chance draws. Every
random value in the simulation comes from here so that a given state and
seed always produce an identical day, which is what makes balance tuning
reproducible and the tests reliable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Corridor geometry

A hole's fairway is generated from its centreline rather than stored, so everything downstream needs path maths.

**Files:**
- Create: `src/sim/geometry.js`
- Test: `tests/geometry.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/geometry.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathLength, pointAtDistance, distanceToPath } from '../src/sim/geometry.js';

const straight = [{ x: 0, y: 0 }, { x: 0, y: 400 }];
const dogleg = [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 60, y: 380 }];

test('pathLength measures a straight corridor', () => {
  assert.equal(pathLength(straight), 400);
});

test('pathLength sums dogleg segments', () => {
  const expected = 200 + Math.hypot(60, 180);
  assert.ok(Math.abs(pathLength(dogleg) - expected) < 0.001);
});

test('pointAtDistance walks along the path', () => {
  const p = pointAtDistance(straight, 100);
  assert.ok(Math.abs(p.x - 0) < 0.001);
  assert.ok(Math.abs(p.y - 100) < 0.001);
});

test('pointAtDistance past the end clamps to the final point', () => {
  const p = pointAtDistance(straight, 9999);
  assert.deepEqual(p, { x: 0, y: 400 });
});

test('pointAtDistance before the start clamps to the first point', () => {
  const p = pointAtDistance(straight, -50);
  assert.deepEqual(p, { x: 0, y: 0 });
});

test('pointAtDistance crosses into the second segment of a dogleg', () => {
  const p = pointAtDistance(dogleg, 200);
  assert.ok(Math.abs(p.x - 0) < 0.001);
  assert.ok(Math.abs(p.y - 200) < 0.001);
});

test('distanceToPath is zero on the line', () => {
  assert.ok(distanceToPath(straight, { x: 0, y: 150 }) < 0.001);
});

test('distanceToPath measures lateral offset', () => {
  assert.ok(Math.abs(distanceToPath(straight, { x: 25, y: 150 }) - 25) < 0.001);
});

test('distanceToPath handles points beyond a segment end', () => {
  // Level with the tee but 30 yards left: nearest path point is the tee itself.
  assert.ok(Math.abs(distanceToPath(straight, { x: 30, y: -0 }) - 30) < 0.001);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/geometry.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/geometry.js

/** Total arc length of a polyline, in yards. */
export function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

/** The point `distance` yards along the polyline, clamped at both ends. */
export function pointAtDistance(path, distance) {
  if (distance <= 0) return { ...path[0] };
  let remaining = distance;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const segment = Math.hypot(dx, dy);
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment;
      return { x: path[i - 1].x + dx * t, y: path[i - 1].y + dy * t };
    }
    remaining -= segment;
  }
  return { ...path[path.length - 1] };
}

/** Shortest distance from a point to the polyline, in yards. */
export function distanceToPath(path, point) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    best = Math.min(best, distanceToSegment(path[i - 1], path[i], point));
  }
  return best;
}

function distanceToSegment(a, b, p) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Projection parameter, clamped to the segment.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/geometry.test.js`
Expected: PASS, 9 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/geometry.js tests/geometry.test.js
git commit -m "Add corridor geometry for hole centrelines

Arc length, point-at-distance and point-to-path distance over a polyline.
Fairway and rough are generated from the corridor rather than stored, so
terrain classification and shot resolution both depend on these.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Hole templates and the hole factory

**Files:**
- Create: `src/sim/templates.js`
- Create: `src/sim/hole.js`
- Test: `tests/hole.test.js`

- [ ] **Step 1: Write `src/sim/templates.js`**

This is data, not logic, so it needs no test of its own — Task 4's tests exercise it through `makeHole`.

```js
// src/sim/templates.js

/**
 * Act I hole archetypes. Each populates the same shape the eventual
 * freehand editor will produce, so adding that editor needs no rework.
 * Coordinates are yards; y runs tee-to-green.
 */
export const TEMPLATES = {
  shortPar3: {
    name: 'Short par 3',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 155 }],
    corridorWidth: 34,
    greenPreset: 'small',
    features: [
      { type: 'bunker', x: -16, y: 142, size: 9 },
      { type: 'bunker', x: 15, y: 138, size: 8 },
    ],
  },
  waterPar3: {
    name: 'Par 3 over water',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 178 }],
    corridorWidth: 30,
    greenPreset: 'elevated',
    features: [
      { type: 'pond', x: 0, y: 120, size: 34 },
      { type: 'bunker', x: 18, y: 168, size: 8 },
    ],
  },
  straightPar4: {
    name: 'Straight par 4',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 390 }],
    corridorWidth: 44,
    greenPreset: 'large',
    features: [
      { type: 'bunker', x: -24, y: 250, size: 11 },
      { type: 'trees', x: 34, y: 200, size: 20 },
      { type: 'bunker', x: 17, y: 374, size: 9 },
    ],
  },
  doglegPar4: {
    name: 'Dogleg right par 4',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 210 }, { x: 70, y: 395 }],
    corridorWidth: 40,
    greenPreset: 'tiered',
    features: [
      { type: 'trees', x: 40, y: 170, size: 26 },
      { type: 'bunker', x: 52, y: 300, size: 12 },
      { type: 'bunker', x: 88, y: 386, size: 9 },
    ],
  },
  longPar5: {
    name: 'Long par 5',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 260 }, { x: -55, y: 520 }],
    corridorWidth: 46,
    greenPreset: 'large',
    features: [
      { type: 'bunker', x: -22, y: 240, size: 12 },
      { type: 'pond', x: -70, y: 430, size: 30 },
      { type: 'trees', x: 30, y: 330, size: 24 },
    ],
  },
  reachablePar5: {
    name: 'Reachable par 5',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 480 }],
    corridorWidth: 50,
    greenPreset: 'small',
    features: [
      { type: 'pond', x: 26, y: 440, size: 26 },
      { type: 'bunker', x: -20, y: 300, size: 10 },
    ],
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/hole.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole, holeStats } from '../src/sim/hole.js';

test('makeHole copies the template without sharing references', () => {
  const a = makeHole('straightPar4', 1);
  const b = makeHole('straightPar4', 2);
  a.features[0].x = 999;
  assert.notEqual(b.features[0].x, 999, 'templates must not be shared by reference');
});

test('makeHole sets id and tee at the corridor start', () => {
  const hole = makeHole('straightPar4', 3);
  assert.equal(hole.id, 3);
  assert.deepEqual(hole.teePos, { x: 0, y: 0 });
});

test('unknown template throws rather than returning something broken', () => {
  assert.throws(() => makeHole('noSuchHole', 1), /unknown template/i);
});

test('length is derived from the corridor', () => {
  const hole = makeHole('straightPar4', 1);
  assert.ok(Math.abs(holeStats(hole).length - 390) < 1);
});

test('par is derived from length', () => {
  assert.equal(holeStats(makeHole('shortPar3', 1)).par, 3);
  assert.equal(holeStats(makeHole('straightPar4', 1)).par, 4);
  assert.equal(holeStats(makeHole('longPar5', 1)).par, 5);
});

test('adding bunkers raises difficulty and upkeep', () => {
  const plain = makeHole('straightPar4', 1);
  const loaded = makeHole('straightPar4', 1);
  loaded.features.push({ type: 'bunker', x: -10, y: 300, size: 10 });
  const a = holeStats(plain);
  const b = holeStats(loaded);
  assert.ok(b.difficulty > a.difficulty);
  assert.ok(b.upkeep > a.upkeep);
});

test('adding water raises scenery and upkeep more than a bunker does', () => {
  const base = holeStats(makeHole('straightPar4', 1));
  const watered = makeHole('straightPar4', 1);
  watered.features.push({ type: 'pond', x: -30, y: 300, size: 25 });
  const after = holeStats(watered);
  assert.ok(after.scenery > base.scenery);
  assert.ok(after.upkeep - base.upkeep >= 30);
});

test('narrowing the corridor raises difficulty', () => {
  const wide = makeHole('straightPar4', 1);
  const narrow = makeHole('straightPar4', 1);
  narrow.corridorWidth = 24;
  assert.ok(holeStats(narrow).difficulty > holeStats(wide).difficulty);
});

test('all derived stats stay within their documented ranges', () => {
  for (const name of ['shortPar3', 'waterPar3', 'straightPar4', 'doglegPar4', 'longPar5', 'reachablePar5']) {
    const s = holeStats(makeHole(name, 1));
    assert.ok(s.difficulty >= 0 && s.difficulty <= 100, `${name} difficulty ${s.difficulty}`);
    assert.ok(s.scenery >= 0 && s.scenery <= 100, `${name} scenery ${s.scenery}`);
    assert.ok(s.par >= 3 && s.par <= 5, `${name} par ${s.par}`);
    assert.ok(s.upkeep > 0, `${name} upkeep ${s.upkeep}`);
  }
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node --test tests/hole.test.js`
Expected: FAIL — `Cannot find module '../src/sim/hole.js'`.

- [ ] **Step 4: Implement**

```js
// src/sim/hole.js
import { TEMPLATES } from './templates.js';
import { pathLength, pointAtDistance, distanceToPath } from './geometry.js';

/** Daily upkeep in dollars, per §8.3 of the spec. */
const UPKEEP_BASE = 40;
const UPKEEP_PER_BUNKER = 15;
const UPKEEP_PER_POND = 30;

/** Relative putting difficulty by green preset. */
export const GREEN_DIFFICULTY = {
  small: 1.15,
  large: 0.85,
  tiered: 1.3,
  elevated: 1.1,
  island: 1.25,
};

export function makeHole(templateName, id) {
  const template = TEMPLATES[templateName];
  if (!template) throw new Error(`unknown template: ${templateName}`);
  return {
    id,
    template: templateName,
    // structuredClone keeps templates immutable across holes.
    corridor: structuredClone(template.corridor),
    corridorWidth: template.corridorWidth,
    greenPreset: template.greenPreset,
    features: structuredClone(template.features),
    teePos: { ...template.corridor[0] },
  };
}

/** Centre of the green: the far end of the corridor. */
export function greenCentre(hole) {
  return { ...hole.corridor[hole.corridor.length - 1] };
}

/**
 * Every statistic shown in the editor is derived here, never stored.
 * Expected playing minutes is NOT included — that comes from simulating
 * a representative group (see round.js), because it depends on how the
 * hole actually plays rather than on a formula over its parts.
 */
export function holeStats(hole) {
  const length = pathLength(hole.corridor);
  const bunkers = hole.features.filter((f) => f.type === 'bunker');
  const ponds = hole.features.filter((f) => f.type === 'pond');
  const trees = hole.features.filter((f) => f.type === 'trees');

  return {
    length,
    par: parFor(length),
    difficulty: difficultyOf(hole, length, bunkers, ponds, trees),
    scenery: sceneryOf(ponds, trees),
    upkeep:
      UPKEEP_BASE +
      bunkers.length * UPKEEP_PER_BUNKER +
      ponds.length * UPKEEP_PER_POND,
  };
}

function parFor(length) {
  if (length < 260) return 3;
  if (length < 470) return 4;
  return 5;
}

function difficultyOf(hole, length, bunkers, ponds, trees) {
  // Narrow corridors punish dispersion most, so width dominates.
  const widthPenalty = clamp((46 - hole.corridorWidth) * 1.6, -10, 40);

  // Hazards matter in proportion to how close they sit to the corridor —
  // a pond 80 yards offline is scenery, not a hazard.
  const hazardPressure = [...bunkers, ...ponds].reduce((sum, f) => {
    const offline = distanceToPath(hole.corridor, { x: f.x, y: f.y });
    const reach = hole.corridorWidth / 2 + f.size;
    return sum + (offline < reach ? (f.type === 'pond' ? 9 : 5) : 1.5);
  }, 0);

  const treePressure = trees.reduce((sum, f) => {
    const offline = distanceToPath(hole.corridor, { x: f.x, y: f.y });
    return sum + (offline < hole.corridorWidth / 2 + f.size ? 4 : 1);
  }, 0);

  const lengthPressure = clamp((length - 330) / 12, -8, 20);
  const greenPressure = (GREEN_DIFFICULTY[hole.greenPreset] - 1) * 30;

  return clamp(
    20 + widthPenalty + hazardPressure + treePressure + lengthPressure + greenPressure,
    0,
    100
  );
}

function sceneryOf(ponds, trees) {
  // Diminishing returns: the second pond adds less than the first.
  const water = 22 * Math.sqrt(ponds.length);
  const wood = 12 * Math.sqrt(trees.length);
  return clamp(30 + water + wood, 0, 100);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export { pointAtDistance };
```

- [ ] **Step 5: Run to verify they pass**

Run: `node --test tests/hole.test.js`
Expected: PASS, 9 passing.

- [ ] **Step 6: Commit**

```bash
git add src/sim/templates.js src/sim/hole.js tests/hole.test.js
git commit -m "Add hole templates and derived hole statistics

Six Act I archetypes populate the same corridor-and-features shape the
later freehand editor will produce, so adding that editor needs no
rework. Length, par, difficulty, scenery and upkeep are all derived from
the corridor and feature list rather than stored, which is what lets the
editor show the cost of a change as the player makes it.

Hazards count toward difficulty in proportion to how close they sit to
the corridor - a pond well offline is scenery, not a hazard.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Terrain classification

**Files:**
- Create: `src/sim/terrain.js`
- Test: `tests/terrain.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/terrain.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole } from '../src/sim/hole.js';
import { lieAt, LIE } from '../src/sim/terrain.js';

const hole = makeHole('straightPar4', 1); // corridor x=0, y=0..390, width 44

test('a point on the centreline is fairway', () => {
  assert.equal(lieAt(hole, { x: 0, y: 200 }), LIE.FAIRWAY);
});

test('just outside the corridor is rough', () => {
  // y=100 sits clear of the tree clump at (34, 200).
  assert.equal(lieAt(hole, { x: 26, y: 100 }), LIE.ROUGH);
});

test('far offline is trees', () => {
  assert.equal(lieAt(hole, { x: 90, y: 200 }), LIE.TREES);
});

test('inside a bunker is sand', () => {
  // straightPar4 has a bunker at (-24, 250) size 11.
  assert.equal(lieAt(hole, { x: -24, y: 250 }), LIE.SAND);
});

test('inside a pond is water', () => {
  const watered = makeHole('waterPar3', 1); // pond at (0,120) size 34
  assert.equal(lieAt(watered, { x: 0, y: 120 }), LIE.WATER);
});

test('a tree clump gives a trees lie even inside the corridor band', () => {
  // straightPar4 has trees at (34, 200) size 20.
  assert.equal(lieAt(hole, { x: 34, y: 200 }), LIE.TREES);
});

test('near the green centre is green', () => {
  assert.equal(lieAt(hole, { x: 0, y: 388 }), LIE.GREEN);
});

test('water beats green when a pond overlaps the green edge', () => {
  const h = makeHole('straightPar4', 1);
  h.features.push({ type: 'pond', x: 0, y: 388, size: 12 });
  assert.equal(lieAt(h, { x: 0, y: 388 }), LIE.WATER);
});

test('greenRadius scales with the preset', () => {
  const small = makeHole('shortPar3', 1);   // small green
  const large = makeHole('straightPar4', 1); // large green
  // A point 14 yards from centre is on the large green but off the small one.
  assert.equal(lieAt(large, { x: 14, y: 390 }), LIE.GREEN);
  assert.notEqual(lieAt(small, { x: 14, y: 155 }), LIE.GREEN);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/terrain.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/terrain.js
import { distanceToPath } from './geometry.js';
import { greenCentre } from './hole.js';

export const LIE = {
  TEE: 'tee',
  FAIRWAY: 'fairway',
  ROUGH: 'rough',
  SAND: 'sand',
  WATER: 'water',
  TREES: 'trees',
  GREEN: 'green',
};

/** Green radius in yards by preset. */
const GREEN_RADIUS = {
  small: 11,
  large: 16,
  tiered: 14,
  elevated: 12,
  island: 12,
};

export function greenRadius(hole) {
  return GREEN_RADIUS[hole.greenPreset] ?? 13;
}

/**
 * Classifies a landing point. Order matters: water drowns everything,
 * then sand, then trees, then the green, then the corridor bands.
 */
export function lieAt(hole, point) {
  for (const f of hole.features) {
    if (f.type === 'pond' && within(f, point)) return LIE.WATER;
  }
  for (const f of hole.features) {
    if (f.type === 'bunker' && within(f, point)) return LIE.SAND;
  }
  for (const f of hole.features) {
    if (f.type === 'trees' && within(f, point)) return LIE.TREES;
  }

  const centre = greenCentre(hole);
  if (Math.hypot(point.x - centre.x, point.y - centre.y) <= greenRadius(hole)) {
    return LIE.GREEN;
  }

  const offline = distanceToPath(hole.corridor, point);
  if (offline <= hole.corridorWidth / 2) return LIE.FAIRWAY;
  if (offline <= hole.corridorWidth / 2 + 22) return LIE.ROUGH;
  return LIE.TREES;
}

function within(feature, point) {
  return Math.hypot(point.x - feature.x, point.y - feature.y) <= feature.size;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/terrain.test.js`
Expected: PASS, 9 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/terrain.js tests/terrain.test.js
git commit -m "Add terrain classification for shot landing points

Classifies any point as water, sand, trees, green, fairway or rough by
testing features first and then distance from the corridor centreline.
Hazards are checked in a deliberate order so an overlapping pond drowns
a green rather than the other way round.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Guest generation

**Files:**
- Create: `src/sim/golfer.js`
- Test: `tests/golfer.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/golfer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeGuest, makeGroup } from '../src/sim/golfer.js';

test('a guest has every field the spec requires', () => {
  const g = makeGuest(makeRng(1), { prestige: 40, greenFee: 45 });
  for (const key of ['id', 'name', 'handicap', 'wallet', 'patience', 'energy', 'satisfaction', 'stayNights', 'nightsRemaining', 'zonePreference']) {
    assert.ok(key in g, `missing field: ${key}`);
  }
});

test('stayNights is always 1 in Act I', () => {
  const rng = makeRng(2);
  for (let i = 0; i < 50; i++) {
    assert.equal(makeGuest(rng, { prestige: 60, greenFee: 80 }).stayNights, 1);
  }
});

test('patience and energy start full', () => {
  const g = makeGuest(makeRng(3), { prestige: 40, greenFee: 45 });
  assert.equal(g.patience, 100);
  assert.equal(g.energy, 100);
});

test('handicaps stay within 0 and 36', () => {
  const rng = makeRng(4);
  for (let i = 0; i < 500; i++) {
    const h = makeGuest(rng, { prestige: 50, greenFee: 60 }).handicap;
    assert.ok(h >= 0 && h <= 36, `handicap out of range: ${h}`);
  }
});

test('higher prestige attracts better golfers on average', () => {
  const low = averageHandicap({ prestige: 10, greenFee: 30 });
  const high = averageHandicap({ prestige: 90, greenFee: 30 });
  assert.ok(high < low - 1.5, `low ${low} vs high ${high}`);
});

test('higher green fees attract deeper wallets on average', () => {
  const cheap = averageWallet({ prestige: 50, greenFee: 30 });
  const dear = averageWallet({ prestige: 50, greenFee: 120 });
  assert.ok(dear > cheap, `cheap ${cheap} vs dear ${dear}`);
});

test('makeGroup returns four guests with unique ids', () => {
  const group = makeGroup(makeRng(9), { prestige: 40, greenFee: 45 }, 7);
  assert.equal(group.guests.length, 4);
  assert.equal(group.id, 7);
  assert.equal(new Set(group.guests.map((g) => g.id)).size, 4);
});

function averageHandicap(conditions) {
  const rng = makeRng(77);
  let total = 0;
  for (let i = 0; i < 400; i++) total += makeGuest(rng, conditions).handicap;
  return total / 400;
}

function averageWallet(conditions) {
  const rng = makeRng(78);
  let total = 0;
  for (let i = 0; i < 400; i++) total += makeGuest(rng, conditions).wallet;
  return total / 400;
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/golfer.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/golfer.js
import { clamp } from './hole.js';

const FIRST = ['Dana', 'Marcus', 'Priya', 'Tom', 'Elise', 'Gus', 'Nora', 'Wes',
  'Iris', 'Cal', 'Ruth', 'Otto', 'Jean', 'Hal', 'Mara', 'Vic'];
const LAST = ['Boyle', 'Nakamura', 'Okafor', 'Reyes', 'Lindqvist', 'Ashby',
  'Duval', 'Moreno', 'Kelleher', 'Sandoval', 'Pike', 'Vance'];

let nextId = 1;
/** Test hook — keeps guest ids deterministic across runs. */
export function resetGuestIds() {
  nextId = 1;
}

/**
 * Prestige pulls the handicap distribution down (better players) and the
 * green fee pulls wallets up. Both are gentle: a resort never draws only
 * one kind of golfer.
 */
export function makeGuest(rng, { prestige, greenFee }) {
  const handicapMean = 20 - (prestige / 100) * 9;
  const handicap = clamp(Math.round(rng.normal(handicapMean, 7)), 0, 36);
  const wallet = Math.round(clamp(rng.normal(greenFee * 1.45 + 25, greenFee * 0.4), 15, 900));

  return {
    id: nextId++,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    handicap,
    wallet,
    patience: 100,
    energy: 100,
    satisfaction: 50,
    stayNights: 1,        // Act II varies this
    nightsRemaining: 1,
    zonePreference: 'near', // Act III uses this
  };
}

export function makeGroup(rng, conditions, id) {
  return {
    id,
    guests: [0, 1, 2, 3].map(() => makeGuest(rng, conditions)),
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/golfer.test.js`
Expected: PASS, 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/golfer.js tests/golfer.test.js
git commit -m "Add guest generation driven by prestige and green fee

Prestige pulls the handicap distribution toward better players and the
green fee pulls wallets up, both gently, so a resort never draws only one
kind of golfer. Guests carry stayNights and zonePreference now even
though Act I fixes both, per the wide-data-model rule in the spec.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Shot resolution and putting

**Files:**
- Create: `src/sim/shot.js`
- Test: `tests/shot.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/shot.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { LIE } from '../src/sim/terrain.js';
import { fullRange, resolveShot, puttsToHole } from '../src/sim/shot.js';

test('a scratch golfer outdrives a high handicapper', () => {
  assert.ok(fullRange(0) > fullRange(28) + 60);
});

test('lie penalties reduce range in the documented order', () => {
  assert.ok(fullRange(10, LIE.FAIRWAY) > fullRange(10, LIE.ROUGH));
  assert.ok(fullRange(10, LIE.ROUGH) > fullRange(10, LIE.SAND));
  assert.ok(fullRange(10, LIE.SAND) > fullRange(10, LIE.TREES));
});

test('resolveShot returns a landing point, a lie and a distance travelled', () => {
  const hole = makeHole('straightPar4', 1);
  const shot = resolveShot(makeRng(1), hole, { x: 0, y: 0 }, LIE.TEE, 10);
  assert.ok(typeof shot.to.x === 'number' && typeof shot.to.y === 'number');
  assert.ok(Object.values(LIE).includes(shot.lie));
  assert.ok(shot.travelled > 0);
});

test('the same seed and inputs give the identical shot', () => {
  const hole = makeHole('straightPar4', 1);
  const a = resolveShot(makeRng(5), hole, { x: 0, y: 0 }, LIE.TEE, 10);
  const b = resolveShot(makeRng(5), hole, { x: 0, y: 0 }, LIE.TEE, 10);
  assert.deepEqual(a, b);
});

test('a shot never advances past the pin by more than a full range', () => {
  const hole = makeHole('straightPar4', 1);
  const rng = makeRng(8);
  for (let i = 0; i < 200; i++) {
    const shot = resolveShot(rng, hole, { x: 0, y: 340 }, LIE.FAIRWAY, 12);
    assert.ok(shot.travelled <= fullRange(12, LIE.FAIRWAY) + 1);
  }
});

test('low handicappers scatter less than high handicappers', () => {
  assert.ok(averageOffline(2) < averageOffline(30) - 5);
});

test('putts rise with distance and fall with skill', () => {
  const rng = makeRng(12);
  const near = averagePutts(rng, 6, 10, 1.0);
  const far = averagePutts(rng, 60, 10, 1.0);
  const skilled = averagePutts(rng, 30, 1, 1.0);
  const poor = averagePutts(rng, 30, 30, 1.0);
  assert.ok(far > near, `near ${near} far ${far}`);
  assert.ok(poor > skilled, `skilled ${skilled} poor ${poor}`);
});

test('a tiered green putts harder than a large one', () => {
  const rng = makeRng(13);
  assert.ok(averagePutts(rng, 30, 12, 1.3) > averagePutts(rng, 30, 12, 0.85));
});

test('putts are always at least one and never absurd', () => {
  const rng = makeRng(14);
  for (let i = 0; i < 1000; i++) {
    const p = puttsToHole(rng, rng.next() * 90, rng.int(30), 1.15);
    assert.ok(p >= 1 && p <= 5, `putts out of range: ${p}`);
  }
});

function averageOffline(handicap) {
  const hole = makeHole('straightPar4', 1);
  const rng = makeRng(21);
  let total = 0;
  for (let i = 0; i < 300; i++) {
    total += Math.abs(resolveShot(rng, hole, { x: 0, y: 0 }, LIE.TEE, handicap).to.x);
  }
  return total / 300;
}

function averagePutts(rng, feet, handicap, greenDifficulty) {
  let total = 0;
  for (let i = 0; i < 400; i++) total += puttsToHole(rng, feet, handicap, greenDifficulty);
  return total / 400;
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/shot.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/shot.js
import { LIE, lieAt } from './terrain.js';
import { pointAtDistance, greenCentre, clamp } from './hole.js';
import { distanceToPath } from './geometry.js';

/** Multipliers applied to a golfer's full range by the lie they play from. */
const LIE_RANGE = {
  [LIE.TEE]: 1.0,
  [LIE.FAIRWAY]: 1.0,
  [LIE.GREEN]: 1.0,
  [LIE.ROUGH]: 0.85,
  [LIE.SAND]: 0.6,
  [LIE.TREES]: 0.45,
  [LIE.WATER]: 1.0, // played from the drop, never actually struck from water
};

/** Extra dispersion multiplier by lie — bad lies scatter as well as shorten. */
const LIE_SPREAD = {
  [LIE.TEE]: 1.0,
  [LIE.FAIRWAY]: 1.0,
  [LIE.GREEN]: 1.0,
  [LIE.ROUGH]: 1.35,
  [LIE.SAND]: 1.6,
  [LIE.TREES]: 1.9,
  [LIE.WATER]: 1.0,
};

/** Full-swing distance in yards: scratch ~265, 30 handicap ~160. */
export function fullRange(handicap, lie = LIE.TEE) {
  const base = 265 - handicap * 3.5;
  return Math.max(60, base) * (LIE_RANGE[lie] ?? 1.0);
}

/**
 * Resolves one full shot. Returns where the ball finished, the lie it
 * finished in, and how far it travelled.
 *
 * The ball is aimed along the corridor toward the green, so a dogleg is
 * played round rather than through - golfers are not suicidal.
 */
export function resolveShot(rng, hole, from, lie, handicap) {
  const range = fullRange(handicap, lie);
  const toPin = distanceRemaining(hole, from);
  const intended = Math.min(range, toPin);

  const spread = LIE_SPREAD[lie] ?? 1.0;
  const distanceSd = intended * (0.05 + handicap * 0.003) * spread;
  const lateralSd = intended * (0.035 + handicap * 0.0035) * spread;

  const travelled = Math.max(10, rng.normal(intended, distanceSd));
  const lateral = rng.normal(0, lateralSd);

  // Aim point: the corridor position `travelled` yards further along.
  const alongFrom = progressAlong(hole, from);
  const aim = pointAtDistance(hole.corridor, alongFrom + travelled);
  const heading = headingAt(hole, alongFrom + travelled);

  // Offset perpendicular to the corridor heading.
  const to = {
    x: aim.x + Math.cos(heading) * lateral,
    y: aim.y + Math.sin(heading) * lateral,
  };

  return { from: { ...from }, to, lie: lieAt(hole, to), travelled };
}

/**
 * Putts required to hole out, from feet. Never fewer than one, never more
 * than five - a six-putt is a story, not a simulation.
 */
export function puttsToHole(rng, feet, handicap, greenDifficulty) {
  const expected =
    (1.55 + 0.028 * feet + handicap * 0.012) * greenDifficulty;
  const rolled = Math.round(rng.normal(expected, 0.45));
  return clamp(rolled, 1, 5);
}

/** Straight-line yards from a point to the centre of the green. */
export function distanceRemaining(hole, point) {
  const centre = greenCentre(hole);
  return Math.max(0, Math.hypot(centre.x - point.x, centre.y - point.y));
}

/**
 * How far along the corridor a point sits, in yards.
 *
 * Computed by projecting onto each segment rather than by sampling the
 * path at intervals. Sampling would be both approximate and ruinously
 * slow: this runs on every shot, and the balance harness simulates
 * thousands of days.
 */
function progressAlong(hole, point) {
  const path = hole.corridor;
  let best = 0;
  let bestDist = Infinity;
  let cumulative = 0;

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const segment = Math.sqrt(lengthSq);

    let t = lengthSq === 0
      ? 0
      : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const dist = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    if (dist < bestDist) {
      bestDist = dist;
      best = cumulative + t * segment;
    }
    cumulative += segment;
  }
  return best;
}

/** Perpendicular direction to the corridor at a given station, in radians. */
function headingAt(hole, along) {
  const a = pointAtDistance(hole.corridor, Math.max(0, along - 5));
  const b = pointAtDistance(hole.corridor, along + 5);
  return Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
}

export { distanceToPath };
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/shot.test.js`
Expected: PASS, 9 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/shot.js tests/shot.test.js
git commit -m "Add shot resolution and putting

Full swings aim along the corridor toward the green, so doglegs are
played round rather than through. Distance and lateral error both scale
with handicap and with the lie, which is what makes narrow corridors
punish weak players specifically.

Putting takes distance, handicap and the green preset, and is bounded at
one to five - a six-putt is a story, not a simulation.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Playing a hole

**Files:**
- Create: `src/sim/round.js`
- Test: `tests/round.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/round.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole, holeStats } from '../src/sim/hole.js';
import { makeGroup, resetGuestIds } from '../src/sim/golfer.js';
import { playHole, expectedMinutes } from '../src/sim/round.js';

function group(seed = 1) {
  resetGuestIds();
  return makeGroup(makeRng(seed), { prestige: 50, greenFee: 45 }, 1);
}

test('every golfer finishes with a score and the group takes time', () => {
  const hole = makeHole('straightPar4', 1);
  const result = playHole(makeRng(1), hole, group(), { carts: false });
  assert.equal(result.scores.length, 4);
  for (const s of result.scores) {
    assert.ok(s.strokes >= 2 && s.strokes <= 14, `implausible score: ${s.strokes}`);
  }
  assert.ok(result.minutes > 5 && result.minutes < 40, `minutes: ${result.minutes}`);
});

test('the same seed replays identically', () => {
  const hole = makeHole('doglegPar4', 1);
  const a = playHole(makeRng(4), hole, group(), { carts: false });
  const b = playHole(makeRng(4), hole, group(), { carts: false });
  assert.deepEqual(a.scores, b.scores);
  assert.equal(a.minutes, b.minutes);
});

test('a par 3 plays faster than a par 5', () => {
  const short = expectedMinutes(makeHole('shortPar3', 1), { carts: false });
  const long = expectedMinutes(makeHole('longPar5', 1), { carts: false });
  assert.ok(long > short + 3, `short ${short} long ${long}`);
});

test('carts speed the hole up', () => {
  const hole = makeHole('longPar5', 1);
  const walking = expectedMinutes(hole, { carts: false });
  const riding = expectedMinutes(hole, { carts: true });
  assert.ok(riding < walking, `walking ${walking} riding ${riding}`);
});

test('adding water slows the hole down', () => {
  const plain = makeHole('straightPar4', 1);
  const watered = makeHole('straightPar4', 1);
  watered.features.push({ type: 'pond', x: 0, y: 250, size: 30 });
  assert.ok(
    expectedMinutes(watered, { carts: false }) > expectedMinutes(plain, { carts: false })
  );
});

test('a representative par 4 plays in a believable time', () => {
  const minutes = expectedMinutes(makeHole('straightPar4', 1), { carts: false });
  assert.ok(minutes > 10 && minutes < 22, `par 4 took ${minutes} minutes`);
});

test('tired golfers are slower than fresh ones', () => {
  const hole = makeHole('straightPar4', 1);
  const fresh = group(2);
  const tired = group(2);
  for (const g of tired.guests) g.energy = 10;
  const a = playHole(makeRng(6), hole, fresh, { carts: false });
  const b = playHole(makeRng(6), hole, tired, { carts: false });
  assert.ok(b.minutes > a.minutes, `fresh ${a.minutes} tired ${b.minutes}`);
});

test('playing a hole drains energy', () => {
  const hole = makeHole('longPar5', 1);
  const g = group(3);
  playHole(makeRng(7), hole, g, { carts: false });
  assert.ok(g.guests.every((x) => x.energy < 100));
});

test('events are emitted for water and sand', () => {
  const hole = makeHole('waterPar3', 1);
  let sawWater = false;
  for (let seed = 1; seed < 40 && !sawWater; seed++) {
    const r = playHole(makeRng(seed), hole, group(seed), { carts: false });
    if (r.events.some((e) => e.type === 'water')) sawWater = true;
  }
  assert.ok(sawWater, 'a par 3 over water should find water within 40 seeds');
});

test('scores stay sane on the hardest template', () => {
  const hole = makeHole('waterPar3', 1);
  const par = holeStats(hole).par;
  const r = playHole(makeRng(9), hole, group(), { carts: false });
  for (const s of r.scores) {
    assert.ok(s.strokes >= par - 1, `impossible score ${s.strokes} on par ${par}`);
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/round.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/round.js
import { makeRng } from './rng.js';
import { LIE, lieAt } from './terrain.js';
import { holeStats, greenCentre, GREEN_DIFFICULTY, clamp } from './hole.js';
import { resolveShot, puttsToHole, distanceRemaining } from './shot.js';
import { makeGroup, resetGuestIds } from './golfer.js';

/** Time costs in minutes. */
const PRE_SHOT = 0.55;       // per stroke, per golfer
const PER_PUTT = 0.5;
const SAND_PENALTY = 0.5;
const WATER_PENALTY = 1.0;
const TREES_PENALTY = 1.5;   // looking for it
const WALK_YARDS_PER_MIN = 75;
const CART_WALK_FACTOR = 0.55;
const TIRED_PENALTY = 0.12;  // extra minutes per stroke at zero energy

const MAX_STROKES = 12;      // pick up and move on

/**
 * Plays one group through one hole. Mutates each guest's energy — they get
 * tireder as the round goes on — and returns scores, elapsed minutes and
 * the events a renderer will replay.
 */
export function playHole(rng, hole, group, { carts }) {
  const stats = holeStats(hole);
  const greenDifficulty = GREEN_DIFFICULTY[hole.greenPreset];
  const scores = [];
  const events = [];
  let penaltyMinutes = 0;
  let totalStrokes = 0;

  for (const guest of group.guests) {
    let position = { ...hole.teePos };
    let lie = LIE.TEE;
    let strokes = 0;

    while (strokes < MAX_STROKES) {
      if (lie === LIE.GREEN) break;

      const shot = resolveShot(rng, hole, position, lie, guest.handicap);
      strokes++;
      events.push({
        type: 'shot',
        holeId: hole.id,
        guestId: guest.id,
        from: shot.from,
        to: shot.to,
        lie: shot.lie,
      });

      if (shot.lie === LIE.WATER) {
        strokes++; // penalty stroke
        penaltyMinutes += WATER_PENALTY;
        events.push({ type: 'water', holeId: hole.id, guestId: guest.id, at: shot.to });
        // Drop back on the corridor, short of the hazard.
        position = dropPoint(hole, shot.from);
        lie = lieAt(hole, position);
        continue;
      }

      if (shot.lie === LIE.SAND) penaltyMinutes += SAND_PENALTY;
      if (shot.lie === LIE.TREES) penaltyMinutes += TREES_PENALTY;
      if (shot.lie === LIE.SAND) {
        events.push({ type: 'sand', holeId: hole.id, guestId: guest.id, at: shot.to });
      }

      position = shot.to;
      lie = shot.lie;
    }

    // Hole out.
    const feetToPin = distanceRemaining(hole, position) * 3;
    const putts = lie === LIE.GREEN
      ? puttsToHole(rng, feetToPin, guest.handicap, greenDifficulty)
      : 2;
    strokes += putts;
    strokes = Math.min(strokes, MAX_STROKES + 2);

    events.push({ type: 'holed', holeId: hole.id, guestId: guest.id, strokes, putts });
    scores.push({ guestId: guest.id, strokes, putts, par: stats.par });
    totalStrokes += strokes;

    // Energy drains with distance walked and strokes taken.
    const drain = (stats.length / 500) * (carts ? 4 : 9) + strokes * 0.4;
    guest.energy = clamp(guest.energy - drain, 0, 100);
  }

  const walkFactor = carts ? CART_WALK_FACTOR : 1;
  const walkMinutes = (stats.length / WALK_YARDS_PER_MIN) * walkFactor;
  // Putts are already inside totalStrokes, so the pre-shot routine applies
  // only to full shots. Charging a putt both costs double-counts it, which
  // added roughly four phantom minutes per hole for a four-ball.
  const totalPutts = scores.reduce((s, x) => s + x.putts, 0);
  const fullShots = totalStrokes - totalPutts;
  const puttMinutes = totalPutts * PER_PUTT;
  const averageEnergy =
    group.guests.reduce((s, g) => s + g.energy, 0) / group.guests.length;
  const tiredMinutes = totalStrokes * TIRED_PENALTY * (1 - averageEnergy / 100);

  const minutes =
    walkMinutes + fullShots * PRE_SHOT + puttMinutes + penaltyMinutes + tiredMinutes;

  return { scores, minutes, events, totalStrokes };
}

/** Where a ball is dropped after finding water: back toward the previous lie. */
function dropPoint(hole, from) {
  const centre = greenCentre(hole);
  const dx = centre.x - from.x;
  const dy = centre.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Advance 60% of the way to the green, then it is wherever it is.
  return { x: from.x + (dx / dist) * dist * 0.6, y: from.y + (dy / dist) * dist * 0.6 };
}

/**
 * The average minutes a representative group takes on this hole.
 * This is the "Expected minutes" figure the editor shows live, and it is
 * measured by simulation rather than by formula because it depends on how
 * the hole actually plays.
 */
export function expectedMinutes(hole, { carts }, samples = 12) {
  let total = 0;
  for (let i = 0; i < samples; i++) {
    resetGuestIds();
    const rng = makeRng(1000 + i);
    const group = makeGroup(rng, { prestige: 50, greenFee: 45 }, 0);
    total += playHole(rng, hole, group, { carts }).minutes;
  }
  return total / samples;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/round.test.js`
Expected: PASS, 10 passing.

If the "believable time" test fails, adjust `PRE_SHOT` and `WALK_YARDS_PER_MIN` rather than loosening the assertion — a par 4 that takes 40 minutes means the pace-of-play mechanic will not work.

**Sanity check before moving on.** Print `expectedMinutes` for all six templates and take the **average**, then multiply by nine. Do not sum the six and compare that to a nine-hole figure — six holes is not a round, and that mistake once hid a 40-minute-per-round error. Expect par 3s around 9–13 minutes, par 4s 13–18, par 5s 18–21, and a nine-hole round of **135–150 minutes**. Anything much above that and the pace mechanic will strangle demand before the player has done anything wrong.

- [ ] **Step 5: Commit**

```bash
git add src/sim/round.js tests/round.test.js
git commit -m "Add hole play producing scores, elapsed time and replay events

A group plays shot by shot until each golfer holes out, accumulating both
strokes and minutes. Time comes from walking distance, per-stroke routine,
putts, and penalties for sand, water and looking for balls in trees -
which is the mechanism that makes a punishing hole a slow one.

Expected playing time is measured by simulating representative groups
rather than by formula, because it depends on how a hole actually plays.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Tee sheet and queueing

This is where hole design reaches the player's wallet. A group cannot start a hole until the group ahead has cleared it — classic flow-shop scheduling.

**Files:**
- Create: `src/sim/schedule.js`
- Test: `tests/schedule.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/schedule.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleRounds } from '../src/sim/schedule.js';

/** Nine holes that each take a fixed time, for arithmetic we can check by hand. */
const flat = (minutes) => Array.from({ length: 9 }, () => minutes);

test('a single group is never delayed', () => {
  const r = scheduleRounds({ groupCount: 1, teeInterval: 10, holeMinutes: flat(12), dayStart: 420 });
  assert.equal(r.rounds[0].waitMinutes, 0);
  assert.equal(r.rounds[0].startMinute, 420);
  assert.equal(r.rounds[0].finishMinute, 420 + 9 * 12);
});

test('a generous tee interval produces no waiting', () => {
  const r = scheduleRounds({ groupCount: 6, teeInterval: 15, holeMinutes: flat(12), dayStart: 420 });
  for (const round of r.rounds) assert.equal(round.waitMinutes, 0);
});

test('a tight tee interval backs the course up', () => {
  const r = scheduleRounds({ groupCount: 6, teeInterval: 6, holeMinutes: flat(14), dayStart: 420 });
  assert.equal(r.rounds[0].waitMinutes, 0, 'the first group never waits');
  assert.ok(r.rounds[5].waitMinutes > 20, `last group waited ${r.rounds[5].waitMinutes}`);
});

test('waiting grows monotonically down the field', () => {
  const r = scheduleRounds({ groupCount: 8, teeInterval: 7, holeMinutes: flat(13), dayStart: 420 });
  for (let i = 1; i < r.rounds.length; i++) {
    assert.ok(
      r.rounds[i].waitMinutes >= r.rounds[i - 1].waitMinutes,
      `group ${i} waited less than group ${i - 1}`
    );
  }
});

test('one slow hole is identified as the bottleneck', () => {
  const holes = flat(10);
  holes[3] = 26; // the 4th takes forever
  const r = scheduleRounds({ groupCount: 8, teeInterval: 10, holeMinutes: holes, dayStart: 420 });
  assert.equal(r.bottleneckHoleIndex, 3);
});

test('no bottleneck is reported when nothing queues', () => {
  const r = scheduleRounds({ groupCount: 3, teeInterval: 20, holeMinutes: flat(10), dayStart: 420 });
  assert.equal(r.bottleneckHoleIndex, null);
});

test('groups finishing after the day ends are reported', () => {
  // With an 8 minute interval and 16 minute holes the course saturates, so
  // each group finishes exactly 16 minutes after the one ahead: group g
  // finishes at 420 + 16 * (9 + g). Overrunning 1080 needs g >= 33, so 30
  // groups all finish comfortably inside the day and 40 is the honest test.
  const r = scheduleRounds({
    groupCount: 40, teeInterval: 8, holeMinutes: flat(16), dayStart: 420, dayEnd: 1080,
  });
  assert.ok(r.overrunGroups > 0);
});

test('average round time reflects waiting', () => {
  const quick = scheduleRounds({ groupCount: 6, teeInterval: 18, holeMinutes: flat(12), dayStart: 420 });
  const jammed = scheduleRounds({ groupCount: 6, teeInterval: 5, holeMinutes: flat(12), dayStart: 420 });
  assert.ok(jammed.averageRoundMinutes > quick.averageRoundMinutes);
});

test('per-hole waits are recorded so complaints can name a hole', () => {
  const holes = flat(10);
  holes[6] = 24;
  const r = scheduleRounds({ groupCount: 8, teeInterval: 10, holeMinutes: holes, dayStart: 420 });
  const lastGroup = r.rounds[r.rounds.length - 1];
  assert.equal(lastGroup.waitByHole.length, 9);
  assert.ok(lastGroup.waitByHole[6] > 0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/schedule.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/schedule.js

/**
 * Flow-shop scheduling across nine holes.
 *
 * A group cannot begin hole h until BOTH it has finished hole h-1 AND the
 * group ahead has cleared hole h. That single rule is the whole pace-of-play
 * mechanic: shorten the tee interval below a hole's playing time and the
 * queue grows without bound down the field.
 *
 * All times are minutes from midnight. 420 is 7:00am; 1080 is 6:00pm.
 */
export function scheduleRounds({
  groupCount,
  teeInterval,
  holeMinutes,
  dayStart = 420,
  dayEnd = 1080,
}) {
  const holeCount = holeMinutes.length;
  /** When each hole was last vacated. */
  const holeFree = new Array(holeCount).fill(-Infinity);
  const rounds = [];
  const waitTotalsByHole = new Array(holeCount).fill(0);

  for (let g = 0; g < groupCount; g++) {
    const teeTime = dayStart + g * teeInterval;
    const waitByHole = new Array(holeCount).fill(0);
    let clock = teeTime;
    let waited = 0;

    for (let h = 0; h < holeCount; h++) {
      const readyAt = clock;
      const startAt = Math.max(readyAt, holeFree[h]);
      const wait = startAt - readyAt;
      waitByHole[h] = wait;
      waited += wait;
      waitTotalsByHole[h] += wait;

      clock = startAt + holeMinutes[h];
      holeFree[h] = clock;
    }

    rounds.push({
      groupIndex: g,
      teeTime,
      startMinute: teeTime,
      finishMinute: clock,
      waitMinutes: waited,
      waitByHole,
      roundMinutes: clock - teeTime,
    });
  }

  const totalWait = waitTotalsByHole.reduce((s, v) => s + v, 0);
  const bottleneckHoleIndex =
    totalWait === 0
      ? null
      : waitTotalsByHole.indexOf(Math.max(...waitTotalsByHole));

  return {
    rounds,
    waitTotalsByHole,
    bottleneckHoleIndex,
    overrunGroups: rounds.filter((r) => r.finishMinute > dayEnd).length,
    averageRoundMinutes:
      rounds.reduce((s, r) => s + r.roundMinutes, 0) / (rounds.length || 1),
  };
}

/** How many groups fit in a playing day at a given interval. */
export function maxGroupsForDay(teeInterval, dayStart = 420, dayEnd = 1080) {
  return Math.max(1, Math.floor((dayEnd - dayStart) / teeInterval));
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/schedule.test.js`
Expected: PASS, 9 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/schedule.js tests/schedule.test.js
git commit -m "Add flow-shop tee sheet scheduling with per-hole waits

A group cannot start a hole until it has finished the previous one and the
group ahead has cleared it. That single rule is the entire pace-of-play
mechanic: set the tee interval below a hole's playing time and the queue
grows down the field.

Waits are recorded per hole so the evening report can name the hole that
is choking the course rather than just reporting a slow round.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Economy

**Files:**
- Create: `src/sim/economy.js`
- Test: `tests/economy.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/economy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue } from '../src/sim/economy.js';

const amenities = [{ type: 'clubhouse' }, { type: 'proShop' }];
const staff = [{ role: 'groundskeeper' }, { role: 'marshal' }];

test('perceived value rises with rating and prestige', () => {
  const poor = perceivedValue({ courseRating: 20, prestige: 10, amenities: [] });
  const good = perceivedValue({ courseRating: 80, prestige: 70, amenities });
  assert.ok(good > poor);
});

test('demand falls as the green fee climbs past perceived value', () => {
  const conditions = { courseRating: 50, prestige: 40, amenities, teeInterval: 10 };
  const cheap = demandGroups({ ...conditions, greenFee: 25 });
  const dear = demandGroups({ ...conditions, greenFee: 200 });
  assert.ok(dear < cheap, `cheap ${cheap} dear ${dear}`);
});

test('demand is capped by the tee sheet, not just by appetite', () => {
  const groups = demandGroups({
    courseRating: 95, prestige: 95, amenities, greenFee: 5, teeInterval: 60,
  });
  assert.ok(groups <= 11, `a 60 minute interval cannot fit ${groups} groups`);
});

test('demand is never negative', () => {
  const groups = demandGroups({
    courseRating: 5, prestige: 0, amenities: [], greenFee: 500, teeInterval: 10,
  });
  assert.ok(groups >= 0);
});

test('revenue counts green fees for every golfer', () => {
  const r = dailyRevenue({
    groupsPlayed: 10, greenFee: 50, amenities: [], averageSatisfaction: 50,
  });
  assert.equal(r.greenFees, 10 * 4 * 50);
});

test('a pro shop adds merchandise revenue', () => {
  const base = dailyRevenue({ groupsPlayed: 10, greenFee: 50, amenities: [], averageSatisfaction: 50 });
  const shop = dailyRevenue({ groupsPlayed: 10, greenFee: 50, amenities: [{ type: 'proShop' }], averageSatisfaction: 50 });
  assert.ok(shop.total > base.total);
  assert.ok(shop.merchandise > 0);
});

test('happier guests spend more in the shop', () => {
  const sad = dailyRevenue({ groupsPlayed: 10, greenFee: 50, amenities: [{ type: 'proShop' }], averageSatisfaction: 20 });
  const glad = dailyRevenue({ groupsPlayed: 10, greenFee: 50, amenities: [{ type: 'proShop' }], averageSatisfaction: 90 });
  assert.ok(glad.merchandise > sad.merchandise);
});

test('costs include hole upkeep, payroll and amenity upkeep', () => {
  const c = dailyCosts({ holeUpkeep: 500, staff, amenities });
  assert.equal(c.holeUpkeep, 500);
  assert.equal(c.payroll, 120 + 100);
  assert.ok(c.amenityUpkeep > 0);
  assert.equal(c.total, c.holeUpkeep + c.payroll + c.amenityUpkeep);
});

test('an empty resort still costs money', () => {
  const c = dailyCosts({ holeUpkeep: 360, staff: [], amenities: [] });
  assert.ok(c.total > 0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/economy.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/economy.js
import { maxGroupsForDay } from './schedule.js';
import { clamp } from './hole.js';

/** Daily wage by role, per §8.3. */
export const WAGES = {
  groundskeeper: 120,
  marshal: 100,
  shopStaff: 90,
  kitchenStaff: 95,
};

/** Daily upkeep by amenity, and what each contributes. */
export const AMENITIES = {
  clubhouse:    { upkeep: 60,  build: 0,     satisfaction: 2 },
  proShop:      { upkeep: 70,  build: 6000,  satisfaction: 3, spendPerGuest: 14 },
  snackShack:   { upkeep: 55,  build: 3500,  satisfaction: 3, spendPerGuest: 9 },
  halfwayHouse: { upkeep: 65,  build: 4500,  satisfaction: 5, spendPerGuest: 11 },
  restaurant:   { upkeep: 140, build: 12000, satisfaction: 6, spendPerGuest: 26 },
  restrooms:    { upkeep: 30,  build: 1800,  satisfaction: 4 },
  drivingRange: { upkeep: 80,  build: 7000,  satisfaction: 4 },
  practiceGreen:{ upkeep: 45,  build: 3000,  satisfaction: 3 },
  cartBarn:     { upkeep: 110, build: 9000,  satisfaction: 3 },
};

/** What a round here is worth to a golfer, in dollars. */
export function perceivedValue({ courseRating, prestige, amenities }) {
  const amenityValue = amenities.reduce(
    (s, a) => s + (AMENITIES[a.type]?.satisfaction ?? 0) * 1.6,
    0
  );
  return 18 + courseRating * 0.62 + prestige * 0.45 + amenityValue;
}

/**
 * How many groups turn up. Appetite is driven by price against perceived
 * value; the tee sheet then caps it, so a wildly popular course still
 * cannot sell more rounds than daylight allows.
 */
export function demandGroups({
  courseRating, prestige, amenities, greenFee, teeInterval,
}) {
  const value = perceivedValue({ courseRating, prestige, amenities });
  // 1.0 when priced at value; falls away above it, gains slowly below it.
  const ratio = greenFee / Math.max(1, value);
  const appetite = ratio <= 1
    ? 1 + (1 - ratio) * 0.35
    : Math.max(0, 1 - (ratio - 1) * 1.15);

  const reputationPull = 0.35 + (prestige / 100) * 0.9;
  const capacity = maxGroupsForDay(teeInterval);

  return clamp(Math.round(capacity * appetite * reputationPull), 0, capacity);
}

export function dailyRevenue({ groupsPlayed, greenFee, amenities, averageSatisfaction }) {
  const golfers = groupsPlayed * 4;
  const greenFees = golfers * greenFee;

  // Satisfied guests open their wallets; unhappy ones leave straight away.
  const spendMultiplier = 0.4 + (averageSatisfaction / 100) * 1.2;

  let merchandise = 0;
  let food = 0;
  for (const a of amenities) {
    const spec = AMENITIES[a.type];
    if (!spec?.spendPerGuest) continue;
    const spend = golfers * spec.spendPerGuest * spendMultiplier;
    if (a.type === 'proShop') merchandise += spend;
    else food += spend;
  }

  return {
    greenFees: Math.round(greenFees),
    merchandise: Math.round(merchandise),
    food: Math.round(food),
    total: Math.round(greenFees + merchandise + food),
  };
}

export function dailyCosts({ holeUpkeep, staff, amenities }) {
  const payroll = staff.reduce((s, m) => s + (WAGES[m.role] ?? 0), 0);
  const amenityUpkeep = amenities.reduce(
    (s, a) => s + (AMENITIES[a.type]?.upkeep ?? 0),
    0
  );
  return {
    holeUpkeep: Math.round(holeUpkeep),
    payroll,
    amenityUpkeep,
    total: Math.round(holeUpkeep + payroll + amenityUpkeep),
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/economy.test.js`
Expected: PASS, 9 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/economy.js tests/economy.test.js
git commit -m "Add demand, revenue and cost model

Demand comes from green fee measured against what a round here is actually
worth - course rating, prestige and amenities - and is then capped by the
tee sheet, so a popular course still cannot sell more rounds than daylight
allows. Spending scales with satisfaction, so an unhappy guest leaves
rather than visiting the pro shop.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Satisfaction and complaints

**Files:**
- Create: `src/sim/satisfaction.js`
- Test: `tests/satisfaction.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/satisfaction.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestSatisfaction, buildComplaints } from '../src/sim/satisfaction.js';

const baseline = {
  handicap: 15,
  strokesOverPar: 15,   // exactly to handicap over nine holes is ~7.5; see below
  waitMinutes: 0,
  greenFee: 45,
  perceivedValue: 60,
  scenery: 55,
  turfQuality: 70,
  amenityBonus: 6,
};

test('satisfaction stays within 0 and 100', () => {
  const awful = guestSatisfaction({
    ...baseline, waitMinutes: 300, strokesOverPar: 60, greenFee: 500,
    perceivedValue: 5, scenery: 0, turfQuality: 0, amenityBonus: 0,
  });
  const ideal = guestSatisfaction({
    ...baseline, waitMinutes: 0, strokesOverPar: -4, greenFee: 10,
    perceivedValue: 200, scenery: 100, turfQuality: 100, amenityBonus: 30,
  });
  assert.ok(awful >= 0 && awful <= 100);
  assert.ok(ideal >= 0 && ideal <= 100);
});

test('waiting hurts', () => {
  const quick = guestSatisfaction({ ...baseline, waitMinutes: 0 });
  const slow = guestSatisfaction({ ...baseline, waitMinutes: 45 });
  assert.ok(slow < quick - 10, `quick ${quick} slow ${slow}`);
});

test('playing better than your handicap helps', () => {
  const poor = guestSatisfaction({ ...baseline, strokesOverPar: 26 });
  const good = guestSatisfaction({ ...baseline, strokesOverPar: 4 });
  assert.ok(good > poor);
});

test('overpaying hurts, underpaying helps', () => {
  const gouged = guestSatisfaction({ ...baseline, greenFee: 140, perceivedValue: 60 });
  const bargain = guestSatisfaction({ ...baseline, greenFee: 30, perceivedValue: 60 });
  assert.ok(bargain > gouged);
});

test('scenery and turf both matter', () => {
  const bleak = guestSatisfaction({ ...baseline, scenery: 10, turfQuality: 20 });
  const lovely = guestSatisfaction({ ...baseline, scenery: 95, turfQuality: 95 });
  assert.ok(lovely > bleak);
});

test('a slow hole produces a complaint naming that hole', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: [0, 0, 0, 260, 0, 0, 0, 0, 0],
    groupsPlayed: 20,
    turfQuality: 80,
    amenityTypes: ['clubhouse', 'restrooms'],
    averageSatisfaction: 60,
    nearActGate: false,
  });
  assert.ok(complaints.some((c) => c.includes('4th')), complaints.join(' | '));
});

test('poor turf produces a maintenance complaint', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(9).fill(0),
    groupsPlayed: 20,
    turfQuality: 25,
    amenityTypes: ['clubhouse', 'restrooms'],
    averageSatisfaction: 60,
    nearActGate: false,
  });
  assert.ok(complaints.some((c) => /bunker|turf|greens/i.test(c)), complaints.join(' | '));
});

test('missing restrooms produce a complaint', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(9).fill(0),
    groupsPlayed: 20,
    turfQuality: 85,
    amenityTypes: ['clubhouse'],
    averageSatisfaction: 60,
    nearActGate: false,
  });
  assert.ok(complaints.some((c) => /restroom/i.test(c)), complaints.join(' | '));
});

test('a well run day produces few or no complaints', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(9).fill(0),
    groupsPlayed: 20,
    turfQuality: 92,
    amenityTypes: ['clubhouse', 'restrooms', 'snackShack', 'proShop'],
    averageSatisfaction: 85,
    nearActGate: false,
  });
  assert.ok(complaints.length <= 1, complaints.join(' | '));
});

test('nearing the act gate foreshadows lodging', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(9).fill(0),
    groupsPlayed: 20,
    turfQuality: 90,
    amenityTypes: ['clubhouse', 'restrooms'],
    averageSatisfaction: 80,
    nearActGate: true,
  });
  assert.ok(complaints.some((c) => /sleep|stay|motel|room/i.test(c)), complaints.join(' | '));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/satisfaction.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/satisfaction.js
import { clamp } from './hole.js';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/**
 * A golfer's verdict on their round, 0–100.
 *
 * The dominant term is waiting, deliberately: a slow round is the thing
 * golfers resent most, and it is the consequence the player must feel when
 * they build a punishing course.
 */
export function guestSatisfaction({
  handicap,
  strokesOverPar,
  waitMinutes,
  greenFee,
  perceivedValue,
  scenery,
  turfQuality,
  amenityBonus,
}) {
  // Over nine holes a golfer expects roughly half their handicap.
  const expectedOverPar = handicap / 2;
  const scoreDelta = clamp((expectedOverPar - strokesOverPar) * 1.6, -22, 14);

  const waitPenalty = waitMinutes * 0.55;
  const priceDelta = clamp((perceivedValue - greenFee) * 0.22, -20, 12);
  const sceneryBonus = (scenery - 50) * 0.16;
  const turfBonus = (turfQuality - 60) * 0.22;

  return clamp(
    55 + scoreDelta - waitPenalty + priceDelta + sceneryBonus + turfBonus + amenityBonus,
    0,
    100
  );
}

/**
 * Plain-language complaints for the evening report. These are authored
 * rather than generated so they stay funny and cost the player nothing.
 */
export function buildComplaints({
  waitTotalsByHole,
  groupsPlayed,
  turfQuality,
  amenityTypes,
  averageSatisfaction,
  nearActGate,
}) {
  const complaints = [];
  const groups = Math.max(1, groupsPlayed);

  // Pace, named by hole.
  const worst = waitTotalsByHole.indexOf(Math.max(...waitTotalsByHole));
  const worstPerGroup = waitTotalsByHole[worst] / groups;
  if (worstPerGroup > 6) {
    complaints.push(`The ${ORDINALS[worst]} takes forever. We stood on that tee for ages.`);
  } else if (worstPerGroup > 3) {
    complaints.push(`Bit of a backup on the ${ORDINALS[worst]}.`);
  }

  // Condition.
  if (turfQuality < 35) {
    complaints.push('The greens are shaggy and the bunkers were unraked.');
  } else if (turfQuality < 55) {
    complaints.push('Course could use some attention — fairways are patchy.');
  }

  // Missing amenities.
  if (!amenityTypes.includes('restrooms')) {
    complaints.push('There is no restroom anywhere past the 6th.');
  }
  if (!amenityTypes.includes('snackShack') && !amenityTypes.includes('halfwayHouse')) {
    complaints.push('Nowhere to get a drink at the turn.');
  }

  // General mood.
  if (averageSatisfaction < 30) {
    complaints.push('Honestly? Would not come back.');
  }

  // Act II foreshadowing — the game asking for what it wants next.
  if (nearActGate) {
    complaints.push("I'd play again tomorrow, but the nearest motel is 40 minutes out.");
  }

  return complaints;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/satisfaction.test.js`
Expected: PASS, 10 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/satisfaction.js tests/satisfaction.test.js
git commit -m "Add guest satisfaction and the authored complaint log

Satisfaction weights waiting most heavily, which is what makes a punishing
course something the player feels in the books rather than just in the
scorecards. Complaints name the specific hole that is choking the course
so the evening report points at a cause rather than a symptom.

Complaints are authored text rather than generated at runtime - funnier,
and free for the player.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Ratings, prestige and the act gate

**Files:**
- Create: `src/sim/ratings.js`
- Create: `src/sim/acts.js`
- Test: `tests/ratings.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/ratings.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole } from '../src/sim/hole.js';
import { courseRating, nextPrestige } from '../src/sim/ratings.js';
import { actOneGate, GATE_THRESHOLDS } from '../src/sim/acts.js';

const varied = ['shortPar3', 'straightPar4', 'doglegPar4', 'longPar5', 'waterPar3',
  'straightPar4', 'reachablePar5', 'doglegPar4', 'shortPar3']
  .map((t, i) => makeHole(t, i + 1));

const samey = new Array(9).fill(0).map((_, i) => makeHole('straightPar4', i + 1));

test('a varied nine rates better than nine identical holes', () => {
  assert.ok(courseRating(varied, 80) > courseRating(samey, 80));
});

test('poor turf drags the rating down', () => {
  assert.ok(courseRating(varied, 20) < courseRating(varied, 95));
});

test('course rating stays within 0 and 100', () => {
  assert.ok(courseRating(varied, 100) <= 100);
  assert.ok(courseRating(samey, 0) >= 0);
});

test('prestige moves slowly toward the day it just had', () => {
  const step = nextPrestige(20, 80, 70);
  assert.ok(step > 20, 'should rise toward a good day');
  assert.ok(step < 40, `prestige moved too fast: ${step}`);
});

test('prestige falls after a bad day', () => {
  assert.ok(nextPrestige(60, 20, 20) < 60);
});

test('prestige stays within 0 and 100', () => {
  assert.ok(nextPrestige(0, 0, 0) >= 0);
  assert.ok(nextPrestige(100, 100, 100) <= 100);
});

test('the act one gate needs all four conditions', () => {
  const met = {
    holesOpen: 9,
    money: GATE_THRESHOLDS.money,
    prestige: GATE_THRESHOLDS.prestige,
    satisfactionHistory: new Array(7).fill(GATE_THRESHOLDS.satisfaction),
  };
  assert.equal(actOneGate(met).passed, true);

  assert.equal(actOneGate({ ...met, holesOpen: 8 }).passed, false);
  assert.equal(actOneGate({ ...met, money: GATE_THRESHOLDS.money - 1 }).passed, false);
  assert.equal(actOneGate({ ...met, prestige: GATE_THRESHOLDS.prestige - 1 }).passed, false);
  assert.equal(
    actOneGate({ ...met, satisfactionHistory: new Array(7).fill(GATE_THRESHOLDS.satisfaction - 5) }).passed,
    false
  );
});

test('the gate needs a full seven days of history', () => {
  const short = {
    holesOpen: 9,
    money: GATE_THRESHOLDS.money,
    prestige: GATE_THRESHOLDS.prestige,
    satisfactionHistory: new Array(5).fill(90),
  };
  assert.equal(actOneGate(short).passed, false);
});

test('the gate reports which conditions are outstanding', () => {
  const result = actOneGate({
    holesOpen: 6, money: 1000, prestige: 10, satisfactionHistory: [],
  });
  assert.equal(result.passed, false);
  assert.equal(result.outstanding.length, 4);
});

test('nearGate is true once most conditions are met', () => {
  const result = actOneGate({
    holesOpen: 9,
    money: GATE_THRESHOLDS.money,
    prestige: GATE_THRESHOLDS.prestige,
    satisfactionHistory: new Array(7).fill(GATE_THRESHOLDS.satisfaction - 4),
  });
  assert.equal(result.passed, false);
  assert.equal(result.nearGate, true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/ratings.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement both modules**

```js
// src/sim/ratings.js
import { holeStats, clamp } from './hole.js';

/**
 * Design quality across the nine, 0–100.
 *
 * Variety is weighted heavily so that nine copies of a good hole rate worse
 * than a mixed set, and fairness punishes a course that is brutal from end
 * to end - the player should not be able to max the rating by making
 * everything as hard as possible.
 */
export function courseRating(holes, turfQuality) {
  const stats = holes.map(holeStats);

  const pars = stats.map((s) => s.par);
  const parSpread = new Set(pars).size;                     // 1–3
  const lengths = stats.map((s) => s.length);
  const lengthSpread = Math.max(...lengths) - Math.min(...lengths);

  const variety =
    (parSpread / 3) * 22 + clamp(lengthSpread / 320, 0, 1) * 18;

  const scenery =
    (stats.reduce((s, x) => s + x.scenery, 0) / stats.length) * 0.28;

  // Mid handicappers want a test, not a punishment beating.
  const meanDifficulty =
    stats.reduce((s, x) => s + x.difficulty, 0) / stats.length;
  const fairness = 22 - Math.abs(meanDifficulty - 48) * 0.45;

  const condition = (turfQuality / 100) * 20;

  return clamp(variety + scenery + fairness + condition, 0, 100);
}

/**
 * Prestige is a slow exponential average, deliberately: a player should not
 * be able to buy their way out of a bad course with one good day.
 */
export function nextPrestige(current, rating, averageSatisfaction) {
  const target = rating * 0.55 + averageSatisfaction * 0.45;
  const RATE = 0.08;
  return clamp(current + (target - current) * RATE, 0, 100);
}
```

```js
// src/sim/acts.js

/** Act I gate thresholds, per §3 of the spec. Tuned by tools/balance.js. */
export const GATE_THRESHOLDS = {
  holesOpen: 9,
  money: 50000,
  prestige: 40,
  satisfaction: 60,
  satisfactionDays: 7,
};

/**
 * Evaluates the Act I gate and reports what is still outstanding, so the
 * UI can show progress rather than a locked door.
 */
export function actOneGate({ holesOpen, money, prestige, satisfactionHistory }) {
  const recent = satisfactionHistory.slice(-GATE_THRESHOLDS.satisfactionDays);
  const hasEnoughHistory = recent.length >= GATE_THRESHOLDS.satisfactionDays;
  const averageRecent = hasEnoughHistory
    ? recent.reduce((s, v) => s + v, 0) / recent.length
    : 0;

  const conditions = [
    { key: 'holesOpen', met: holesOpen >= GATE_THRESHOLDS.holesOpen,
      label: `Open all ${GATE_THRESHOLDS.holesOpen} holes` },
    { key: 'money', met: money >= GATE_THRESHOLDS.money,
      label: `Bank $${GATE_THRESHOLDS.money.toLocaleString()}` },
    { key: 'prestige', met: prestige >= GATE_THRESHOLDS.prestige,
      label: `Reach prestige ${GATE_THRESHOLDS.prestige}` },
    { key: 'satisfaction',
      met: hasEnoughHistory && averageRecent >= GATE_THRESHOLDS.satisfaction,
      label: `Hold satisfaction ${GATE_THRESHOLDS.satisfaction} for ${GATE_THRESHOLDS.satisfactionDays} days` },
  ];

  const outstanding = conditions.filter((c) => !c.met);

  return {
    passed: outstanding.length === 0,
    // One condition short means the complaint log starts hinting at Act II.
    nearGate: outstanding.length === 1,
    outstanding: outstanding.map((c) => c.label),
    conditions,
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/ratings.test.js`
Expected: PASS, 10 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/ratings.js src/sim/acts.js tests/ratings.test.js
git commit -m "Add course rating, prestige and the Act I gate

Rating weights variety heavily so nine copies of a good hole score worse
than a mixed set, and fairness peaks at a moderate average difficulty so
the player cannot max the rating by making everything brutal.

Prestige is a slow exponential average, deliberately - one good day should
not undo a bad course. The gate reports outstanding conditions rather than
a bare pass or fail, so the UI can show progress, and flags nearGate one
condition short so the complaint log can start hinting at Act II.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Game state and the starting resort

**Files:**
- Create: `src/sim/state.js`
- Test: `tests/state.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/state.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, serialize, deserialize } from '../src/sim/state.js';

test('a new game starts on day one of act one', () => {
  const s = newGame(1234);
  assert.equal(s.day, 1);
  assert.equal(s.act, 1);
  assert.equal(s.seed, 1234);
});

test('a new game starts with the spec cash and three open holes', () => {
  const s = newGame(1);
  assert.equal(s.money, 25000);
  assert.equal(s.resort.courses[0].holes.filter((h) => h.open).length, 3);
});

test('there are nine hole slots, six of them empty', () => {
  const s = newGame(1);
  const holes = s.resort.courses[0].holes;
  assert.equal(holes.length, 9);
  assert.equal(holes.filter((h) => !h.open).length, 6);
});

test('the wide data model fields are present and narrow', () => {
  const s = newGame(1);
  assert.equal(s.resort.zones.length, 1);
  assert.equal(s.resort.zones[0].id, 'near');
  assert.equal(s.resort.courses.length, 1);
  assert.equal(s.properties.length, 1);
  assert.equal(s.resort.rooms.count, 0);
  assert.deepEqual(s.resort.shuttles, []);
  assert.equal(s.resort.pricing.roomRate, 0);
});

test('pricing starts at the spec defaults', () => {
  const s = newGame(1);
  assert.equal(s.resort.pricing.greenFee, 45);
  assert.equal(s.resort.pricing.teeInterval, 10);
});

test('a round trip through serialize and deserialize preserves the state', () => {
  const s = newGame(77);
  const back = deserialize(serialize(s));
  assert.deepEqual(back, s);
});

test('serialize produces a string', () => {
  assert.equal(typeof serialize(newGame(1)), 'string');
});

test('deserialize rejects malformed input rather than returning junk', () => {
  assert.throws(() => deserialize('not json'), /save/i);
  assert.throws(() => deserialize(JSON.stringify({ nope: true })), /save/i);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/state.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/state.js
import { makeHole } from './hole.js';

const SAVE_VERSION = 1;

/** The three holes Pinehollow already has, so day one has income to watch. */
const STARTING_HOLES = ['shortPar3', 'straightPar4', 'doglegPar4'];

export function newGame(seed) {
  const holes = [];
  for (let i = 0; i < 9; i++) {
    if (i < STARTING_HOLES.length) {
      holes.push({ ...makeHole(STARTING_HOLES[i], i + 1), open: true });
    } else {
      // An empty plot: no corridor until the player builds it.
      holes.push({ id: i + 1, open: false, template: null, corridor: [],
        corridorWidth: 0, greenPreset: null, features: [], teePos: null });
    }
  }

  return {
    version: SAVE_VERSION,
    seed,
    day: 1,
    act: 1,
    money: 25000,
    prestige: 12,
    turfQuality: 70,
    resort: {
      zones: [{ id: 'near', travelMinutes: 0 }],       // Act III adds 'far'
      courses: [{ id: 1, name: 'Pinehollow', zone: 'near', holes }],
      amenities: [{ type: 'clubhouse' }],
      staff: [{ role: 'groundskeeper' }],
      rooms: { count: 0, quality: 0 },                 // Act II
      shuttles: [],                                    // Act III
      pricing: { greenFee: 45, teeInterval: 10, foodMultiplier: 1, roomRate: 0 },
    },
    properties: [{ id: 1, name: 'Pinehollow' }],       // Act IV
    history: [],
    satisfactionHistory: [],
  };
}

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('save is not valid JSON');
  }
  if (!parsed || parsed.version !== SAVE_VERSION || !parsed.resort) {
    throw new Error('save is missing required fields or is from another version');
  }
  return parsed;
}

/** Every hole currently open for play. */
export function openHoles(state) {
  return state.resort.courses[0].holes.filter((h) => h.open);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/state.test.js`
Expected: PASS, 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/state.js tests/state.test.js
git commit -m "Add game state with the starting Pinehollow resort

Three holes are already open on day one so the player has income and
something to watch rather than an empty field. Zones, courses, properties,
rooms and shuttles all exist with a single narrow entry, which is the
wide-data-model rule that keeps Acts II to IV as additions.

Deserialize rejects malformed or wrong-version saves rather than returning
a half-built state that fails later and further away.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: `runDay` — the orchestrator

**Files:**
- Create: `src/sim/day.js`
- Test: `tests/day.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/day.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';

test('runDay returns a next state, a report and a timeline', () => {
  const { state, report, timeline } = runDay(newGame(1), 1);
  assert.ok(state && report && timeline);
  assert.ok(Array.isArray(timeline));
});

test('runDay does not mutate the state it was given', () => {
  const before = newGame(2);
  const snapshot = JSON.stringify(before);
  runDay(before, 2);
  assert.equal(JSON.stringify(before), snapshot);
});

test('the same state and seed produce an identical day', () => {
  const a = runDay(newGame(3), 99);
  const b = runDay(newGame(3), 99);
  assert.deepEqual(a.report, b.report);
  assert.equal(a.timeline.length, b.timeline.length);
});

test('different seeds produce different days', () => {
  const a = runDay(newGame(4), 1);
  const b = runDay(newGame(4), 2);
  assert.notDeepEqual(a.report, b.report);
});

test('the day advances and history grows', () => {
  const { state } = runDay(newGame(5), 1);
  assert.equal(state.day, 2);
  assert.equal(state.history.length, 1);
  assert.equal(state.satisfactionHistory.length, 1);
});

test('money changes by exactly profit', () => {
  const before = newGame(6);
  const { state, report } = runDay(before, 1);
  assert.equal(state.money, before.money + report.profit);
});

test('profit is revenue minus costs', () => {
  const { report } = runDay(newGame(7), 1);
  assert.equal(report.profit, report.revenue.total - report.costs.total);
});

test('the report carries everything the evening screen needs', () => {
  const { report } = runDay(newGame(8), 1);
  for (const key of ['day', 'groupsPlayed', 'revenue', 'costs', 'profit',
    'averageSatisfaction', 'averageRoundMinutes', 'courseRating', 'prestige',
    'complaints', 'gate']) {
    assert.ok(key in report, `report missing: ${key}`);
  }
});

test('timeline events are ordered by time', () => {
  const { timeline } = runDay(newGame(9), 1);
  for (let i = 1; i < timeline.length; i++) {
    assert.ok(timeline[i].minute >= timeline[i - 1].minute,
      `event ${i} went backwards in time`);
  }
});

test('every timeline event carries a minute and a type', () => {
  const { timeline } = runDay(newGame(10), 1);
  for (const e of timeline) {
    assert.equal(typeof e.minute, 'number');
    assert.equal(typeof e.type, 'string');
  }
});

test('turf decays without enough groundskeepers and recovers with them', () => {
  const neglected = newGame(11);
  neglected.resort.staff = [];
  const understaffed = runDay(neglected, 1).state.turfQuality;

  const tended = newGame(11);
  tended.resort.staff = [
    { role: 'groundskeeper' }, { role: 'groundskeeper' }, { role: 'groundskeeper' },
  ];
  const wellKept = runDay(tended, 1).state.turfQuality;

  assert.ok(understaffed < neglected.turfQuality, 'turf should decay when nobody tends it');
  assert.ok(wellKept > understaffed);
});

test('a resort with no open holes does not crash and earns nothing', () => {
  const closed = newGame(12);
  for (const h of closed.resort.courses[0].holes) h.open = false;
  const { report } = runDay(closed, 1);
  assert.equal(report.groupsPlayed, 0);
  assert.equal(report.revenue.total, 0);
});

test('ten consecutive days run without error and keep state coherent', () => {
  let state = newGame(13);
  for (let i = 0; i < 10; i++) state = runDay(state, 100 + i).state;
  assert.equal(state.day, 11);
  assert.equal(state.history.length, 10);
  assert.ok(state.prestige >= 0 && state.prestige <= 100);
  assert.ok(Number.isFinite(state.money));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/day.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/day.js
import { makeRng } from './rng.js';
import { holeStats, clamp } from './hole.js';
import { makeGroup, resetGuestIds } from './golfer.js';
import { playHole } from './round.js';
import { scheduleRounds } from './schedule.js';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue } from './economy.js';
import { guestSatisfaction, buildComplaints } from './satisfaction.js';
import { courseRating, nextPrestige } from './ratings.js';
import { actOneGate } from './acts.js';
import { openHoles } from './state.js';

const DAY_START = 420;  // 7:00am
const DAY_END = 1080;   // 6:00pm

/**
 * Runs one full day and returns the next state, the evening report, and a
 * timeline of timestamped events for the renderer to play back.
 *
 * Pure: the state passed in is never mutated.
 */
export function runDay(state, seed) {
  const rng = makeRng(seed);
  const next = structuredClone(state);
  const holes = openHoles(next);

  const { greenFee, teeInterval } = next.resort.pricing;
  const amenityTypes = next.resort.amenities.map((a) => a.type);
  const carts = amenityTypes.includes('cartBarn');

  const rating = holes.length ? courseRating(holes, next.turfQuality) : 0;

  // Nobody comes to a resort with no golf.
  const groupCount = holes.length
    ? demandGroups({
        courseRating: rating,
        prestige: next.prestige,
        amenities: next.resort.amenities,
        greenFee,
        teeInterval,
      })
    : 0;

  resetGuestIds();
  const groups = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push(makeGroup(rng, { prestige: next.prestige, greenFee }, i));
  }

  // Play every group through every open hole, recording strokes and time.
  const perGroupHoleMinutes = [];
  const perGroupScores = [];
  const rawEvents = [];

  for (const group of groups) {
    const minutes = [];
    const scores = [];
    for (const hole of holes) {
      const played = playHole(rng, hole, group, { carts });
      minutes.push(played.minutes);
      scores.push(played.scores);
      rawEvents.push({ groupIndex: group.id, holeIndex: minutes.length - 1, events: played.events });
    }
    perGroupHoleMinutes.push(minutes);
    perGroupScores.push(scores);
  }

  // Average hole times drive the tee sheet.
  const averageHoleMinutes = holes.map((_, h) =>
    groupCount
      ? perGroupHoleMinutes.reduce((s, m) => s + m[h], 0) / groupCount
      : 0
  );

  const schedule = groupCount
    ? scheduleRounds({
        groupCount,
        teeInterval,
        holeMinutes: averageHoleMinutes,
        dayStart: DAY_START,
        dayEnd: DAY_END,
      })
    : { rounds: [], waitTotalsByHole: new Array(Math.max(1, holes.length)).fill(0),
        bottleneckHoleIndex: null, overrunGroups: 0, averageRoundMinutes: 0 };

  // Satisfaction, once each group's waiting is known.
  const value = perceivedValue({
    courseRating: rating, prestige: next.prestige, amenities: next.resort.amenities,
  });
  const amenityBonus = amenityTypes.length * 1.5;
  const averageScenery = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).scenery, 0) / holes.length
    : 0;

  const satisfactions = [];
  groups.forEach((group, gi) => {
    const wait = schedule.rounds[gi]?.waitMinutes ?? 0;
    group.guests.forEach((guest, idx) => {
      const strokes = perGroupScores[gi].reduce((s, holeScores) => s + holeScores[idx].strokes, 0);
      const par = perGroupScores[gi].reduce((s, holeScores) => s + holeScores[idx].par, 0);
      satisfactions.push(
        guestSatisfaction({
          handicap: guest.handicap,
          strokesOverPar: strokes - par,
          waitMinutes: wait,
          greenFee,
          perceivedValue: value,
          scenery: averageScenery,
          turfQuality: next.turfQuality,
          amenityBonus,
        })
      );
    });
  });

  const averageSatisfaction = satisfactions.length
    ? satisfactions.reduce((s, v) => s + v, 0) / satisfactions.length
    : 50;

  // Money.
  const holeUpkeep = holes.reduce((s, h) => s + holeStats(h).upkeep, 0);
  const revenue = groupCount
    ? dailyRevenue({
        groupsPlayed: groupCount, greenFee,
        amenities: next.resort.amenities, averageSatisfaction,
      })
    : { greenFees: 0, merchandise: 0, food: 0, total: 0 };
  const costs = dailyCosts({
    holeUpkeep, staff: next.resort.staff, amenities: next.resort.amenities,
  });
  const profit = revenue.total - costs.total;

  // Turf: one groundskeeper holds roughly three holes steady.
  const keepers = next.resort.staff.filter((m) => m.role === 'groundskeeper').length;
  const wear = holes.length * 1.4 + groupCount * 0.12;
  const care = keepers * 4.6;
  next.turfQuality = clamp(next.turfQuality - wear + care, 0, 100);

  next.prestige = nextPrestige(next.prestige, rating, averageSatisfaction);
  next.money += profit;

  const gate = actOneGate({
    holesOpen: holes.length,
    money: next.money,
    prestige: next.prestige,
    satisfactionHistory: [...next.satisfactionHistory, averageSatisfaction],
  });

  const complaints = buildComplaints({
    waitTotalsByHole: schedule.waitTotalsByHole,
    groupsPlayed: groupCount,
    turfQuality: next.turfQuality,
    amenityTypes,
    averageSatisfaction,
    nearActGate: gate.nearGate,
  });

  const report = {
    day: next.day,
    groupsPlayed: groupCount,
    revenue,
    costs,
    profit,
    averageSatisfaction,
    averageRoundMinutes: schedule.averageRoundMinutes,
    bottleneckHoleIndex: schedule.bottleneckHoleIndex,
    overrunGroups: schedule.overrunGroups,
    courseRating: rating,
    prestige: next.prestige,
    turfQuality: next.turfQuality,
    complaints,
    gate,
  };

  next.history.push(report);
  next.satisfactionHistory.push(averageSatisfaction);
  next.day += 1;
  if (gate.passed) next.act = 2;

  return {
    state: next,
    report,
    timeline: buildTimeline(schedule, rawEvents, averageHoleMinutes),
  };
}

/**
 * Flattens per-hole events onto the day's clock. The renderer plays this
 * back; the simulation has already finished before the first frame draws.
 *
 * A group reaches hole h having both waited AND played every hole before
 * it, so the offset must accumulate both. Counting only the waits would
 * stamp every event on the closing holes near the tee time and play the
 * whole day back as one bunched-up mess.
 */
function buildTimeline(schedule, rawEvents, holeMinutes) {
  const timeline = [];

  for (const round of schedule.rounds) {
    timeline.push({ minute: round.teeTime, type: 'teeOff', groupIndex: round.groupIndex });
  }

  for (const bundle of rawEvents) {
    const round = schedule.rounds[bundle.groupIndex];
    if (!round) continue;

    let minute = round.teeTime;
    for (let h = 0; h < bundle.holeIndex; h++) {
      minute += (round.waitByHole[h] ?? 0) + (holeMinutes[h] ?? 0);
    }
    minute += round.waitByHole[bundle.holeIndex] ?? 0;

    // Spread this hole's events across the time the hole actually took.
    const duration = holeMinutes[bundle.holeIndex] ?? 12;
    const span = Math.max(1, bundle.events.length);
    bundle.events.forEach((e, i) => {
      timeline.push({
        ...e,
        minute: minute + (i / span) * duration,
        groupIndex: bundle.groupIndex,
      });
    });
  }

  for (const round of schedule.rounds) {
    timeline.push({ minute: round.finishMinute, type: 'finish', groupIndex: round.groupIndex });
  }

  return timeline.sort((a, b) => a.minute - b.minute);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/day.test.js`
Expected: PASS, 13 passing.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, all tests across every file.

- [ ] **Step 6: Commit**

```bash
git add src/sim/day.js tests/day.test.js
git commit -m "Add runDay orchestrating a full day into state, report and timeline

Demand sets the field, every group plays every open hole, average hole
times drive the tee sheet, and the resulting waits feed satisfaction,
money, turf and prestige. The function is pure - the state passed in is
never mutated - so a day can be replayed or rolled back freely.

The timeline flattens per-hole events onto the day's clock for the
renderer to play back later, which is what lets the player scrub or skip
without cancelling anything.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Amenity effects on play

Spec §9 gives three amenities a mechanical effect, not just a revenue line:
the driving range and practice green warm golfers up, marshals push slow groups
along, and the halfway house refuels golfers at the turn. Without this task they
are all decoration, and the player's building decisions are fake.

**Files:**
- Modify: `src/sim/round.js` (extend `playHole` options)
- Modify: `src/sim/day.js` (apply the effects)
- Test: `tests/amenities.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/amenities.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { makeGroup, resetGuestIds } from '../src/sim/golfer.js';
import { playHole } from '../src/sim/round.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';

function group(seed = 1) {
  resetGuestIds();
  return makeGroup(makeRng(seed), { prestige: 50, greenFee: 45 }, 1);
}

function totalStrokes(result) {
  return result.scores.reduce((s, x) => s + x.strokes, 0);
}

test('a warmed-up group scores better than a cold one', () => {
  const hole = makeHole('straightPar4', 1);
  let cold = 0;
  let warm = 0;
  for (let seed = 1; seed <= 40; seed++) {
    cold += totalStrokes(playHole(makeRng(seed), hole, group(seed), { carts: false }));
    warm += totalStrokes(
      playHole(makeRng(seed), hole, group(seed), { carts: false, handicapAdjust: -4 })
    );
  }
  assert.ok(warm < cold, `cold ${cold} warm ${warm}`);
});

test('a putting adjustment reduces putts', () => {
  const hole = makeHole('straightPar4', 1);
  let plain = 0;
  let helped = 0;
  for (let seed = 1; seed <= 40; seed++) {
    plain += playHole(makeRng(seed), hole, group(seed), { carts: false })
      .scores.reduce((s, x) => s + x.putts, 0);
    helped += playHole(makeRng(seed), hole, group(seed), { carts: false, puttAdjust: -5 })
      .scores.reduce((s, x) => s + x.putts, 0);
  }
  assert.ok(helped < plain, `plain ${plain} helped ${helped}`);
});

test('a refuel stop restores energy and costs time', () => {
  const hole = makeHole('straightPar4', 1);
  const tired = group(3);
  for (const g of tired.guests) g.energy = 15;

  const withStop = playHole(makeRng(3), hole, tired, { carts: false, refuel: true });
  assert.ok(tired.guests.every((g) => g.energy > 40), 'energy should be restored');

  const stillTired = group(3);
  for (const g of stillTired.guests) g.energy = 15;
  const withoutStop = playHole(makeRng(3), hole, stillTired, { carts: false });

  assert.ok(withStop.minutes > withoutStop.minutes - 3,
    'the stop itself costs time even as it speeds later play');
});

test('handicapAdjust never pushes a handicap below zero', () => {
  const hole = makeHole('shortPar3', 1);
  const scratch = group(4);
  for (const g of scratch.guests) g.handicap = 1;
  const r = playHole(makeRng(4), hole, scratch, { carts: false, handicapAdjust: -20 });
  assert.ok(r.scores.every((s) => s.strokes >= 1));
});

test('a driving range measurably improves scoring across a day', () => {
  const without = newGame(21);
  const withRange = newGame(21);
  withRange.resort.amenities.push({ type: 'drivingRange' });
  const a = runDay(without, 5).report.averageSatisfaction;
  const b = runDay(withRange, 5).report.averageSatisfaction;
  assert.ok(b > a, `no range ${a} vs range ${b}`);
});

test('marshals shorten the average round', () => {
  const without = newGame(22);
  without.resort.pricing.teeInterval = 7; // tight enough to queue
  const withMarshals = structuredClone(without);
  withMarshals.resort.staff.push({ role: 'marshal' }, { role: 'marshal' });

  const a = runDay(without, 6).report.averageRoundMinutes;
  const b = runDay(withMarshals, 6).report.averageRoundMinutes;
  assert.ok(b < a, `no marshals ${a} vs marshals ${b}`);
});

test('marshal benefit is capped so it cannot erase a bad design', () => {
  const few = newGame(23);
  few.resort.pricing.teeInterval = 7;
  few.resort.staff.push({ role: 'marshal' });

  const many = structuredClone(few);
  for (let i = 0; i < 20; i++) many.resort.staff.push({ role: 'marshal' });

  const a = runDay(few, 7).report.averageRoundMinutes;
  const b = runDay(many, 7).report.averageRoundMinutes;
  assert.ok(a - b < a * 0.15, 'twenty marshals should not halve the round time');
});

test('a halfway house improves satisfaction over a long day', () => {
  const without = newGame(24);
  const withHouse = newGame(24);
  withHouse.resort.amenities.push({ type: 'halfwayHouse' });
  const a = runDay(without, 8).report.averageSatisfaction;
  const b = runDay(withHouse, 8).report.averageSatisfaction;
  assert.ok(b > a, `no halfway house ${a} vs halfway house ${b}`);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/amenities.test.js`
Expected: FAIL — the options do not exist yet, so warmed and unwarmed play identically.

- [ ] **Step 3: Extend `playHole` in `src/sim/round.js`**

Replace the function signature and the two places handicap is read. The rest of
the function is unchanged.

```js
/** Energy a refuel stop restores golfers to, and what the stop costs. */
const REFUEL_TO = 82;
const REFUEL_MINUTES = 3.5;

export function playHole(
  rng,
  hole,
  group,
  { carts, handicapAdjust = 0, puttAdjust = 0, refuel = false }
) {
  const stats = holeStats(hole);
  const greenDifficulty = GREEN_DIFFICULTY[hole.greenPreset];
  const scores = [];
  const events = [];
  let penaltyMinutes = refuel ? REFUEL_MINUTES : 0;
  let totalStrokes = 0;

  if (refuel) {
    for (const guest of group.guests) {
      guest.energy = Math.max(guest.energy, REFUEL_TO);
    }
    events.push({ type: 'refuel', holeId: hole.id });
  }

  for (const guest of group.guests) {
    // Warm-up and coaching lower the effective handicap, never below scratch.
    const swingHandicap = clamp(guest.handicap + handicapAdjust, 0, 36);
    const puttHandicap = clamp(guest.handicap + puttAdjust, 0, 36);

    let position = { ...hole.teePos };
    let lie = LIE.TEE;
    let strokes = 0;

    while (strokes < MAX_STROKES) {
      if (lie === LIE.GREEN) break;

      const shot = resolveShot(rng, hole, position, lie, swingHandicap);
      // ... unchanged through the end of the while loop ...
```

and further down, the putting call becomes:

```js
    const putts = lie === LIE.GREEN
      ? puttsToHole(rng, feetToPin, puttHandicap, greenDifficulty)
      : 2;
```

The energy drain line is unchanged. Everything else in the function stays as it
was in Task 8.

- [ ] **Step 4: Apply the effects in `src/sim/day.js`**

Add these constants near the top:

```js
/** Warm-up benefit, in effective handicap strokes, on the first two holes. */
const RANGE_WARMUP = -4;
const PRACTICE_GREEN_WARMUP = -5;
const WARMUP_HOLES = 2;

/** The turn: which hole index a halfway house sits before, on a nine. */
const TURN_HOLE_INDEX = 5;

/** Each marshal shaves this fraction off hole times, capped in total. */
const MARSHAL_EFFECT = 0.04;
const MARSHAL_CAP = 0.12;
```

Then, inside `runDay`, replace the play loop so each hole is told about the
amenities:

```js
  const hasRange = amenityTypes.includes('drivingRange');
  const hasPracticeGreen = amenityTypes.includes('practiceGreen');
  const hasHalfwayHouse = amenityTypes.includes('halfwayHouse');

  for (const group of groups) {
    const minutes = [];
    const scores = [];
    holes.forEach((hole, holeIndex) => {
      const warming = holeIndex < WARMUP_HOLES;
      const played = playHole(rng, hole, group, {
        carts,
        handicapAdjust: warming && hasRange ? RANGE_WARMUP : 0,
        puttAdjust: warming && hasPracticeGreen ? PRACTICE_GREEN_WARMUP : 0,
        refuel: hasHalfwayHouse && holeIndex === TURN_HOLE_INDEX,
      });
      minutes.push(played.minutes);
      scores.push(played.scores);
      rawEvents.push({ groupIndex: group.id, holeIndex, events: played.events });
    });
    perGroupHoleMinutes.push(minutes);
    perGroupScores.push(scores);
  }
```

Then apply marshals to the hole times that drive the tee sheet, immediately
after `averageHoleMinutes` is computed:

```js
  // Marshals move slow groups along. Capped, deliberately: staffing must not
  // be a way to buy your way out of a badly designed course.
  const marshals = next.resort.staff.filter((m) => m.role === 'marshal').length;
  const marshalFactor = 1 - Math.min(MARSHAL_CAP, marshals * MARSHAL_EFFECT);
  const pacedHoleMinutes = averageHoleMinutes.map((m) => m * marshalFactor);
```

and pass `pacedHoleMinutes` to `scheduleRounds` in place of `averageHoleMinutes`.

- [ ] **Step 5: Run the new tests and then the whole suite**

Run: `node --test tests/amenities.test.js`
Expected: PASS, 8 passing.

Run: `npm test`
Expected: PASS. Task 8's round tests must still pass unchanged — the new options
all default to off.

- [ ] **Step 6: Commit**

```bash
git add src/sim/round.js src/sim/day.js tests/amenities.test.js
git commit -m "Give the driving range, practice green, marshals and halfway house real effects

These four amenities had a price and a revenue line but no mechanical
consequence, which made building them a fake decision.

The range and practice green now lower effective handicap over the opening
holes, so warmed-up golfers score better and leave happier. Marshals shave
hole times that feed the tee sheet, capped at twelve percent so staffing
cannot buy a way out of a badly designed course. The halfway house
restores energy at the turn in exchange for a fixed time cost, which is a
genuine trade rather than a free upgrade.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: The balance harness, and the first balance pass

This is the task that replaces the guessed numbers in §8.3 of the spec with defensible ones.

**Files:**
- Create: `tools/balance.js`
- Modify: `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md` (§8.3 and §3 values)

- [ ] **Step 1: Write the harness**

```js
// tools/balance.js
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';

const SEEDS = 60;
const DAYS = 60;

/**
 * Runs many resorts through many days and reports whether the economy is
 * sound. This catches the failures a script can catch - runaway money,
 * unavoidable bankruptcy, a gate that never fires or fires instantly -
 * so that playtesting can be spent on whether the game is fun.
 *
 * It plays a deliberately passive operator: no building, no price changes.
 * That is the floor. A thinking player should do better than this, so if
 * the passive operator is already rich, the economy is too generous.
 */
function runSeason(seed) {
  let state = newGame(seed);
  let bankrupt = false;
  let gateDay = null;
  let peakMoney = state.money;

  for (let day = 0; day < DAYS; day++) {
    const result = runDay(state, seed * 1000 + day);
    state = result.state;
    peakMoney = Math.max(peakMoney, state.money);
    if (state.money < 0 && !bankrupt) bankrupt = true;
    if (result.report.gate.passed && gateDay === null) gateDay = day + 1;
  }

  const last = state.history[state.history.length - 1];
  return {
    bankrupt,
    gateDay,
    peakMoney,
    finalMoney: state.money,
    finalPrestige: state.prestige,
    finalTurf: state.turfQuality,
    groupsPlayed: last.groupsPlayed,
    averageSatisfaction: last.averageSatisfaction,
    averageRoundMinutes: last.averageRoundMinutes,
  };
}

const results = [];
for (let seed = 1; seed <= SEEDS; seed++) results.push(runSeason(seed));

const mean = (fn) => results.reduce((s, r) => s + fn(r), 0) / results.length;
const pct = (fn) => (results.filter(fn).length / results.length) * 100;

console.log(`\nCourse Tycoon balance — ${SEEDS} seeds x ${DAYS} days, passive operator\n`);
console.log(`  Bankrupt at any point   ${pct((r) => r.bankrupt).toFixed(0)}%`);
console.log(`  Gate reached            ${pct((r) => r.gateDay !== null).toFixed(0)}%`);
console.log(`  Mean day gate reached   ${
  results.some((r) => r.gateDay)
    ? (results.filter((r) => r.gateDay).reduce((s, r) => s + r.gateDay, 0) /
       results.filter((r) => r.gateDay).length).toFixed(1)
    : 'never'
}`);
console.log(`  Mean final money        $${Math.round(mean((r) => r.finalMoney)).toLocaleString()}`);
console.log(`  Mean final prestige     ${mean((r) => r.finalPrestige).toFixed(1)}`);
console.log(`  Mean final turf         ${mean((r) => r.finalTurf).toFixed(1)}`);
console.log(`  Mean groups per day     ${mean((r) => r.groupsPlayed).toFixed(1)}`);
console.log(`  Mean satisfaction       ${mean((r) => r.averageSatisfaction).toFixed(1)}`);
console.log(`  Mean round time         ${mean((r) => r.averageRoundMinutes).toFixed(0)} min`);
console.log('');
```

- [ ] **Step 2: Run it**

Run: `npm run balance`
Expected: a table of numbers, no crash.

- [ ] **Step 3: Judge the results against these targets**

A passive operator who never builds or adjusts anything should be *struggling but alive*. Compare the output against:

| Measure | Healthy range | What it means if it misses |
|---|---|---|
| Bankrupt at any point | 15–45% | 0% means money is too easy; 80%+ means the game is unwinnable before the player learns anything |
| Gate reached (passive) | 0–15% | A passive operator should almost never graduate — the gate should require actually playing |
| Mean final money | $10k–$60k | Far above means costs are irrelevant |
| Mean groups per day | 25–50 | Near the 66-group ceiling means demand never binds |
| Mean round time | 135–175 min | Above 200 means holes are too slow to be fun; below 110 means pace never bites |
| Mean satisfaction | 45–70 | Pinned at 100 or 0 means a term dominates |
| Mean final turf | 30–80 | At 0 or 100 means the groundskeeper decision is fake |

### Findings already in hand from Task 14

A seven-day run of `newGame(1)` produced these, before any tuning. Start here rather than rediscovering them. The first is a **model gap**, not a constant, and should be fixed before the numbers are tuned around it.

**1. Demand ignores satisfaction entirely — fix this first.** `demandGroups` reads course rating, prestige and price, but never satisfaction. In the observed week guests rated the resort 11–17 out of 100 and turned up in *growing* numbers every day. The player's worst mistakes never reach their wallet, which removes the feedback loop the whole game rests on. Add a satisfaction term: recent average satisfaction should pull demand down hard when it is poor. Until this exists, no amount of constant-tuning makes the economy behave.

**2. Prestige rises on a resort everyone hates.** `nextPrestige` targets `rating * 0.55 + satisfaction * 0.45`, so a well-designed course that plays miserably still climbs — observed 12 → 27 across the week at satisfaction 11. Rating measures the *drawing*, satisfaction measures the *experience*; the experience should weigh at least as heavily.

**3. The gate is trivially reachable.** $50,000 banked by **day 4** with no player action whatsoever, against a target of a passive operator almost never graduating. Profit ran $5.7k–$7.5k per day against costs of only $390. Either costs are far too low, revenue too high, or the money threshold too soft — likely all three.

**4. The opening course cannot process its own tee sheet.** Pinehollow starts with three holes at ~16 minutes each, so it can pass at most ~41 groups through a day, yet the 10-minute interval sells 66 slots and demand delivered 34–44. Rounds took 194–241 minutes on a *three-hole* course. This is the tee interval question below, made sharper: it is not merely tight, it oversells throughput from day one.

**5. Turf decays steadily** from 70 to 40 across the week with one groundskeeper against three holes. That is arguably correct — it makes hiring a real decision — but confirm the recovery curve lets an attentive player actually climb back.

- [ ] **Step 4: Tune the constants, not the tests**

If a measure is out of range, change the constant that drives it and re-run. The knobs, in the order worth trying:

- **Money too easy** → raise `UPKEEP_BASE`, `UPKEEP_PER_BUNKER`, `UPKEEP_PER_POND` in `src/sim/hole.js`, or the `upkeep` figures in `AMENITIES` in `src/sim/economy.js`.
- **Money impossible** → lower the same, or raise the `reputationPull` floor in `demandGroups`.
- **Rounds too slow** → lower `PRE_SHOT` or raise `WALK_YARDS_PER_MIN` in `src/sim/round.js`.
- **Pace never bites** → lower the default `teeInterval` in `src/sim/state.js`.

**Known question to settle here.** Task 9's sanity sweep showed queueing vanishes exactly when the tee interval reaches the average hole time, and holes currently average about 16 minutes against a default `teeInterval` of 10. So the starting resort is already heavily backed up: roughly 231-minute rounds against a 144-minute clean one. Decide deliberately which of these is wanted, rather than letting it stand by accident:

- **Keep it jammed.** Realistic — public courses back up exactly this way — and day one complaints teach the player what pace of play means before they have built anything. Risk: the player starts in a hole they did not dig and may read it as the game being broken.
- **Start near the crossover** (interval 15–16). The player begins healthy and creates their own congestion by building hazards, which makes the mechanic feel earned. Risk: pace never bites for a cautious player.

The balance run will show which produces a better opening few days. Whichever is chosen, `teeInterval` should stay a player-facing dial, because moving it is the clearest lever they have against a course they have made too slow.
- **Gate too easy or unreachable** → adjust `GATE_THRESHOLDS` in `src/sim/acts.js`.
- **Turf pinned** → adjust the `wear` and `care` coefficients in `src/sim/day.js`.

After each change run `npm test` to confirm nothing broke, then `npm run balance` again. Never loosen a test assertion to make a balance number look better.

- [ ] **Step 5: Record the final numbers in the spec**

Update §8.3 and §3 of `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md` so the tuned values replace the guessed ones, and add one line under §8.3 noting the date of the balance pass and the headline result.

- [ ] **Step 6: Commit**

```bash
git add tools/balance.js docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md src/
git commit -m "Add balance harness and tune the economy against it

Runs sixty resorts through sixty days with a deliberately passive operator
who never builds or adjusts prices. That is the floor the economy has to
sit above: if doing nothing already makes money, cost decisions do not
matter.

Tuned the upkeep, pace and gate constants until bankruptcy, demand, round
time and turf all sat in defensible ranges, and recorded the resulting
values in the spec so the guessed starting numbers are gone.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: Guard the simulation's purity

A single stray `Math.random()` or `Date.now()` in `src/sim/` silently destroys determinism, and the failure surfaces much later as an unreproducible bug. Catch it with a test.

**Files:**
- Create: `tests/purity.test.js`

- [ ] **Step 1: Write the test**

```js
// tests/purity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: on Windows .pathname yields "/C:/..." which
// readdir cannot open.
const SIM_DIR = fileURLToPath(new URL('../src/sim/', import.meta.url));

const FORBIDDEN = [
  { pattern: /Math\.random\s*\(/, why: 'breaks determinism — use makeRng()' },
  { pattern: /Date\.now\s*\(/, why: 'breaks determinism — the day carries its own clock' },
  { pattern: /\bnew Date\b/, why: 'breaks determinism — the day carries its own clock' },
  { pattern: /\bdocument\b/, why: 'the simulation must not touch the DOM' },
  { pattern: /\bwindow\b/, why: 'the simulation must not touch the browser' },
  { pattern: /from\s+['"]\.\.\/(render|ui|audio)\//, why: 'the simulation must not import presentation code' },
];

test('no simulation module breaks purity', async () => {
  const files = (await readdir(SIM_DIR)).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'expected simulation modules to exist');

  const violations = [];
  for (const file of files) {
    const source = await readFile(join(SIM_DIR, file), 'utf8');
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(source)) violations.push(`${file}: ${pattern} — ${why}`);
    }
  }
  assert.deepEqual(violations, [], `purity violations:\n${violations.join('\n')}`);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/purity.test.js`
Expected: PASS. If it fails, the named file has a real bug — fix the source, never the test.

- [ ] **Step 3: Run the whole suite one final time**

Run: `npm test`
Expected: PASS, every test across every file.

- [ ] **Step 4: Commit**

```bash
git add tests/purity.test.js
git commit -m "Add a purity guard over the simulation modules

A single Math.random or Date.now in src/sim silently destroys determinism,
and the failure surfaces much later as a bug nobody can reproduce. This
test scans the simulation source for those calls, for DOM access, and for
imports of presentation code, so the architecture's central rule is
enforced rather than merely documented.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Definition of done

- [ ] `npm test` passes with every test above green
- [ ] `npm run balance` prints numbers sitting inside the healthy ranges in Task 16
- [ ] `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md` §3 and §8.3 hold tuned values rather than guessed ones
- [ ] No file in `src/sim/` imports from `src/render/`, `src/ui/` or `src/audio/`
- [ ] Every commit message ends with the `Co-Authored-By` line
- [ ] Nothing was pushed — the user pushes via GitHub Desktop

At that point a complete golf resort simulation exists and can be run from the
command line, and the second plan — rendering, UI, audio and saving — can be
written against a real API with real numbers.
