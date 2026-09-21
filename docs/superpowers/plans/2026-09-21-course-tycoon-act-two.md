# Course Tycoon — Act II Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a golf course people visit into a place people travel to and stay at, under investors who will call the loan if it does not work.

**Architecture:** Act II is additive. The back nine uses the hole editor that already exists; `src/sim/rooms.js` already models who stays and what a bed costs; the investors reuse the non-dismissable decision card built for events. Nothing in Act I is rewritten.

**Spec:** `docs/superpowers/specs/2026-09-21-course-tycoon-act-two-design.md`
**Preceding work:** Act I complete. 530 tests, 134 commits.

**Commits:** End every commit message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Never `git push`, `git fetch` or `git pull`. **Stage by naming paths — never `git add -A`.**

---

## Hard rules

- `src/sim/` stays pure: no `Math.random`, no `Date.now`, no DOM, no imports from `render`/`ui`/`audio`. `tests/purity.test.js` enforces it.
- The UI never computes game outcomes and **never retypes a number** that lives in the simulation.
- No raw hex outside `src/render/palette.js`.
- Touch targets ≥44px; works at **375×812 and 390×664**.
- **All 530 existing tests stay green. Never weaken an assertion to make something pass.**
- Run bare `node --test` — `node --test tests/` fails on this machine (Node 24 + Windows).
- Gate commits with `node --test > /dev/null 2>&1 && git commit ...`. **Never pipe to grep then `&&`** — the pipe reports grep's exit status and commits over failures.
- **Old saves must keep working.** Every slice so far has required it and Act II is no exception: an Act I save loads with no hotel, no investors, and nine holes.

## What is already built

Do not rebuild these. Read them first.

| | where | what it gives you |
|---|---|---|
| Rooms and suites | `src/sim/rooms.js` | `ROOM_TYPES`, `occupancyFor`, `nightlyUpkeep`, `roomRevenue`, `roomDemand` |
| Who stays | `src/sim/segments.js` | `SEGMENTS[key].stays` — `{ chance, nights, prefersSuite }`. **Locals are zero and must stay zero.** |
| The state | `src/sim/state.js` | `resort.rooms = { standard, suite }`, `pricing.roomRate`, `act` |
| A blocking card | `src/ui/event.js` | `mountEventCard` — non-dismissable, already used for decision events |
| The gate | `src/sim/acts.js` | `actOneGate` with `now`/`hint` per condition |

## The measurement rules this project learned the hard way

Read `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md` §15b before
balancing anything. Six confident, wrong conclusions were reached in Act I,
all the same shape: **a thing measured where it cannot work, reported as a
property of the thing.** Act II's version of this trap is measuring a hotel
on a course that draws only locals, who never book a room.

`tools/scenarios.js` holds the baselines. Add Act II ones there, not inline.

---

## Task 1: The back nine — TEST FIRST

**Files:** Modify `src/sim/state.js`, `src/sim/acts.js`; extend `tests/state.test.js`

Nine more empty plots, buildable with the editor that already exists. This is
first because it is the economic engine the rest of the act runs on: the same
course is worth **62% more per round** at eighteen holes ($53 against $86),
and `FULL_COURSE_HOLES = 18` has been sitting in `economy.js` since Act I
waiting for it.

- [ ] **Step 1: Write the failing tests.**

```js
test('a new game has nine holes, and nine more plots waiting', () => {
  const s = newGame(1);
  assert.equal(s.resort.courses[0].holes.length, 18,
    'the back nine exists as empty ground from the start');
  const built = s.resort.courses[0].holes.filter((h) => h.corridor?.length > 1);
  assert.ok(built.length <= 3, 'but only the opening holes are actually built');
});

test('holes ten to eighteen start unbuilt and unplayable', () => {
  const s = newGame(1);
  for (const hole of s.resort.courses[0].holes.slice(9)) {
    assert.equal(hole.open, false);
    assert.deepEqual(hole.corridor, []);
    assert.equal(hole.teePos, null);
  }
  // openHoles already refuses holes without geometry, so this cannot
  // produce the NaN day that forcing a stub open used to.
  assert.ok(openHoles(s).every((h) => h.corridor.length > 1));
});

test('an Act I save grows a back nine when it loads', () => {
  const nineHoleSave = JSON.parse(serialize(newGame(2)));
  nineHoleSave.resort.courses[0].holes = nineHoleSave.resort.courses[0].holes.slice(0, 9);
  const loaded = deserialize(JSON.stringify(nineHoleSave));
  assert.equal(loaded.resort.courses[0].holes.length, 18);
  assert.equal(loaded.resort.courses[0].holes[12].open, false);
});

test('the Act I gate still asks for nine holes, not eighteen', () => {
  // Act I must not get harder because Act II exists.
  assert.equal(GATE_THRESHOLDS.holesOpen, 9);
});
```

- [ ] **Step 2: Run and watch them fail.** `node --test`. Expect `18 !== 9`.

- [ ] **Step 3: Implement.** In `newGame`, loop to 18 rather than 9. In
`deserialize`, pad a short `holes` array up to 18 with the same empty-plot
shape, so an Act I save gains the ground without gaining any holes.

Leave `GATE_THRESHOLDS.holesOpen` at 9. **Act I must not become harder because
Act II was written.**

- [ ] **Step 4: Run and watch them pass.** All 530 prior tests must still be green.

- [ ] **Step 5: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/sim/state.js tests/state.test.js && git commit -m "Lay out the back nine as ground the player can build on

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: The hotel takes money and costs money — TEST FIRST

**Files:** Modify `src/sim/day.js`, `src/sim/economy.js`; extend `tests/day.test.js`

`rooms.js` already computes occupancy and revenue. Nothing calls it.

- [ ] **Step 1: Write the failing tests.**

```js
test('a hotel sells rooms and the day reports it', () => {
  const state = newGame(31);
  state.resort.rooms = { standard: 8, suite: 4 };
  state.resort.pricing.roomRate = 90;
  state.prestige = 70;
  const { report } = runDay(state, 3);
  assert.ok(report.hotel, 'the report should describe the hotel');
  assert.equal(report.hotel.capacity, 12);
  assert.ok(report.hotel.sold >= 0 && report.hotel.sold <= 12);
  assert.ok(Number.isFinite(report.revenue.rooms));
});

test('an empty hotel still costs its upkeep', () => {
  // The load-bearing rule. Without it, occupancy is a vanity figure.
  function costs(rooms) {
    const state = newGame(32);
    state.resort.rooms = rooms;
    state.resort.pricing.roomRate = 400; // nobody will pay this
    return runDay(state, 4).report.costs.total;
  }
  assert.ok(costs({ standard: 20, suite: 10 }) > costs({ standard: 0, suite: 0 }) + 1000,
    'thirty empty rooms should cost a great deal more than none');
});

test('a resort with no hotel is not in the hotel business', () => {
  const { report } = runDay(newGame(33), 5);
  assert.equal(report.hotel.capacity, 0);
  assert.equal(report.revenue.rooms, 0);
  // Not 0% occupancy — an investor target must never read "no hotel" as failure.
  assert.equal(report.hotel.rate, 0);
});

test('a locals-only course cannot fill a hotel at any price', () => {
  // Act II's central squeeze, end to end through the day loop rather
  // than through rooms.js alone.
  const state = newGame(34);
  state.resort.rooms = { standard: 20, suite: 10 };
  state.resort.pricing.roomRate = 10;
  // Force a locals crowd: a gentle, cheap course.
  state.resort.pricing.greenFee = 15;
  const { report } = runDay(state, 6);
  if ((report.crowd.destination?.count ?? 0) === 0 && (report.crowd.serious?.count ?? 0) === 0) {
    assert.equal(report.hotel.sold, 0, 'locals do not book rooms in their own town');
  }
});
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** In `day.js`, after the crowd is known:

```js
  const occupancy = occupancyFor({
    rooms: next.resort.rooms,
    crowd: golfersBySegment,
    roomRate: next.resort.pricing.roomRate,
    valuePerRound: value,
  });
  revenue.rooms = roomRevenue({ occupancy, roomRate: next.resort.pricing.roomRate });
  revenue.total += revenue.rooms;
  costs.rooms = nightlyUpkeep(next.resort.rooms);
  costs.total += costs.rooms;
```

and put `hotel: occupancy` on the report beside `kitchen` and `shop`.

Use the **same per-segment golfer counts `menuRevenue` uses**, so the two can
never disagree about how many people are on the property.

- [ ] **Step 4: Run and watch them pass.**

- [ ] **Step 5: Commit.**

---

## Task 3: Hotel amenities — TEST FIRST

**Files:** Create `src/sim/hotelAmenities.js`, `tests/hotelAmenities.test.js`; modify `src/sim/economy.js`

Fourteen of them, from spec §5. The three that do mechanical work rather than
flavour are the point of the task.

- [ ] **Step 1: Write the failing tests.**

```js
test('every hotel amenity is fully specified', () => {
  for (const [id, a] of Object.entries(HOTEL_AMENITIES)) {
    assert.ok(a.label && a.blurb, `${id} has no copy`);
    assert.ok(a.build > 0 && a.upkeep > 0, `${id} must cost something`);
    assert.ok(['overnight', 'day', 'both'].includes(a.serves), `${id}: bad serves`);
    for (const key of SEGMENT_KEYS) {
      const draw = a.appeal[key];
      assert.ok(draw >= 0 && draw <= 1, `${id}.appeal.${key} out of range`);
    }
  }
});

test('NO HOTEL AMENITY PLEASES EVERY CROWD', () => {
  // The same guarantee items, menus and holes already carry. It is the
  // structure the whole game rests on and it must survive a new surface.
  for (const [id, a] of Object.entries(HOTEL_AMENITIES)) {
    const universal = SEGMENT_KEYS.every((k) => a.appeal[k] >= 0.8);
    assert.ok(!universal, `${id} pleases everybody: ${JSON.stringify(a.appeal)}`);
  }
});

test('something is built for each crowd, and for day visitors', () => {
  for (const key of SEGMENT_KEYS) {
    assert.ok(Object.values(HOTEL_AMENITIES).some((a) => a.appeal[key] >= 0.7),
      `nothing in the hotel is really for ${key}`);
  }
  assert.ok(Object.values(HOTEL_AMENITIES).some((a) => a.serves === 'day'),
    'locals never book rooms, so something must serve them without one');
});

test('the indoor range earns when the weather closes the course', () => {
  // The best mechanical idea in the act: weather swings demand from 1.12
  // to 0.10 in a storm and leaves every other building idle. A range
  // under a roof is the one thing that takes money on the worst day of
  // the month, so it smooths variance rather than adding revenue.
  const range = HOTEL_AMENITIES.indoorRange;
  assert.ok(range.weatherProof, 'the indoor range must be weather-proof');
  assert.ok(!HOTEL_AMENITIES.pool.weatherProof, 'an outdoor pool is not');
});

test('the short course diverts golfers rather than attracting more', () => {
  // The only thing in the game that helps pace by subtraction.
  assert.ok(HOTEL_AMENITIES.shortCourse.divertsGroups > 0);
});

test('the kids club lengthens stays rather than drawing more of them', () => {
  assert.ok(HOTEL_AMENITIES.kidsClub.extraNights > 0);
  assert.ok(!HOTEL_AMENITIES.pool.extraNights);
});
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement** `src/sim/hotelAmenities.js` with all fourteen from
spec §5. Shape:

```js
{
  id, label, blurb,
  build, upkeep,
  serves: 'overnight' | 'day' | 'both',
  appeal: { locals, serious, destination },
  weatherProof: false,   // indoor range: earns in a storm
  divertsGroups: 0,      // short course: takes beginners off the main course
  extraNights: 0,        // kids' club, spa: lengthens a stay
}
```

The three special fields are the task. Everything else is a building with a
price.

- [ ] **Step 4: Run and watch them pass.**

- [ ] **Step 5: Commit.**

---

## Task 4: The investors arrive — TEST FIRST

**Files:** Create `src/sim/investors.js`, `tests/investors.test.js`; modify `src/sim/state.js`, `src/sim/day.js`

- [ ] **Step 1: Write two test helpers first.** Every test below needs them,
and leaving them implied is how a plan turns into guesswork.

```js
/** A resort at the moment Act II begins: gate passed, hotel built, a
 * crowd that will actually stay. Measuring a hotel on a locals-only
 * course is Act II's version of the measurement trap in spec §15b. */
function startOfActTwo(seed = 1) {
  const state = newGame(seed);
  state.act = 2;
  state.money = 200000;
  state.prestige = 65;
  state.resort.rooms = { standard: 12, suite: 6 };
  state.resort.pricing.roomRate = 95;
  state.investors = startingInvestors(state);
  return state;
}

/** The same resort, with the investors about to call the loan. */
function atConfidence(level, seed = 2) {
  const state = startOfActTwo(seed);
  state.investors.confidence = level;
  return state;
}
```

- [ ] **Step 2: Write the failing tests.**

```js
test('confidence starts at 55 and moves only at a review', () => {
  let state = startOfActTwo();
  const opening = state.investors.confidence;
  assert.equal(opening, 55);
  for (let d = 0; d < REVIEW_EVERY - 1; d++) state = runDay(state, 700 + d).state;
  assert.equal(state.investors.confidence, opening,
    'confidence must not drift — a number that moves on its own cannot be steered');
});

test('THE TARGET IS KNOWN BEFORE THE PERIOD IT COVERS', () => {
  // The same rule the weather follows: unforecastable pressure is noise
  // that punishes at random. A player who can see "occupancy above 60% by
  // day 42" can steer; one ambushed at the review can only be unlucky.
  let state = startOfActTwo();
  const promised = state.investors.nextTarget;
  assert.ok(promised, 'a target must exist before the review that assesses it');
  assert.ok(promised.dueDay > state.day);
  for (let d = 0; state.day < promised.dueDay; d++) {
    const r = runDay(state, 800 + d);
    state = r.state;
    if (state.day <= promised.dueDay) {
      assert.deepEqual(r.report.investors.target.measure, promised.measure,
        'the target changed under the player mid-period');
      assert.equal(r.report.investors.target.threshold, promised.threshold);
    }
  }
});

test('the measure assessed is the measure that was promised', () => {
  let state = startOfActTwo();
  const promised = state.investors.nextTarget;
  let review = null;
  for (let d = 0; d < REVIEW_EVERY + 2 && !review; d++) {
    const r = runDay(state, 900 + d);
    state = r.state;
    if (r.report.investors.reviewed) review = r.report.investors.reviewed;
  }
  assert.ok(review, 'a review should have happened by now');
  assert.equal(review.measure, promised.measure);
});

test('the same measure never comes up twice running', () => {
  let state = startOfActTwo();
  const seen = [];
  for (let d = 0; d < REVIEW_EVERY * 5; d++) {
    const r = runDay(state, 1000 + d);
    state = r.state;
    if (r.report.investors.reviewed) seen.push(r.report.investors.reviewed.measure);
  }
  for (let i = 1; i < seen.length; i++) {
    assert.notEqual(seen[i], seen[i - 1], `asked for ${seen[i]} twice running`);
  }
});

test('meeting a target raises confidence and missing lowers it', () => {
  assert.ok(confidenceChange('beat') > confidenceChange('met'));
  assert.ok(confidenceChange('met') > 0);
  assert.ok(confidenceChange('missed') < 0);
  assert.ok(confidenceChange('missedBadly') < confidenceChange('missed'));
});

test('a resort with no hotel is never judged on occupancy', () => {
  // "No hotel" is not 0% occupancy, and an investor must not read it as
  // failure — see rooms.js.
  const judged = assessTarget({ measure: 'occupancy', threshold: 0.6 },
    { hotel: { capacity: 0, rate: 0 } });
  assert.notEqual(judged, 'missedBadly');
});
```

- [ ] **Step 3: Run and watch them fail.**

- [ ] **Step 4: Implement** `src/sim/investors.js`:

```js
export const REVIEW_EVERY = 14;
export const STARTING_CONFIDENCE = 55;
export const MEASURES = ['occupancy', 'revenuePerRoom', 'prestige', 'satisfaction'];
```

`state.investors = { confidence, nextTarget, lastReviewDay, principal, seen }`.

`nextTarget` is `{ measure, threshold, dueDay }` and is **set the moment the
previous review ends**, never at the review itself. Targets scale with how
many rooms exist; the first is deliberately gentle.

Selection is seeded off the day's rng, weighted, and never repeats the
previous measure — the same no-repeat rule narration and events use.

- [ ] **Step 5: Run and watch them pass.**

- [ ] **Step 6: Commit.**

---

## Task 5: The buyout — TEST FIRST

**Files:** Modify `src/sim/investors.js`, `src/sim/day.js`; extend `tests/investors.test.js`

- [ ] **Step 1: Write the failing tests.**

```js
test('confidence at zero demands the money back rather than taking the hotel', () => {
  const state = atConfidence(0);
  const { report, state: next } = runDay(state, 1200);
  assert.ok(report.investors.buyoutDemand, 'they should call the loan');
  assert.ok(report.investors.buyoutDemand.amount > 0);
  assert.equal(next.resort.rooms.standard, state.resort.rooms.standard,
    'the hotel is not confiscated — it is a debt, not a repossession');
});

test('paying the buyout ends the act pressure for good', () => {
  const state = atConfidence(0);
  state.money = 500000;
  const paid = payBuyout(state);
  assert.equal(paid.investors.bought, true);
  assert.ok(paid.money < state.money, 'it must actually cost the money');
  // Reviews stop. This is the good ending and it must be reachable.
  const after = runDay(paid, 1300).report;
  assert.equal(after.investors.reviewed, null);
  assert.equal(after.investors.buyoutDemand, null);
});

test('failing to pay sells rooms at the same haircut demolition takes', () => {
  const state = atConfidence(0);
  state.money = 0;
  const after = forceLiquidation(state);
  assert.ok(totalRooms(after.resort.rooms) < totalRooms(state.resort.rooms),
    'rooms should be sold to clear the debt');
  // 60%, the same as DEMOLITION_REFUND, for the same reason.
  assert.ok(after.money >= 0, 'liquidation should clear the debt, not deepen it');
});

test('the demand is visible for a fortnight before it lands', () => {
  // A player should never be surprised by the buyout, only unable to stop it.
  const state = atConfidence(0);
  const { report } = runDay(state, 1400);
  assert.ok(report.investors.buyoutDemand.dueDay >= report.day + 10);
});
```

- [ ] **Step 2: Run, fail, implement, pass.** Export `payBuyout(state)` and
`forceLiquidation(state)`, both pure.

- [ ] **Step 3: Commit.**

---

## Task 6: The rooms screen — visual checkpoint

**Files:** Create `src/ui/hotel.js`; modify `src/ui/panels.js`

- [ ] **Step 1: Implement.** A sheet that builds standard rooms and suites,
sets the nightly rate, and shows last night's occupancy against capacity.
Every figure read live from `rooms.js`. The suite rate is **shown, not set** —
it is a multiple of the same slider.

Show the nightly upkeep of what is already built, prominently. That number is
the whole argument against overbuilding and the player should see it grow as
they tap.

- [ ] **Step 2: Look at it** at 375×812 **and 390×664**. **It is wrong if** the
upkeep figure is below the fold while the build buttons are above it.

- [ ] **Step 3: Commit.**

---

## Task 7: Confidence and the target on screen — visual checkpoint

**Files:** Modify `src/ui/hud.js`, `src/ui/report.js`; reuse `src/ui/event.js`

- [ ] **Step 1: Implement.**

- Confidence in the HUD for the whole act, beside the crowd bars.
- The standing target on the report: measure, threshold, **today's actual
  figure**, and the day it is due. The gap must never be a surprise.
- The investors' arrival, each review, and the buyout demand delivered on the
  existing non-dismissable card (`mountEventCard`). They are a character, not
  a notification.

- [ ] **Step 2: Look at it.** **It is wrong if** the HUD overflows at 375px —
it is already at 44px with five figures on it, so check before adding a sixth.

- [ ] **Step 3: Commit.**

---

## Task 8: Teach the operator to play Act II, then balance it

**Files:** Modify `tools/operator.js`, `tools/scenarios.js`, `tools/balance.js`

**`tests/operator.test.js` will already be failing by this point**, because the
operator does not mention rooms. That is by design — the guard exists because
an operator that could not hire a marshal once reported that Act I had one
winning line when it has four.

- [ ] **Step 1: Add an `actTwoStart` scenario** to `tools/scenarios.js`, with
its limits written beside it as every scenario there has.

- [ ] **Step 2: Teach the operator** to build the back nine, build and price
rooms, buy hotel amenities, and steer for the standing target. Add anything it
still will not do to `LEVERS_NOT_PULLED` with a reason.

- [ ] **Step 3: Run `npm run balance`** and report verbatim. Targets from spec §8:

- A competent operator reaches the buyout in **90–120 days** of Act II.
- **At least three strategies survive**, as Act I has three.
- Overbuilding is a real way to lose: double the rooms you can fill should
  trend toward a buyout you cannot pay.
- Confidence recovers from one bad review and not from three.

- [ ] **Step 4: Record any tuning in the spec** with the numbers that prompted
it, and commit.

---

## Where Act II ends

The spec leaves the gate to Act III sketched rather than settled, because
Act III is undesigned — and that is honest, but it leaves this plan without
a finish line. So, explicitly:

**Paying the buyout is the end of Act II.** Task 5 builds it as "the act's
pressure is over and you have earned it", and that is the win condition. The
investors leave, reviews stop, and the player owns an eighteen-hole resort
with a hotel outright.

What it does **not** do in this plan is set `state.act = 3`, because there is
nothing there yet. Leave the act at 2 and leave a comment saying why. A player
who reaches it has finished the content that exists, and the honest thing is
for the game to say so rather than to open a door onto an empty room.

## Definition of done

- [ ] All 530 prior tests green, plus the new suites
- [ ] `tests/purity.test.js` passes
- [ ] `tests/operator.test.js` passes — the operator can play what it measures
- [ ] No hotel amenity pleases every crowd
- [ ] Locals never occupy a room, at any price, end to end through the day loop
- [ ] An empty room costs upkeep, by test
- [ ] The target assessed is always the target promised
- [ ] An Act I save loads, grows a back nine, and has no hotel and no investors
- [ ] Three strategies survive Act II
- [ ] Paying the buyout ends the act cleanly and does not open an empty Act III
- [ ] Nothing pushed

## Out of scope

A second course, zones and shuttles (Act III). Seasons. Staff morale. Playing
a hole yourself. Room service as a menu — **food and drink is finished, do not
reopen it.**
