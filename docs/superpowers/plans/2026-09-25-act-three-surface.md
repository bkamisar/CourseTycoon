# Act III Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Act III reachable and playable — a resort that settles with its investors is invited to bid for championships, builds the infrastructure a gallery needs, sets the course up on a dial it can see, and reads how the week went.

**Architecture:** The simulation is already complete and measured (see `2026-09-25-act-three-simulation.md`). Nothing here changes how a championship scores or pays. It adds the entry point (`state.act = 3`, which nothing currently sets), four buildings as data in a new `src/sim/championshipBuildings.js`, one sheet in `src/ui/championship.js`, cards in `src/ui/championshipCard.js`, and a section on the evening report. Every UI file keeps this project's split: a pure `compute*` function tests can call, and a `mount*` function that is untestable DOM plumbing.

**Tech Stack:** ES modules, no build step, `node --test`, hand-rolled DOM. `src/sim/` is pure — no DOM, no clock, no `Math.random` — and `tests/purity.test.js` enforces it by grepping source **text, including comments and prose**. It once failed on an event about broken *windows* because of `/\bwindow\b/`.

---

## Before you start: things that will bite you

**1. There are exactly five screens, and that is a contract.** `src/ui/screens.js` declares `SCREEN_NAMES = ['start', 'overview', 'editor', 'playback', 'report']`, and `src/main.js` carries a comment that a sixth would break it. Everything here is a **sheet** — an overlay opened from a toolbar button — following `src/ui/hotel.js` and `openHotelSheet`. Do not add a screen.

**2. Holes live at `state.resort.courses[0].holes`, not `state.resort.holes`.** Assigning to the latter is silently ignored. A measurement was lost to this: it reported 33-minute rounds because it was quietly playing three holes. `openHoles(state)` from `src/sim/state.js` is the accessor. Assert your fixture's open-hole count before trusting any number from it.

**3. `newGame` starts with 3 built holes and 15 unbuilt stubs.** A championship needs 18. `tests/tournamentDay.test.js` has an `openFullCourse` helper showing the correct construction; reuse that approach rather than inventing one.

**4. Championship buildings share the `resort.amenities` array with hotel amenities**, because `tournaments.eligibleFor` already reads `(resort?.amenities ?? []).map((a) => a.type)` and checks each rung's `requires`. That means `hotelUpkeep` does **not** bill them — it returns 0 for unknown types, which `tests/hotelAmenities.test.js` pins. Task 2 adds a separate upkeep function and wires it in. Skip that and four expensive buildings cost nothing to run.

**5. Do not put these buildings in `src/sim/hotelAmenities.js`.** Its tests assert exactly fourteen entries, that no entry pleases every crowd, and that every entry serves `'overnight'`, `'day'` or `'both'`. Championship infrastructure is deliberately dead capital serving none of those.

**6. The suite must end at 0 fail with exactly 1 todo.** That todo is a documented balance issue in `tests/tournamentDay.test.js` (see `docs/known-issues.md`, "Conditioning a course raises average satisfaction"). It prints an assertion trace which is **not** a failure. Never convert it without saying so.

**7. Commit hygiene.** Stage only your own files by explicit path and run `git status --short` first — another process may have staged files, and a commit once swallowed an unrelated fix that way. End every commit message with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Never run `git push`, `git fetch` or `git pull`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/sim/championshipBuildings.js` | **new.** Four buildings as frozen data; upkeep; gallery capacity; whether a gallery is handled. Pure. |
| `src/sim/day.js` | modify. Bill championship upkeep. Set `act = 3`. Judge `crowdHandled`. Set the Act IV gate. |
| `src/sim/state.js` | modify. `actThreeArrived` so the invitation fires once. |
| `src/ui/championship.js` | **new.** The sheet: build infrastructure, apply for a rung, set the dial. Plus `computeChampionshipData`. |
| `src/ui/championshipCard.js` | **new.** Invitation, signed contract, result — pure card data. Mirrors `src/ui/investorCard.js`. |
| `src/ui/report.js` | modify. A tournament section: what the field shot, and the four conditions. |
| `src/ui/hud.js` | modify. The countdown, deferred from Plan 1's Task 9. |
| `src/main.js` | modify. A `Championship` toolbar button, and the card queue. |

---

## Task 1: Let a resort reach Act III

`state.act` goes 1 → 2 and stops. Nothing sets it to 3, so the act is unreachable whatever UI exists. The spec: *"Act II ends with the investors settled — bought out, or having pulled out and sold rooms to do it. Act III opens with a letter from a governing body."* A liquidated resort still enters; it is poorer, which makes the act harder, and *"the governing body does not read balance sheets."*

**Files:**
- Modify: `src/sim/state.js`
- Modify: `src/sim/day.js`
- Test: `tests/tournamentDay.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tournamentDay.test.js`:

```js
test('settling with the investors opens Act III, once', () => {
  for (const ending of ['bought', 'liquidated']) {
    const state = openFullCourse(actThreeResort(21));
    state.act = 2;
    state.prestige = 80;
    state.investors = { confidence: 50, principal: 200000, bought: false, liquidated: false };
    state.investors[ending] = true;

    const first = runDay(state, 5200);
    assert.equal(first.state.act, 3, `${ending} should open Act III`);
    assert.equal(first.report.actThreeArrived, true, `${ending} should announce it`);

    const second = runDay(first.state, 5201);
    assert.equal(second.state.act, 3);
    assert.equal(second.report.actThreeArrived ?? false, false,
      'the invitation must not arrive twice');
  }
});

test('an unsettled Act II stays in Act II', () => {
  const state = openFullCourse(actThreeResort(22));
  state.act = 2;
  state.investors = { confidence: 50, principal: 200000, bought: false, liquidated: false };
  const { state: after, report } = runDay(state, 5210);
  assert.equal(after.act, 2, 'still answering to the investors');
  assert.equal(report.actThreeArrived ?? false, false);
});

test('a three-hole resort is not invited, however well it is run', () => {
  const state = actThreeResort(23);
  state.act = 2;
  state.prestige = 90;
  state.investors = { confidence: 90, principal: 200000, bought: true, liquidated: false };
  const { state: after } = runDay(state, 5220);
  assert.equal(after.act, 2, 'three holes cannot host a championship');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournamentDay.test.js`
Expected: FAIL — `after.act` is 2 and `actThreeArrived` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/state.js`, in the object `newGame` returns, beside `tournament: null` and `tournamentsHosted: []`:

```js
    // Act III's invitation fires once, the evening the investors settle.
    // Stored rather than derived, because "are they settled now" is true
    // every evening afterwards too, and a letter that arrives every night
    // is not a letter.
    actThreeArrived: false,
```

And in `deserialize`, back-fill it the way `tournamentsHosted` is handled, so a save written before this field loads rather than crashing:

```js
  if (typeof parsed.actThreeArrived !== 'boolean') parsed.actThreeArrived = false;
```

In `src/sim/day.js`, find the `if (gate.passed) { next.act = 2; ... }` block near the end of `runDay` (around line 922). **After** that block add:

```js
  /**
   * Act III opens when the investors are settled and the course is a
   * championship course.
   *
   * Either ending qualifies. A resort that was liquidated is poorer and
   * has fewer rooms, which makes the act harder, but the governing body
   * does not read balance sheets.
   *
   * `holes` is this day's open holes, computed earlier in this function.
   */
  const settled = Boolean(next.investors?.bought || next.investors?.liquidated);
  if (next.act === 2 && settled && holes.length >= CHAMPIONSHIP_HOLES) {
    next.act = 3;
    if (!next.actThreeArrived) {
      next.actThreeArrived = true;
      report.actThreeArrived = true;
    }
  }
```

Extend the existing `./tournaments.js` import at the top of `src/sim/day.js` to include `CHAMPIONSHIP_HOLES`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournamentDay.test.js`
Then: `node --test "tests/*.test.js"`
Expected: 0 fail, exactly 1 todo.

- [ ] **Step 5: Commit**

```bash
git add src/sim/state.js src/sim/day.js tests/tournamentDay.test.js
git commit -m "Let a settled resort reach Act III, which nothing did before"
```

---

## Task 2: The four buildings

The spec's §5: four buildings gated by rung, *"mostly dead capital, deliberately… the player pays to be capable, not to be busy."* The hospitality pavilion is the exception, because a building that can host a wedding between championships is one a real resort would put up.

**Files:**
- Create: `src/sim/championshipBuildings.js`
- Modify: `src/sim/day.js`
- Test: `tests/championshipBuildings.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/championshipBuildings.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNGS, RUNG_IDS } from '../src/sim/tournaments.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import {
  CHAMPIONSHIP_BUILDINGS, CHAMPIONSHIP_BUILDING_IDS,
  championshipUpkeep, galleryCapacity, galleryFor, crowdHandledFor,
} from '../src/sim/championshipBuildings.js';

test('there are four, each fully specified', () => {
  assert.equal(CHAMPIONSHIP_BUILDING_IDS.length, 4);
  for (const id of CHAMPIONSHIP_BUILDING_IDS) {
    const b = CHAMPIONSHIP_BUILDINGS[id];
    assert.equal(b.id, id, `${id}: id does not match its key`);
    assert.ok(b.label && b.blurb && b.blurb.length > 30, `${id}: thin copy`);
    assert.ok(b.build > 0 && b.upkeep > 0, `${id}: must cost something`);
    assert.ok(b.gallery > 0, `${id}: must hold some of the gallery`);
  }
});

test('every building a rung requires actually exists', () => {
  // The rungs already name their requirements and `eligibleFor` already
  // checks them. If a name there and a name here drift apart, the rung
  // becomes permanently unreachable and nothing else would say so.
  for (const id of RUNG_IDS) {
    for (const needed of RUNGS[id].requires) {
      assert.ok(CHAMPIONSHIP_BUILDINGS[needed],
        `${id} requires "${needed}", which no building provides`);
    }
  }
});

test('upkeep sums, and a hotel amenity is not billed here', () => {
  assert.equal(championshipUpkeep([]), 0);
  assert.equal(championshipUpkeep([{ type: 'grandstands' }]),
    CHAMPIONSHIP_BUILDINGS.grandstands.upkeep);
  assert.equal(championshipUpkeep([{ type: 'pool' }]), 0,
    'hotelUpkeep bills the pool; billing it here too would bill it twice');
});

test('a county open needs no buildings, and a national needs the whole property', () => {
  assert.ok(crowdHandledFor([], 'countyOpen'),
    'a county open draws a crowd the resort already has room for');

  const pair = [{ type: 'grandstands' }, { type: 'overflowParking' }];
  assert.ok(!crowdHandledFor(pair, 'regional'),
    'the two buildings a regional REQUIRES must not by themselves handle its '
    + 'gallery, or the crowd bonus is free the moment the rung is biddable');
  assert.ok(crowdHandledFor([...pair, { type: 'hospitalityPavilion' }], 'regional'),
    'and buying a national building early must be one way to solve it');

  const all = CHAMPIONSHIP_BUILDING_IDS.map((type) => ({ type }));
  assert.ok(!crowdHandledFor(all, 'national'),
    'even all four must not cover a national on their own');
  assert.ok(crowdHandledFor([...all,
    { type: 'shortCourse' }, { type: 'brewPub' }, { type: 'functionRoom' }], 'national'),
    'a national should need the rest of the property pitching in');
});

test('gallery capacity rises with what is built, and starts above zero', () => {
  assert.ok(galleryCapacity([]) > 0, 'a clubhouse and a car park hold somebody');
  assert.ok(galleryCapacity([{ type: 'grandstands' }]) > galleryCapacity([]));
  assert.ok(galleryFor('national') > galleryFor('regional'));
  assert.ok(galleryFor('regional') > galleryFor('countyOpen'));
  assert.equal(galleryFor('nonsense'), 0);
});

test('championship buildings cost money every day', () => {
  // Through the real day loop, because they share the amenities array
  // with the hotel's and `hotelUpkeep` deliberately ignores them.
  function dailyCost(types) {
    const state = newGame(61);
    for (const type of types) state.resort.amenities.push({ id: type, type, menu: [] });
    return runDay(state, 61).report.costs.total;
  }
  assert.ok(dailyCost(['grandstands']) > dailyCost([]),
    'grandstands must show up on the bill');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/championshipBuildings.test.js`
Expected: FAIL — `Cannot find module '../src/sim/championshipBuildings.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/sim/championshipBuildings.js`:

```js
/**
 * What a championship needs that a resort does not.
 *
 * These are deliberately **dead capital**. Eleven of the fourteen hotel
 * buildings earn something every day; these earn nothing between events,
 * and that is the decision being asked for — whether to sink money into a
 * stand that is empty fifty-one weeks a year so that once, for one week,
 * four thousand people have somewhere to sit.
 *
 * The hospitality pavilion is the exception, because a building that can
 * host a wedding between championships is one a real resort would put up.
 *
 * Kept out of `hotelAmenities.js` on purpose. That file guarantees every
 * entry serves overnight guests or day visitors and that none pleases
 * every crowd; these serve neither and please nobody, and bending those
 * invariants would cost more than a second file does.
 *
 * They do share the `resort.amenities` array, because
 * `tournaments.eligibleFor` already checks each rung's `requires` against
 * the types built there. Which means `hotelUpkeep` does not bill them — it
 * returns 0 for types it does not know — so `championshipUpkeep` exists
 * and `day.js` adds it separately.
 *
 * Pure data. Nothing in `src/sim/` computes with a DOM or a clock.
 */
const LIST = [
  {
    id: 'grandstands', label: 'Grandstands', build: 65000, upkeep: 220,
    rung: 'regional', gallery: 3000,
    blurb: 'Scaffold, planking and a safety certificate. Empty fifty-one weeks a year, and the only reason four thousand people can watch the eighteenth at all.',
  },
  {
    id: 'overflowParking', label: 'Overflow parking', build: 38000, upkeep: 90,
    rung: 'regional', gallery: 2500,
    blurb: 'Two fields, a hardcore track and a gate. Nobody has ever admired a car park, and a championship without one is a traffic story in the local paper instead of a golf story.',
  },
  {
    id: 'mediaCentre', label: 'Media centre', build: 90000, upkeep: 340,
    rung: 'national', gallery: 800,
    blurb: 'Desks, cabling, and somewhere to put forty laptops and a coffee urn. The week is only national if somebody files copy about it.',
  },
  {
    id: 'hospitalityPavilion', label: 'Hospitality pavilion', build: 110000, upkeep: 400,
    rung: 'national', gallery: 2200,
    // The one that is not dead capital. `trade` matches the shape
    // `hotelAmenities.js` uses for the function room, so the existing
    // indoor-trade machinery earns from it without a new code path.
    trade: { base: 380, weather: 520 },
    blurb: 'A marquee on a permanent base with a kitchen behind it. Corporate tables during the championship, weddings and dinners the rest of the year, which is why it is the only one of these that earns its keep in February.',
  },
];

export const CHAMPIONSHIP_BUILDINGS = Object.freeze(Object.fromEntries(
  LIST.map((b) => [b.id, Object.freeze(b)])
));

export const CHAMPIONSHIP_BUILDING_IDS = Object.freeze(LIST.map((b) => b.id));

/**
 * What the gallery for each rung amounts to.
 *
 * Set so the buildings a rung *requires* are deliberately not enough on
 * their own. If the required pair covered a regional's gallery, the crowd
 * bonus would be free the moment the rung became biddable — which is the
 * same fault the band gate was added to fix, arriving by another door.
 */
const GALLERY = Object.freeze({
  countyOpen: 1200,
  regional: 7500,
  national: 12000,
});

/** How many people a rung brings through the gate. 0 for an unknown rung. */
export function galleryFor(rungId) {
  return GALLERY[rungId] ?? 0;
}

/**
 * The clubhouse, the car park and the verges.
 *
 * A county open is watched by people who parked on the grass and stood
 * behind a rope, and a resort that has finished two acts can do that
 * without building anything. Non-zero so the smallest rung is not gated
 * on infrastructure the spec says it does not need.
 */
export const BASE_GALLERY_CAPACITY = 1500;

/**
 * What the rest of the property lends a championship.
 *
 * From the spec's callbacks table: the short course is "somewhere for the
 * gallery and a practice area", the brew pub is "where the gallery eats".
 * A national needs these, which is the point — the biggest week asks the
 * whole resort for help, not only the four buildings bought for it.
 */
const BORROWED_GALLERY = Object.freeze({
  shortCourse: 1200,
  brewPub: 500,
  functionRoom: 400,
  conferenceSuite: 400,
  pool: 300,
});

/** Everyone the property can hold, given what stands on it. */
export function galleryCapacity(amenities = []) {
  let held = BASE_GALLERY_CAPACITY;
  for (const built of amenities) {
    held += CHAMPIONSHIP_BUILDINGS[built.type]?.gallery ?? 0;
    held += BORROWED_GALLERY[built.type] ?? 0;
  }
  return held;
}

/** Whether the gallery this rung draws has somewhere to be. */
export function crowdHandledFor(amenities = [], rungId) {
  const needed = galleryFor(rungId);
  if (!needed) return false;
  return galleryCapacity(amenities) >= needed;
}

/** Daily upkeep of the championship buildings, summed. */
export function championshipUpkeep(amenities = []) {
  let total = 0;
  for (const built of amenities) {
    total += CHAMPIONSHIP_BUILDINGS[built.type]?.upkeep ?? 0;
  }
  return total;
}
```

In `src/sim/day.js`, find where costs are extended — `costs.foodCost = food.foodCost; costs.total += food.foodCost;` around line 502 — and add below:

```js
  // The championship buildings. They share the amenities array with the
  // hotel's, and `hotelUpkeep` returns 0 for types it does not know, so
  // without this line four expensive buildings cost nothing to run.
  costs.championshipUpkeep = championshipUpkeep(next.resort.amenities);
  costs.total += costs.championshipUpkeep;
```

Add the import at the top of `src/sim/day.js`:

```js
import { championshipUpkeep, crowdHandledFor } from './championshipBuildings.js';
```

`crowdHandledFor` is unused until Task 3; that is fine, there is no linter in this project.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/championshipBuildings.test.js`
Then: `node --test "tests/*.test.js"`
Expected: 0 fail, exactly 1 todo.

If "a national needs the whole property" fails, check the arithmetic: base 1500 + grandstands 3000 + parking 2500 + media 800 + pavilion 2200 = 10000, under the national's 12000; adding shortCourse 1200 + brewPub 500 + functionRoom 400 gives 12100. Adjust `GALLERY` or the capacities so **both** directions hold — do not change the test.

- [ ] **Step 5: Commit**

```bash
git add src/sim/championshipBuildings.js src/sim/day.js tests/championshipBuildings.test.js
git commit -m "Add the four championship buildings, and bill them"
```

---

## Task 3: Judge the crowd instead of assuming it

`src/sim/day.js` has `crowdHandled: true` with a comment saying the crowd is infrastructure a later plan builds. That plan is this one. Until now it has been a bonus nobody could fail — logged in `docs/known-issues.md`.

**Files:**
- Modify: `src/sim/day.js`
- Modify: `docs/known-issues.md`
- Test: `tests/tournamentDay.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tournamentDay.test.js`:

```js
test('the crowd bonus is earned by having somewhere to put them', () => {
  // Both directions. This condition spent its whole life hardcoded true,
  // so a test checking only the passing case would have agreed with the bug.
  function hostWith(types) {
    const state = openFullCourse(actThreeResort(31));
    state.prestige = 90;
    state.resort.setup = 86;
    state.resort.setupTarget = 86;
    state.turfQuality = 95;
    for (const type of types) state.resort.amenities.push({ id: type, type, menu: [] });
    state.tournament = { rung: 'national', day: state.day, resolved: false };
    return runDay(state, 5300).report.tournament;
  }

  const four = ['grandstands', 'overflowParking', 'mediaCentre', 'hospitalityPavilion'];
  const bare = hostWith(four);
  assert.ok(!bare.met.includes('crowd'),
    'four buildings alone cannot hold a national gallery');

  const helped = hostWith([...four, 'shortCourse', 'brewPub', 'functionRoom']);
  assert.ok(helped.met.includes('crowd'), 'with the property helping, it can');
  assert.ok(helped.paid > bare.paid, 'and the contract should pay more for it');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournamentDay.test.js`
Expected: FAIL — `bare.met` includes `'crowd'`, because it is hardcoded.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/day.js`, replace:

```js
      // Crowd is infrastructure, which the second plan builds. Until it
      // exists, a rung with no building requirements is always handled.
      crowdHandled: true,
```

with:

```js
      // Whether the gallery this rung draws has somewhere to be. A rung's
      // REQUIRED buildings are deliberately not enough on their own -- see
      // `championshipBuildings.js` -- so this is a decision rather than a
      // consequence of having been allowed to bid.
      crowdHandled: crowdHandledFor(next.resort.amenities, next.tournament.rung),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournamentDay.test.js`
Then: `node --test "tests/*.test.js"`
Expected: 0 fail, exactly 1 todo.

Other tests assert payouts that assumed crowd was free. Where one fails, **give the fixture the buildings it needs rather than lowering the assertion** — the payout numbers are the design, and a test that passes because the bar moved is worse than no test. Name the fixtures you adjusted in your commit message.

- [ ] **Step 5: Delete the fixed known-issues entry**

Remove the whole `### "Crowd handled" is a bonus nobody can fail` section from `docs/known-issues.md`. That file's own rule, stated at the top: *"Fixed entries are deleted rather than annotated. A file of mostly-solved problems is one nobody reads."*

- [ ] **Step 6: Commit**

```bash
git add src/sim/day.js tests/tournamentDay.test.js docs/known-issues.md
git commit -m "Judge the championship crowd against somewhere to put it"
```

---

## Task 4: The championship sheet

One sheet, three jobs: put up buildings, apply for a rung, set the dial. Modelled on `src/ui/hotel.js` — read that file first, particularly `openHotelSheet` and `amenityRow`, and match its conventions rather than inventing new ones.

The pure part is `computeChampionshipData`, which is what tests exercise. This project does not test DOM mounting; see `tests/report.test.js`, which tests `computeReportData` and never touches `mountReport`.

**Files:**
- Create: `src/ui/championship.js`
- Test: `tests/championship.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/championship.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { computeChampionshipData } from '../src/ui/championship.js';

function championshipResort(seed = 1) {
  const state = newGame(seed);
  state.act = 3;
  state.money = 500000;
  state.prestige = 84;
  state.resort.courses[0].holes = state.resort.courses[0].holes.map((h, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  return state;
}

test('the sheet offers the next rung and says what it needs', () => {
  const data = computeChampionshipData(championshipResort(1));
  assert.equal(data.next.id, 'countyOpen', 'the ladder starts at the bottom');
  assert.equal(data.next.eligible, true, 'eighteen holes and prestige 84 should qualify');
  assert.equal(data.booked, null, 'nothing booked yet');
  assert.ok(data.contract, 'the contract must be quotable before it is signed');
  assert.equal(data.contract.baseFee, RUNGS.countyOpen.baseFee);
  assert.equal(data.contract.bonuses.length, 4);
});

test('an ineligible rung says which requirement is missing, not just no', () => {
  // A button that is disabled for reasons the player cannot see is the
  // same bug as a cost line that lies.
  const state = championshipResort(2);
  state.prestige = 40;
  state.tournamentsHosted = ['countyOpen'];
  const data = computeChampionshipData(state);
  assert.equal(data.next.id, 'regional');
  assert.equal(data.next.eligible, false);
  assert.ok(data.next.missing.some((m) => /prestige/i.test(m)),
    `expected a prestige reason, got ${JSON.stringify(data.next.missing)}`);
  assert.ok(data.next.missing.some((m) => /grandstand/i.test(m)),
    `expected the buildings named, got ${JSON.stringify(data.next.missing)}`);
});

test('the dial reports where it is, where it is going, and whether that is right', () => {
  const state = championshipResort(3);
  state.tournament = { rung: 'countyOpen', day: state.day + 10, resolved: false };
  state.resort.setup = 30;
  state.resort.setupTarget = 52;

  const data = computeChampionshipData(state);
  assert.equal(data.booked.rung, 'countyOpen');
  assert.equal(data.booked.daysLeft, 10);
  assert.equal(data.dial.setup, 30);
  assert.equal(data.dial.target, 52);
  assert.equal(data.dial.targetInBand, true, '52 is inside the county band of 45-60');
  assert.equal(data.dial.arrived, false, 'the course is at 30, not 52');

  // And the other side, because a readout that always says "fine" is
  // worse than none.
  state.resort.setupTarget = 90;
  const off = computeChampionshipData(state);
  assert.equal(off.dial.targetInBand, false,
    'asking for 90 at a county open must not read as ready');
});

test('the sheet says whether the crowd is covered, and by how much', () => {
  const state = championshipResort(4);
  state.tournament = { rung: 'countyOpen', day: state.day + 5, resolved: false };
  const data = computeChampionshipData(state);
  assert.ok(data.gallery.needed > 0);
  assert.ok(data.gallery.capacity > 0);
  assert.equal(data.gallery.handled, data.gallery.capacity >= data.gallery.needed);
});

test('the ladder shows what has been hosted and what is left', () => {
  const state = championshipResort(5);
  state.tournamentsHosted = ['countyOpen'];
  const data = computeChampionshipData(state);
  const county = data.ladder.find((r) => r.id === 'countyOpen');
  const regional = data.ladder.find((r) => r.id === 'regional');
  assert.equal(county.hosted, true);
  assert.equal(regional.hosted, false);
  assert.equal(data.ladder.length, 3);
});

test('when the ladder is finished there is nothing left to apply for', () => {
  const state = championshipResort(6);
  state.tournamentsHosted = ['countyOpen', 'regional', 'national'];
  const data = computeChampionshipData(state);
  assert.equal(data.next, null, 'three rungs and no more');
  assert.equal(data.contract, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/championship.test.js`
Expected: FAIL — `Cannot find module '../src/ui/championship.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/championship.js`. Write `computeChampionshipData` first and make the tests pass, then add `mountChampionshipSheet` beneath it:

```js
/**
 * The championship sheet: infrastructure, the ladder, and the dial.
 *
 * Act III's whole decision surface. Until this existed the act was
 * complete in simulation and unreachable in play — nothing called
 * `bidFor`, so `state.tournament` was never set and a player who finished
 * Act II simply kept playing Act II.
 *
 * `computeChampionshipData` is pure and is what the tests exercise; the
 * mount function below is DOM plumbing. Everything the sheet claims is
 * read off the simulation rather than recomputed here, because the bug
 * this project produces more than any other is the interface telling the
 * player something the simulation disagrees with.
 */
import { openHoles } from '../sim/state.js';
import {
  RUNG_IDS, RUNGS, contractFor, nextRungFor, eligibleFor, withinBand,
  CHAMPIONSHIP_HOLES, RUN_UP_DAYS,
} from '../sim/tournaments.js';
import {
  CHAMPIONSHIP_BUILDINGS, CHAMPIONSHIP_BUILDING_IDS,
  galleryCapacity, galleryFor, crowdHandledFor,
} from '../sim/championshipBuildings.js';

/**
 * Why a rung cannot be applied for, in words the player can act on.
 *
 * A disabled button with no reason is the same fault as a cost line that
 * does not say what it buys.
 */
function missingFor(state, rungId) {
  const rung = RUNGS[rungId];
  const reasons = [];
  const holes = openHoles(state).length;
  if (holes < CHAMPIONSHIP_HOLES) {
    reasons.push(`${CHAMPIONSHIP_HOLES} open holes (you have ${holes})`);
  }
  if (state.prestige < rung.prestige) {
    reasons.push(`prestige ${rung.prestige} (you have ${Math.round(state.prestige)})`);
  }
  const built = new Set((state.resort.amenities ?? []).map((a) => a.type));
  for (const id of rung.requires) {
    if (!built.has(id)) reasons.push(CHAMPIONSHIP_BUILDINGS[id]?.label ?? id);
  }
  return reasons;
}

/** Everything the sheet needs, and nothing it recomputes. */
export function computeChampionshipData(state) {
  const holesOpen = openHoles(state).length;
  const hosted = state.tournamentsHosted ?? [];
  const nextId = nextRungFor(hosted);
  const booked = state.tournament && !state.tournament.resolved ? state.tournament : null;

  const rungForGallery = booked?.rung ?? nextId;
  const needed = galleryFor(rungForGallery);
  const capacity = galleryCapacity(state.resort.amenities ?? []);

  const setup = Math.round(state.resort.setup ?? 0);
  const target = Math.round(state.resort.setupTarget ?? 0);
  const band = booked ? RUNGS[booked.rung].band : (nextId ? RUNGS[nextId].band : null);

  return {
    money: state.money,
    runUpDays: RUN_UP_DAYS,
    next: nextId
      ? {
          id: nextId,
          label: RUNGS[nextId].label,
          blurb: RUNGS[nextId].blurb,
          band: RUNGS[nextId].band,
          prepPerDay: RUNGS[nextId].prepPerDay,
          eligible: eligibleFor(nextId, {
            prestige: state.prestige, resort: state.resort, holesOpen,
          }),
          missing: missingFor(state, nextId),
        }
      : null,
    contract: nextId ? contractFor(nextId) : null,
    booked: booked
      ? {
          rung: booked.rung,
          label: RUNGS[booked.rung].label,
          daysLeft: Math.max(0, booked.day - state.day),
          band: RUNGS[booked.rung].band,
          prepPerDay: RUNGS[booked.rung].prepPerDay,
          contract: contractFor(booked.rung),
        }
      : null,
    dial: {
      setup,
      target,
      band,
      // Is the course where it needs to be, and is the player even asking
      // for the right thing? Two different questions, and a sheet that
      // answered only the first would let somebody grind three weeks
      // toward a number that was never going to score.
      targetInBand: band ? withinBand(target, band) : false,
      inBand: band ? withinBand(setup, band) : false,
      arrived: target > 0 && setup >= target,
    },
    gallery: {
      needed,
      capacity,
      handled: rungForGallery ? crowdHandledFor(state.resort.amenities ?? [], rungForGallery) : false,
    },
    buildings: CHAMPIONSHIP_BUILDING_IDS.map((id) => {
      const spec = CHAMPIONSHIP_BUILDINGS[id];
      const built = (state.resort.amenities ?? []).some((a) => a.type === id);
      return {
        id,
        label: spec.label,
        blurb: spec.blurb,
        build: spec.build,
        upkeep: spec.upkeep,
        gallery: spec.gallery,
        forRung: RUNGS[spec.rung]?.label ?? spec.rung,
        built,
        affordable: state.money >= spec.build,
      };
    }),
    ladder: RUNG_IDS.map((id) => ({
      id,
      label: RUNGS[id].label,
      hosted: hosted.includes(id),
      band: RUNGS[id].band,
      baseFee: RUNGS[id].baseFee,
      ceiling: RUNGS[id].purseCeiling,
    })),
  };
}
```

Then the mount function. Follow `openHotelSheet`'s structure exactly — `sheetHost.open({ id, title, render(body) {...} })` with a local `rerender()` that calls `body.replaceChildren()`, and `onChange` to commit state upward. Three sections in this order, because it is the order the player needs them: **the dial** (only when something is booked, because it is the live decision), **apply for the next rung**, then **the buildings**.

Buying a building pushes `{ id, type, menu: [] }` onto `state.resort.amenities` and subtracts `spec.build` from `state.money`, matching how `amenityRow` in `src/ui/hotel.js` does it. Applying for a rung calls `bidFor(state, id, { holesOpen })` from `../sim/tournaments.js` and assigns the result to `state.tournament` — and if `bidFor` returns null it must not be treated as booked. Setting the dial writes `state.resort.setupTarget`.

Use `injectStyles()` with a `championship-` class prefix, as `src/ui/hotel.js` does with `hotel-`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/championship.test.js`
Expected: PASS, 6 tests.
Then: `node --test "tests/*.test.js"` — 0 fail, exactly 1 todo.

- [ ] **Step 5: Commit**

```bash
git add src/ui/championship.js tests/championship.test.js
git commit -m "Add the championship sheet: buildings, the ladder and the dial"
```

---

## Task 5: Wire the sheet into the game

The sheet exists but nothing opens it. This is the task that makes Act III reachable.

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add the toolbar button**

In `src/main.js`, import the sheet beside the hotel's:

```js
import { mountChampionshipSheet } from './ui/championship.js';
```

Then, immediately after the `hotelButton` definition and its `.update`, add the same shape:

```js
/**
 * The championship, which only exists from Act III. Hidden until then
 * rather than disabled, for the same reason the hotel button is: a button
 * that does nothing is a question the player has to keep answering.
 */
const championshipButton = toolbarButton('Championship', () => {
  mountChampionshipSheet(sheets, {
    state,
    onChange: (next) => {
      commitState(next);
      hud.update(state);
      amenityBar.update(state);
    },
  });
});
championshipButton.update = () => {
  championshipButton.hidden = (state?.act ?? 1) < 3;
};
```

- [ ] **Step 2: Register it**

Add `championshipButton` to the `overviewToolbar.append(...)` call (it lists `nineToggle`, `hotelButton`, `Amenities`, `Staff`; around line 426), placing it after `hotelButton`, and add `championshipButton.update();` beside `hotelButton.update();` (around line 525).

- [ ] **Step 3: Verify by hand**

There is no DOM test for `main.js` wiring; this project tests pure functions and wires DOM by inspection. Load the game, confirm no console errors, and confirm the button is absent in Acts I and II.

Run: `node --test "tests/*.test.js"`
Expected: 0 fail, exactly 1 todo — nothing here should change any test.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "Open the championship sheet from the toolbar, so Act III is reachable"
```

---

## Task 6: The cards

Three moments deserve a card rather than a grey line on the report: the invitation, a bid accepted, and the result. Mirrors `src/ui/investorCard.js`, which exists for exactly this reason — Act II's pressure originally arrived as small grey lines and read like a bank statement.

**Files:**
- Create: `src/ui/championshipCard.js`
- Modify: `src/main.js`
- Test: `tests/championshipCard.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/championshipCard.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNGS } from '../src/sim/tournaments.js';
import { championshipCards } from '../src/ui/championshipCard.js';

test('no cards on an ordinary evening', () => {
  assert.deepEqual(championshipCards({ day: 40 }, {}), []);
});

test('the invitation arrives as its own card', () => {
  const cards = championshipCards({ day: 60, actThreeArrived: true }, { act: 3 });
  assert.equal(cards.length, 1);
  assert.match(cards[0].id, /invit/i);
  assert.ok(cards[0].prompt.length > 80, 'a letter from a governing body deserves words');
  assert.equal(cards[0].choices.length, 1, 'an announcement, not a decision');
});

test('the result names every condition, met or missed', () => {
  // The whole point of four named conditions is that the player can see
  // which one cost them. A card that only showed the total would make the
  // contract an opaque score again.
  const report = {
    day: 90,
    tournament: {
      rung: 'countyOpen',
      met: ['band', 'turf'],
      missed: ['pace', 'crowd'],
      paid: 61000,
      prestige: 4,
      barDays: 0,
      field: {
        averageToPar: 5.4, underPar: 2, best: -2,
        hardestHole: 14, averageRoundMinutes: 268,
      },
    },
  };
  const cards = championshipCards(report, { act: 3 });
  assert.equal(cards.length, 1);
  const card = cards[0];
  for (const condition of ['band', 'turf', 'pace', 'crowd']) {
    assert.ok(card.conditions.some((c) => c.id === condition),
      `${condition} must appear on the result card`);
  }
  assert.equal(card.conditions.filter((c) => c.met).length, 2);
  assert.match(card.prompt, /61,000/, 'the money must be in the words');
});

test('a barred rung says so, because a setback the player cannot see is a dead end', () => {
  const report = {
    day: 90,
    tournament: {
      rung: 'countyOpen', met: [], missed: ['band', 'turf', 'pace', 'crowd'],
      paid: RUNGS.countyOpen.baseFee, prestige: -6, barDays: 120,
      field: { averageToPar: 1.2, underPar: 19, best: -7, hardestHole: 3, averageRoundMinutes: 240 },
    },
  };
  const [card] = championshipCards(report, { act: 3 });
  assert.match(card.prompt, /120|season/i, 'the bar has to be stated');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/championshipCard.test.js`
Expected: FAIL — `Cannot find module '../src/ui/championshipCard.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/championshipCard.js`. Export `championshipCards(report, state)` returning an array, exactly as `investorCards` does. Follow that file's conventions: a `{ id, kicker, speaker, prompt, choices }` shape, `choices: [{ label, cost: '' }]` for an announcement, and every claim read off `report` rather than recomputed.

The result card additionally carries `conditions: [{ id, label, met, amount }]` built from the contract's own line items and the report's `met`/`missed`, so the card and the payout can never disagree.

Write the copy in the voice the rest of the game uses — the invitation is a letter from a governing body, and the result is a write-up. Include what the field shot, since `report.tournament.field` carries it and it is the read-out the whole setup dial exists for.

**Prose warning:** this file is in `src/ui/`, so `tests/purity.test.js` does not grep it. But keep the copy free of anything that reads as a mechanic being explained; this project's rule is that a line explaining a mechanic is a worse line than one that lets the player work it out.

- [ ] **Step 4: Queue the cards in `src/main.js`**

Find `showInvestorCards` and the block that calls `investorCards(dayResult.report, dayResult.state)` around line 698. Championship cards queue **after** the investors' and **before** the pending decision event, because the investors' card is about the act being left and the decision event is about tomorrow.

Import it beside `investorCards`, then extend the queue — the simplest correct change is to concatenate both lists into the existing queue player, since it already plays a list one card at a time and hands over when empty:

```js
  const investor = investorCards(dayResult.report, dayResult.state);
  const championship = championshipCards(dayResult.report, dayResult.state);
  const queue = [...investor, ...championship];
  if (queue.length > 0) {
    showInvestorCards(queue);
    return;
  }
```

Rename `showInvestorCards` to `showEveningCards` in the same commit, since it no longer plays only the investors' cards, and update its doc comment — a function whose name has drifted from its job is how the next reader gets misled.

- [ ] **Step 5: Run the suite**

Run: `node --test tests/championshipCard.test.js`
Then: `node --test "tests/*.test.js"`
Expected: 0 fail, exactly 1 todo.

- [ ] **Step 6: Commit**

```bash
git add src/ui/championshipCard.js tests/championshipCard.test.js src/main.js
git commit -m "Give the championship its own cards: the letter, the contract and the write-up"
```

---

## Task 7: The tournament on the evening report

The card is the moment; the report is the record. `report.tournament.field` already carries the scoring picture and `met`/`missed` carry the conditions — none of it is rendered anywhere.

**Files:**
- Modify: `src/ui/report.js`
- Test: `tests/report.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/report.test.js`:

```js
test('a championship day puts the tournament on the report', () => {
  const { state, report } = runDay(newGame(71), 71);
  report.tournament = {
    rung: 'countyOpen',
    met: ['band', 'turf'],
    missed: ['pace', 'crowd'],
    paid: 61000, prestige: 4, barDays: 0,
    field: {
      averageToPar: 5.4, underPar: 2, best: -2, worst: 14,
      hardestHole: 14, hardestHoleOverPar: 1.4,
      averageRoundMinutes: 268, players: 60, par: 72,
    },
  };
  const data = computeReportData(state, report);
  assert.ok(data.tournament, 'the report must carry the championship');
  assert.equal(data.tournament.paid, 61000, 'read from the report, not recomputed');
  assert.equal(data.tournament.conditions.length, 4, 'all four named, met or not');
  assert.equal(data.tournament.field.averageToPar, 5.4);
});

test('an ordinary day has no tournament section', () => {
  const { state, report } = runDay(newGame(72), 72);
  const data = computeReportData(state, report);
  assert.equal(data.tournament ?? null, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/report.test.js`
Expected: FAIL — `data.tournament` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/report.js`, add to the object `computeReportData` returns:

```js
    // Act III. Null on every ordinary day, so the report simply does not
    // draw the section. Read straight off the report -- the figures were
    // settled when the day ran and recomputing them here is how an
    // interface starts disagreeing with its own simulation.
    tournament: tournamentSection(report),
```

And above `computeReportData`:

```js
/** The championship, as the evening report tells it. Null if there wasn't one. */
function tournamentSection(report) {
  const t = report?.tournament;
  if (!t) return null;
  const contract = contractFor(t.rung);
  return {
    rung: t.rung,
    label: RUNGS[t.rung]?.label ?? t.rung,
    paid: t.paid,
    ceiling: contract?.ceiling ?? 0,
    prestige: t.prestige,
    barDays: t.barDays,
    field: t.field,
    conditions: (contract?.bonuses ?? []).map((b) => ({
      id: b.id,
      label: b.label,
      amount: b.amount,
      met: (t.met ?? []).includes(b.id),
    })),
  };
}
```

Import `contractFor` and `RUNGS` from `../sim/tournaments.js`.

Then render it in `mountReport`, following how the existing sections are built with `breakdownSection`. Put it **above** the revenue and cost breakdown: on the day of a championship, the championship is the news and the takings are a footnote.

The scoring picture should read like the spec's §6a rather than a table of fields — the field averaged so many over par, this many broke par, and which hole took the most off them.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/report.test.js`
Then: `node --test "tests/*.test.js"`
Expected: 0 fail, exactly 1 todo.

- [ ] **Step 5: Commit**

```bash
git add src/ui/report.js tests/report.test.js
git commit -m "Put the championship and what the field shot on the evening report"
```

---

## Task 8: The countdown on the HUD

Deferred from Plan 1's Task 9, where it would have displayed nothing because no tournament could be booked. It can now.

**Files:**
- Modify: `src/ui/hud.js`
- Test: `tests/hud.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/hud.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { computeHudData } from '../src/ui/hud.js';

test('the HUD says nothing about tournaments when none is booked', () => {
  assert.equal(computeHudData(newGame(1)).tournament, null);
});

test('the HUD counts down to a booked championship', () => {
  const state = newGame(2);
  state.day = 40;
  state.resort.setup = 70;
  state.resort.setupTarget = 70;
  state.tournament = { rung: 'regional', day: 61, resolved: false };

  const data = computeHudData(state);
  assert.ok(data.tournament, 'a booking has to reach the HUD');
  assert.equal(data.tournament.daysLeft, 21);
  assert.equal(data.tournament.label, 'Regional Championship');
  assert.equal(data.tournament.setup, 70);
  // The band is the decision. A countdown that does not say whether the
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

test('a resolved championship leaves the HUD', () => {
  const state = newGame(4);
  state.day = 62;
  state.tournament = { rung: 'countyOpen', day: 61, resolved: true };
  assert.equal(computeHudData(state).tournament, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hud.test.js`
Expected: FAIL — `data.tournament` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/hud.js`, import:

```js
import { RUNGS, withinBand } from '../sim/tournaments.js';
```

Add above `computeHudData`:

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

And to the object `computeHudData` returns:

```js
    // Act III. Null when nothing is booked, so the HUD simply does not
    // draw it. `inBand` is included because a countdown that does not say
    // whether the course is set right is a clock rather than information.
    tournament: tournamentReadout(state),
```

In `mountHud`, beside the other spans:

```js
  const tournament = document.createElement('span');
  tournament.className = 'hud-tournament';
```

Append it to `bar` after the existing children, and in `update(state)`:

```js
    if (data.tournament) {
      const t = data.tournament;
      const when = t.daysLeft === 0 ? 'today' : `${t.daysLeft}d`;
      tournament.textContent =
        `${t.label} ${when} · setup ${t.setup} (want ${t.band.low}-${t.band.high})`;
      tournament.hidden = false;
      tournament.classList.toggle('hud-tournament--off', !t.inBand);
    } else {
      tournament.hidden = true;
    }
```

And in `injectStyles`:

```js
    .hud-tournament { color: ${PALETTE.ACCENT}; }
    .hud-tournament--off { color: ${PALETTE.SAND}; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hud.test.js`
Expected: PASS, 4 tests.
Then: `node --test "tests/*.test.js"` — 0 fail, exactly 1 todo.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hud.js tests/hud.test.js
git commit -m "Count down to the championship on the HUD, with the band beside it"
```

---

## Task 9: The Act IV gate

The spec's §8: *"Act III's gate: host a National Open successfully."* At which point Act IV's question — the far course, or converting to a private members' club — is open. Act IV is not built; this task only records that the gate has been passed, so the next plan has something to start from and the player is told they finished the act.

**Files:**
- Modify: `src/sim/day.js`
- Test: `tests/tournamentDay.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tournamentDay.test.js`:

```js
test('hosting a national properly passes Act III', () => {
  const state = openFullCourse(actThreeResort(41));
  state.act = 3;
  state.prestige = 90;
  state.resort.setup = 86;
  state.resort.setupTarget = 86;
  state.turfQuality = 95;
  for (const type of ['grandstands', 'overflowParking', 'mediaCentre',
    'hospitalityPavilion', 'shortCourse', 'brewPub', 'functionRoom']) {
    state.resort.amenities.push({ id: type, type, menu: [] });
  }
  state.tournament = { rung: 'national', day: state.day, resolved: false };

  const { state: after, report } = runDay(state, 5400);
  assert.ok(report.tournament.met.includes('band'), 'sanity: the week went well');
  assert.equal(after.actThreePassed, true, 'a good national should finish the act');
  assert.equal(report.actThreePassed, true, 'and the evening should say so');
});

test('a botched national does not pass Act III', () => {
  // The other side. Hosting is not passing, or the gate is just an
  // attendance record.
  const state = openFullCourse(actThreeResort(42));
  state.act = 3;
  state.prestige = 90;
  state.resort.setup = 5;
  state.resort.setupTarget = 0;
  state.turfQuality = 30;
  state.tournament = { rung: 'national', day: state.day, resolved: false };

  const { state: after } = runDay(state, 5410);
  assert.ok(!(after.actThreePassed ?? false),
    'turning up is not the same as delivering');
});

test('a county open never passes Act III, however perfect', () => {
  const state = openFullCourse(actThreeResort(43));
  state.act = 3;
  state.prestige = 90;
  state.resort.setup = 52;
  state.resort.setupTarget = 52;
  state.turfQuality = 95;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };
  const { state: after } = runDay(state, 5420);
  assert.ok(!(after.actThreePassed ?? false), 'the gate is the national, not the ladder');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tournamentDay.test.js`
Expected: FAIL — `after.actThreePassed` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/state.js`, beside `actThreeArrived`:

```js
    // Act III is passed by hosting a national properly, not by hosting
    // one. See the gate below.
    actThreePassed: false,
```

And in `deserialize`:

```js
  if (typeof parsed.actThreePassed !== 'boolean') parsed.actThreePassed = false;
```

In `src/sim/day.js`, where the tournament result is assigned to `report.tournament`, add after it:

```js
  /**
   * Act III's gate: a national, hosted properly.
   *
   * "Properly" is the band, because the band is the whole act -- a course
   * that was never set for a championship did not host one, which is why
   * it gates the bonuses too. Turning up is not delivering.
   */
  if (result.rung === 'national' && result.met.includes('band') && !next.actThreePassed) {
    next.actThreePassed = true;
    report.actThreePassed = true;
  }
```

Adjust the variable names to match the surrounding code — the result of `scoreTournament` may be bound to something other than `result` at that point in the file. Read it rather than assuming.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tournamentDay.test.js`
Then: `node --test "tests/*.test.js"`
Expected: 0 fail, exactly 1 todo.

- [ ] **Step 5: Commit**

```bash
git add src/sim/state.js src/sim/day.js tests/tournamentDay.test.js
git commit -m "Pass Act III on a national delivered, not merely hosted"
```

---

## Task 10: Measure the act as it will actually be played

Every previous Act III measurement ran against an operator that never built infrastructure, so only the County Open was ever reachable and the higher rungs have **never been measured at all**. That is now fixable, and it is the only way to know whether the ladder works.

**Files:**
- Modify: `tools/operator.js`
- Test: none — `tools/` is measurement, not shipped code

- [ ] **Step 1: Teach the operator to build for a rung**

In `tools/operator.js`, extend `spendTheTournamentMorning` so that before bidding it buys any building the next rung requires and it can afford, and any building needed to cover that rung's gallery. Keep the existing behaviour of asking for the band's midpoint.

Import from `../src/sim/championshipBuildings.js`:

```js
import {
  CHAMPIONSHIP_BUILDINGS, CHAMPIONSHIP_BUILDING_IDS, crowdHandledFor,
} from '../src/sim/championshipBuildings.js';
```

- [ ] **Step 2: Correct `LEVERS_NOT_PULLED`**

It currently says the operator never builds championship infrastructure. That will no longer be true. Replace that entry with what is genuinely still unmeasured — declining a rung it could afford, and choosing *not* to cover the gallery when the bonus is worth less than the buildings.

A stale entry in that list is worse than no entry: it tells the next reader a lever is unmeasured when it is, or measured when it is not.

- [ ] **Step 3: Measure and report**

Write a sweep in the scratch directory (not the repo), at least 8 seeds, carrying resorts through Acts I and II into Act III with `play`, `playActTwo` and `playActThree`. Use green fee **80** and tee interval **14** — a fee of 26 never passes Act I. Clone with `deserialize(serialize(state))`. Compare against a never-bids control by setting `state.tournamentsHosted = [...RUNG_IDS]`.

**Use money deltas, not `report.profit`.** `day.js` computes `profit` before the contract is scored and then pushes the fee into `revenue`, so on a hosting day `report.profit` excludes the fee while `revenue.total` includes it. A previous measurement undercounted every tournament by its full fee this way.

Report:

1. **How far up the ladder a competent operator gets.** If it still stops at the County Open, say why — that is the finding.
2. **Whether each rung is worth hosting**, contract income against the run-up bill plus the buildings.
3. **Whether the buildings pay back**, given each rung is hosted once and their upkeep is forever.
4. **Whether the crowd condition is a real decision** — how often the gallery was covered, and what it cost to cover.
5. **Whether Act III can be passed**, and how long it takes from the invitation.

**Report before changing anything.** Do not tune in the same pass as measuring — that is how Act I ended up with a confident, wrong report.

- [ ] **Step 4: Commit**

```bash
git add tools/operator.js
git commit -m "Teach the operator to build for a rung, and measure the whole ladder"
```

---

## Self-review against the spec

**§2 How the act opens** — Task 1. Both endings enter; the eighteen-hole prerequisite is enforced.

**§3 The ladder** — already built in Plan 1. Task 4 surfaces it; Task 10 measures it above rung one for the first time.

**§4 Championship setup** — the dial is in Plan 1; Task 4 exposes `setupTarget`, Task 8 puts it on the HUD with its band.

**§5 Infrastructure** — Task 2. Four buildings, rung-gated, dead capital except the pavilion.

**§6 The week itself** — the closed course, the hotel and the four conditions are Plan 1. Task 3 makes the fourth condition real.

**§6a What the field shoots** — computed in Plan 1's `field.js`; Task 6 and Task 7 render it.

**§6b Weather and what it finds out** — the callbacks table is explicitly *"a principle rather than a single joke"* and *"not all of these need building"*. Task 2 honours the two the spec names as gallery space (short course, brew pub) by giving them capacity. The drainage callback is **not** in this plan; it wants its own, alongside the event system.

**§7 The contract** — Plan 1, with band-as-precondition added after measurement. Task 4 quotes it before signing; Task 6 reports it after.

**§8 Stakes and the gate** — Task 9. Prestige and the bar are already in `scoreTournament`.

**§11 Out of scope** — no named players, no leaderboard, no far course, no seasons. Nothing here adds any.

**Known gaps, deliberately:**
- Act IV is not built. Task 9 records the gate and stops.
- The drainage/§6b callbacks beyond gallery space are left for a later plan.
- `docs/known-issues.md` will still carry "Conditioning a course raises average satisfaction" and "Only the County Open is ever reachable" — Task 10 is what tells us whether the second is still true.
