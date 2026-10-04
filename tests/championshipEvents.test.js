import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import { EVENTS, SPEAKERS, STANCES, eventContext } from '../src/sim/events.js';
import {
  CHAMPIONSHIP_EVENTS, championshipAxes, ORDERED_AXES, UNORDERED_AXES,
  pinSettingPhrase, pacePhrase, resolveChoice, pendingEffectNote,
  drawEventPlan, eventPlanSeed, pickChampionshipEvent, rememberChampionshipEvent,
} from '../src/sim/championshipEvents.js';
import { newGame, serialize, deserialize } from '../src/sim/state.js';
import { makeRng } from '../src/sim/rng.js';
import { PRACTICE_DAYS_BEFORE, practiceSeed } from '../src/sim/practiceRound.js';
import { newWeek } from '../src/sim/championshipWeek.js';
import { RUNGS, RUNG_IDS, contractFor } from '../src/sim/tournaments.js';
import { applyEventChoice, pendingEventFor } from '../src/sim/day.js';

/*
 * The invariants every ordinary event meets (tests/events.test.js), ported
 * to the championship's own library, plus the ones its new effects need.
 * Copied rather than imported: that file exports no helpers, and the
 * checks are short.
 */

const RUN_UP = CHAMPIONSHIP_EVENTS.filter((e) => e.phase === 'runUp');

/** Every choice of every event as a card at `rung` would show it. */
function resolvedAt(rung) {
  return CHAMPIONSHIP_EVENTS.map((event) => ({
    ...event,
    choices: event.choices.map((c) => resolveChoice(c, rung)),
  }));
}
const WEEK = CHAMPIONSHIP_EVENTS.filter((e) => e.phase === 'week');

test('seven run-up events and nine for the week, and nothing else', () => {
  assert.equal(RUN_UP.length, 7);
  assert.equal(WEEK.length, 9);
  assert.equal(CHAMPIONSHIP_EVENTS.length, 16);
});

test('championship event ids are unique and never collide with an ordinary event', () => {
  // applyEventChoice looks an id up in EVENTS first; a shared id would
  // apply the ordinary event's numbers to a championship card.
  const ids = CHAMPIONSHIP_EVENTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const ordinary = new Set(EVENTS.map((e) => e.id));
  for (const id of ids) assert.ok(!ordinary.has(id), `${id} is also an ordinary event`);
});

test('every championship event has an id, a known speaker, a prompt, a condition and at least two choices', () => {
  for (const event of CHAMPIONSHIP_EVENTS) {
    assert.ok(event.id, 'missing id');
    assert.ok(SPEAKERS[event.speaker], `unknown speaker on ${event.id}: ${event.speaker}`);
    assert.ok(event.prompt && event.prompt.length > 10, `thin prompt on ${event.id}`);
    assert.equal(typeof event.when, 'function', `${event.id} has no condition`);
    assert.ok(Array.isArray(event.choices) && event.choices.length >= 2 && event.choices.length <= 3,
      `${event.id} needs two or three choices`);
  }
});

test('every choice has a label and an explicit, concrete cost', () => {
  // As the card shows it: "{money}" is a figure once it is filled in.
  for (const event of RUNG_IDS.flatMap(resolvedAt)) {
    for (const choice of event.choices) {
      assert.ok(choice.label && choice.label.length > 1, `${event.id}: choice missing a label`);
      assert.ok(choice.cost && choice.cost.length > 8,
        `${event.id}/${choice.label}: cost too thin to be a real decision`);
      assert.ok(/\d/.test(choice.cost) || /free/i.test(choice.cost),
        `${event.id}/${choice.label}: cost is not concrete — "${choice.cost}"`);
      assert.ok(choice.effects && typeof choice.effects === 'object',
        `${event.id}/${choice.label}: missing effects`);
    }
  }
});

test('every choice declares a known stance, and no event offers one twice', () => {
  for (const event of CHAMPIONSHIP_EVENTS) {
    for (const choice of event.choices) {
      assert.ok(STANCES[choice.stance], `${event.id}/${choice.label}: unknown stance "${choice.stance}"`);
    }
    const stances = event.choices.map((c) => c.stance);
    assert.equal(new Set(stances).size, stances.length,
      `${event.id} repeats a stance: ${stances.join(', ')}`);
  }
});

test('effects only use money, prestige, turf, goodwill, setup and nextRound', () => {
  // No `condition` and no `fallout`: a championship lasts three weeks, and
  // a reckoning or a month-long condition would outlive the thing it was
  // about. `nextRound` carries only `handicap` and `pace`.
  // Money is `moneyDays`, never a flat `money`: see the next test.
  const allowedTop = new Set(['moneyDays', 'prestige', 'turf', 'goodwill', 'setup', 'nextRound']);
  for (const event of CHAMPIONSHIP_EVENTS) {
    for (const choice of event.choices) {
      const where = `${event.id}/${choice.label}`;
      for (const key of Object.keys(choice.effects)) {
        assert.ok(allowedTop.has(key), `${where}: unexpected effect field "${key}"`);
      }
      for (const key of Object.keys(choice.effects.goodwill ?? {})) {
        assert.ok(SEGMENT_KEYS.includes(key), `${where}: goodwill for unknown segment "${key}"`);
      }
      for (const key of Object.keys(choice.effects.nextRound ?? {})) {
        assert.ok(['handicap', 'pace'].includes(key), `${where}: unexpected nextRound field "${key}"`);
      }
    }
  }
});

test('every sum on a card is priced in the booked rung\'s prep days', () => {
  // A flat $3,000 was real money at the County and nothing at the
  // National. So no cost line may carry a literal dollar figure: it says
  // {money} or {days:N}, and a choice says {money} exactly when it moves
  // money.
  for (const event of CHAMPIONSHIP_EVENTS) {
    for (const choice of event.choices) {
      const where = `${event.id}/${choice.label}`;
      assert.ok(!/\$\d/.test(choice.cost), `${where}: a flat dollar figure — "${choice.cost}"`);
      assert.equal(choice.cost.includes('{money}'), Boolean(choice.effects.moneyDays),
        `${where}: says {money} without moving money, or the reverse — "${choice.cost}"`);
    }
  }
  const choice = { cost: 'They pay {money}; turns down {days:2.5}.', effects: { moneyDays: 1.5, turf: 1 } };
  assert.deepEqual(resolveChoice(choice, 'regional').effects, { money: 4800, turf: 1 });
  assert.equal(resolveChoice(choice, 'national').cost, 'They pay $8,100; turns down $13,500.');
  assert.equal(resolveChoice(choice, 'countyOpen').cost, 'They pay $2,400; turns down $4,000.');
  const ordinary = EVENTS[0].choices[0];
  assert.deepEqual(resolveChoice(ordinary, 'national').effects, ordinary.effects,
    'an ordinary choice passes through unchanged');
  assert.equal(resolveChoice(ordinary, 'national').cost, ordinary.cost);
});

test('the figure on the card is the figure the bank moves by, at every rung', () => {
  // The card is built by pendingEventFor, the bank moved by
  // applyEventChoice. Both resolve through resolveChoice; this proves it
  // end to end, for every choice that moves money, at all three rungs.
  for (const rung of RUNG_IDS) {
    const state = newGame(9);
    state.money = 500000;
    state.tournament = newWeek(rung, state.day + 3);
    for (const event of CHAMPIONSHIP_EVENTS) {
      const card = pendingEventFor(event, state);
      event.choices.forEach((choice, index) => {
        if (!choice.effects.moneyDays) return;
        const moved = applyEventChoice(state, event.id, index).money - state.money;
        assert.equal(moved, choice.effects.moneyDays * RUNGS[rung].prepPerDay, `${rung} ${event.id}`);
        const sum = `$${Math.abs(moved).toLocaleString('en-US')}`;
        assert.ok(card.choices[index].cost.includes(sum),
          `${rung} ${event.id}/${choice.label}: moves ${moved}, card says "${card.choices[index].cost}"`);
      });
    }
  }
});

test('a choice that risks the pace bonus is a call, not a trap', () => {
  // The re-pitch of 2026-10-04 (PACE, MEASURED in championshipEvents.js):
  // a choice that costs more than 4% a hole pays at least a seventh of the
  // pace bonus it risks, at every rung it can be offered at.
  for (const event of WEEK) {
    for (const choice of event.choices) {
      const pace = choice.effects.nextRound?.pace ?? 1;
      if (pace <= 1.04) continue;
      for (const rung of RUNG_IDS) {
        const offered = event.when({ weather: 'rain', championship: { rung } })
          || event.when({ weather: 'clear', championship: { rung } });
        if (!offered) continue;
        const paid = resolveChoice(choice, rung).effects.money ?? 0;
        const bonus = contractFor(rung).bonuses.find((b) => b.id === 'pace').amount;
        assert.ok(paid >= bonus / 7,
          `${event.id}/${choice.label} at ${rung}: ${Math.round((pace - 1) * 100)}% a hole for $${paid} against a $${bonus} bonus`);
      }
    }
  }
});

test('nextRound effects belong to the week only', () => {
  // A run-up evening is days from a round; "the next round" would be a
  // promise about a day the player cannot see yet.
  for (const event of CHAMPIONSHIP_EVENTS) {
    assert.ok(['runUp', 'week'].includes(event.phase), `${event.id}: unknown phase "${event.phase}"`);
    if (event.phase === 'week') continue;
    for (const choice of event.choices) {
      assert.equal(choice.effects.nextRound, undefined,
        `${event.id}/${choice.label}: a run-up event cannot touch the next round`);
    }
  }
  assert.ok(WEEK.some((e) => e.choices.some((c) => c.effects.nextRound?.handicap)),
    'some week event must move the next round\'s scoring');
  assert.ok(WEEK.some((e) => e.choices.some((c) => c.effects.nextRound?.pace)),
    'and some its pace');
});

test('a week event never moves the setup', () => {
  // The week holds the course at its target: the next morning's `nextSetup`
  // eases an overshoot back (+4 to about +0.5) and climbs a shortfall back
  // in a day, so a setup figure on a week card is a promise that evaporates
  // before the round it was about. A week event that wants the next round
  // harder or easier says so with `nextRound.handicap`, which is applied.
  for (const event of CHAMPIONSHIP_EVENTS.filter((e) => e.phase === 'week')) {
    for (const choice of event.choices) {
      assert.equal(choice.effects.setup, undefined,
        `${event.id}/${choice.label}: a week choice cannot carry a setup effect`);
      assert.ok(!/setup [+-]\d/i.test(choice.cost),
        `${event.id}/${choice.label}: the cost promises a setup figure — "${choice.cost}"`);
    }
  }
});

test('magnitudes stay on the scale of the levers they sit beside', () => {
  // Handicap within a point either way (the four pins span 2.25), pace
  // within 0.9-1.15 (heavy rain is 1.16), setup within 8 (about a day and
  // a half of a six-keeper crew's climb), money within five days of the
  // booked rung's prep bill.
  for (const event of CHAMPIONSHIP_EVENTS) {
    for (const choice of event.choices) {
      const e = choice.effects;
      const where = `${event.id}/${choice.label}`;
      if (e.nextRound?.handicap !== undefined) {
        assert.ok(Math.abs(e.nextRound.handicap) <= 1, `${where}: handicap ${e.nextRound.handicap}`);
      }
      if (e.nextRound?.pace !== undefined) {
        assert.ok(e.nextRound.pace >= 0.9 && e.nextRound.pace <= 1.15, `${where}: pace ${e.nextRound.pace}`);
      }
      if (e.setup !== undefined) assert.ok(Math.abs(e.setup) <= 8, `${where}: setup ${e.setup}`);
      if (e.moneyDays !== undefined) assert.ok(Math.abs(e.moneyDays) <= 5, `${where}: ${e.moneyDays} prep days`);
    }
  }
});

test('no championship event has a choice that dominates every alternative', () => {
  // As for ordinary events, plus three axes. Setup is ordered (more is
  // better: the run-up is a climb, and a week's course is held at its
  // target), pace is ordered (slower is worse: officials judge it), and
  // the next round's handicap is NOT -- harder helps a week heading under
  // its target and hurts one heading over, so two choices that move it
  // differently are never comparable on it.
  const offenders = [];
  for (const event of RUNG_IDS.flatMap(resolvedAt)) {
    const vectors = event.choices.map((c) => championshipAxes(c.effects));
    vectors.forEach((a, i) => {
      const dominatesAll = vectors.every((b, j) => j === i || (
        ORDERED_AXES.every((axis) => a[axis] >= b[axis])
        && UNORDERED_AXES.every((axis) => a[axis] === b[axis])
      ));
      if (dominatesAll) offenders.push(`${event.id}: "${event.choices[i].label}" dominates`);
    });
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every number a choice moves is named in its cost, the right way round', () => {
  // The spec's "each card's cost text matches its numbers". Stricter than
  // the ordinary library, which was written before this test and phrases
  // its goodwill loosely: here every effect is printed as the player would
  // read it off the card.
  const signed = (n) => `${n > 0 ? '+' : '-'}${Math.abs(n)}`;
  for (const event of RUNG_IDS.flatMap(resolvedAt)) {
    for (const choice of event.choices) {
      const e = choice.effects;
      const cost = choice.cost.toLowerCase();
      const where = `${event.id}/${choice.label}`;
      if (e.money) {
        const sum = `$${Math.abs(e.money).toLocaleString('en-US')}`;
        assert.ok(cost.includes(sum), `${where}: money ${e.money} not named as ${sum} — "${choice.cost}"`);
      }
      for (const axis of ['setup', 'turf', 'prestige']) {
        if (!e[axis]) continue;
        assert.ok(cost.includes(`${axis} ${signed(e[axis])}`),
          `${where}: ${axis} ${e[axis]} not named as "${axis} ${signed(e[axis])}" — "${choice.cost}"`);
      }
      for (const [segment, n] of Object.entries(e.goodwill ?? {})) {
        assert.ok(cost.includes(`${segment} goodwill ${signed(n)}`),
          `${where}: ${segment} goodwill ${n} not named — "${choice.cost}"`);
      }
      if (e.nextRound?.handicap) {
        const phrase = pinSettingPhrase(e.nextRound.handicap);
        assert.ok(cost.includes(phrase), `${where}: handicap not named as "${phrase}" — "${choice.cost}"`);
      }
      if (e.nextRound?.pace && e.nextRound.pace !== 1) {
        const phrase = pacePhrase(e.nextRound.pace);
        assert.ok(cost.includes(phrase), `${where}: pace not named as "${phrase}" — "${choice.cost}"`);
      }
    }
  }
});

test('the next round\'s handicap is always a half or whole pin setting', () => {
  // So the card can say it in the unit the player already sets every
  // morning, exactly, instead of a stroke estimate that would be wrong on
  // half the seeds.
  for (const event of WEEK) {
    for (const choice of event.choices) {
      const h = choice.effects.nextRound?.handicap;
      if (h === undefined) continue;
      assert.ok([0.375, 0.75].includes(Math.abs(h)), `${event.id}/${choice.label}: handicap ${h}`);
    }
  }
  assert.equal(pinSettingPhrase(-0.375), 'half a pin setting easier');
  assert.equal(pinSettingPhrase(0.75), 'a whole pin setting harder');
  assert.equal(pacePhrase(1.08), 'every hole plays 8% slower');
  assert.equal(pacePhrase(0.95), 'every hole plays 5% quicker');
});

test('a choice that pays the player says so, and none pretends to charge for nothing', () => {
  const income = /pays? you|paid|you get|into the bank|they pay|nets?|revenue|brings? in/i;
  const outgoing = /(costs? (the|you)|you put in|you pay)[^.]*\$[\d,]+/i;
  for (const event of RUNG_IDS.flatMap(resolvedAt)) {
    for (const choice of event.choices) {
      const money = choice.effects.money ?? 0;
      const where = `${event.id}/${choice.label}`;
      if (money > 0) {
        assert.ok(income.test(choice.cost), `${where} pays $${money} and does not say so — "${choice.cost}"`);
        assert.ok(!outgoing.test(choice.cost), `${where} pays $${money} but reads like a charge`);
      }
      if (money === 0) {
        assert.ok(!outgoing.test(choice.cost), `${where} takes no money and reads like it does`);
      }
    }
  }
});

test('no championship event shows an unrendered escape sequence', () => {
  // And no template left unfilled: a card reading "They pay {money}" is
  // the same fault, one layer up.
  const badly = /\\u[0-9a-fA-F]{4}|\\n|\\t|[{}]/;
  for (const event of RUNG_IDS.flatMap(resolvedAt)) {
    const fields = [['prompt', event.prompt]];
    for (const choice of event.choices) {
      fields.push([`"${choice.label}" label`, choice.label], [`"${choice.label}" cost`, choice.cost]);
    }
    for (const [where, text] of fields) {
      assert.ok(typeof text === 'string' && text.length > 0, `${event.id}: ${where} is missing`);
      assert.ok(!badly.test(text), `${event.id}: ${where} shows an escape — "${text}"`);
    }
  }
});

test('no championship event names a golfer', () => {
  // The field is nameless (field.js); an event that named a player would
  // be the first person in it. Capitalised words in a prompt are either
  // the start of a sentence or a proper noun, and the only proper nouns
  // allowed are the resort's own.
  const allowed = new Set(['The', 'A', 'It', 'If', 'They', 'Tomorrow', 'Nine', 'Two', 'Rain', 'Nobody', 'Television', 'Today’s', 'Fairway', 'Monthly', 'I', 'Saturday']);
  for (const event of CHAMPIONSHIP_EVENTS) {
    const sentences = event.prompt.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).slice(1);
      for (const word of words) {
        const bare = word.replace(/[^A-Za-z’]/g, '');
        if (/^[A-Z]/.test(bare)) {
          assert.ok(allowed.has(bare), `${event.id}: "${bare}" reads like a name — "${event.prompt}"`);
        }
      }
    }
  }
});

test('every championship event can fire somewhere on the ladder', () => {
  // A `when` no context can satisfy is an event nobody will ever see.
  const contexts = [];
  for (const rung of ['countyOpen', 'regional', 'national']) {
    for (const weather of ['clear', 'fair', 'drizzle', 'rain', 'blowy']) {
      contexts.push({ weather, championship: { rung, phase: 'runUp', round: 1, rounds: 3, setup: 50 } });
      contexts.push({ weather, championship: { rung, phase: 'week', round: 2, rounds: 3, setup: 70 } });
    }
  }
  for (const event of CHAMPIONSHIP_EVENTS) {
    assert.ok(contexts.some((c) => event.when(c)), `${event.id} can never fire`);
  }
});

test('every rung has a week event that needs no particular weather', () => {
  // Task 5 always gives a week at least one event; it must always have one
  // to give.
  for (const rung of ['countyOpen', 'regional', 'national']) {
    for (const weather of ['clear', 'rain', 'blowy']) {
      const c = { weather, championship: { rung, phase: 'week', round: 1, rounds: 2, setup: 50 } };
      const eligible = WEEK.filter((e) => e.when(c));
      assert.ok(eligible.length >= 4, `${rung} in ${weather}: only ${eligible.length} week events`);
    }
  }
});

// --- What an event's `when` can see ----------------------------------------

function contextFor(state) {
  return eventContext({ report: { day: state.day, weather: { key: 'rain' } }, state });
}

test('the event context carries the championship, and nothing when none is booked', () => {
  const state = newGame(5);
  state.day = 40;
  assert.equal(contextFor(state).championship, null);
  assert.equal(contextFor(state).weather, 'rain');

  state.tournament = newWeek('regional', 52);
  state.resort.setup = 61.4;
  const runUp = contextFor(state).championship;
  assert.equal(runUp.rung, 'regional');
  assert.equal(runUp.phase, 'runUp');
  assert.equal(runUp.round, 1);
  assert.equal(runUp.rounds, 3);
  assert.equal(runUp.daysToRoundOne, 12);
  assert.equal(runUp.setup, 61.4);

  // The eve of round 1 is a week evening: its event is about tomorrow's round.
  state.day = 51;
  assert.equal(contextFor(state).championship.phase, 'week');
  state.day = 52;
  state.tournament = { ...state.tournament, roundsPlayed: 1 };
  assert.equal(contextFor(state).championship.round, 2);
  assert.equal(contextFor(state).championship.phase, 'week');

  state.tournament = { ...state.tournament, resolved: true };
  assert.equal(contextFor(state).championship, null);
});

test('the sheet\'s pending line says what the cards said', () => {
  assert.equal(pendingEffectNote({ eventHandicap: 0, eventPace: 1 }), null);
  assert.equal(pendingEffectNote({}), null);
  assert.equal(pendingEffectNote({ eventHandicap: -0.375, eventPace: 1.04 }),
    'Called for this round: it plays half a pin setting easier, and every hole plays 4% slower.');
  assert.equal(pendingEffectNote({ eventHandicap: 0.75, eventPace: 1 }),
    'Called for this round: it plays a whole pin setting harder.');
  assert.equal(pendingEffectNote({ eventHandicap: 0, eventPace: 1.02 }),
    'Called for this round: every hole plays 2% slower.');
  // Read the evening the card was answered as well as the next morning, so
  // it must not say when the call was made.
  for (const note of [pendingEffectNote({ eventHandicap: 0.375 }), pendingEffectNote({ eventPace: 1.03 })]) {
    assert.doesNotMatch(note, /night|tonight|yesterday|today/i, note);
  }
});

// --- The rhythm (run-up spec §4 "The rhythm") -------------------------------

/** The run-up evenings a plan may use, and the week's, for a booking. */
function eveningsFor({ bookedDay, firstRoundDay, rounds }) {
  const runUp = [];
  for (let d = bookedDay; d <= firstRoundDay - 2; d++) {
    if (d !== firstRoundDay - PRACTICE_DAYS_BEFORE) runUp.push(d);
  }
  const week = [];
  for (let d = Math.max(bookedDay, firstRoundDay - 1); d <= firstRoundDay + rounds - 2; d++) week.push(d);
  return { runUp, week };
}

test('a plan gives the run-up one or two evenings and every week at least one', () => {
  const runUpSizes = new Map();
  const weekSizes = new Map();
  const runUpDays = new Set();
  for (const rounds of [2, 3, 4]) {
    for (let seed = 1; seed <= 300; seed++) {
      const booking = { bookedDay: 100, firstRoundDay: 121, rounds };
      const plan = drawEventPlan(makeRng(seed), booking);
      const allowed = eveningsFor(booking);
      assert.ok(plan.runUp.length === 1 || plan.runUp.length === 2, `run-up ${plan.runUp}`);
      assert.equal(new Set(plan.runUp).size, plan.runUp.length, 'two different evenings');
      assert.ok(plan.week.length >= 1 && plan.week.length <= rounds, `week ${plan.week}`);
      assert.equal(new Set(plan.week).size, plan.week.length);
      for (const d of plan.runUp) assert.ok(allowed.runUp.includes(d), `run-up evening ${d}`);
      for (const d of plan.week) assert.ok(allowed.week.includes(d), `week evening ${d}`);
      // Never the practice evening; the eve of round 1 is the week's; and
      // never the last round's evening, which has no round after it.
      assert.ok(!plan.runUp.includes(121 - PRACTICE_DAYS_BEFORE));
      assert.ok(!plan.runUp.includes(120));
      assert.ok(!plan.week.includes(121 + rounds - 1));
      assert.deepEqual(plan.runUp, [...plan.runUp].sort((a, b) => a - b), 'in order');
      assert.deepEqual(plan.week, [...plan.week].sort((a, b) => a - b), 'in order');
      assert.deepEqual(drawEventPlan(makeRng(seed), booking), plan, 'deterministic');
      runUpSizes.set(plan.runUp.length, (runUpSizes.get(plan.runUp.length) ?? 0) + 1);
      const key = `${rounds}:${plan.week.length}`;
      weekSizes.set(key, (weekSizes.get(key) ?? 0) + 1);
      for (const d of plan.runUp) runUpDays.add(d);
    }
  }
  // Half the run-ups get a second event, near enough.
  const twos = runUpSizes.get(2) / 900;
  assert.ok(twos > 0.42 && twos < 0.58, `second run-up event in ${(twos * 100).toFixed(0)}%`);
  // Every evening the run-up offers is drawn some of the time.
  assert.equal(runUpDays.size, eveningsFor({ bookedDay: 100, firstRoundDay: 121, rounds: 2 }).runUp.length);
  // A four-round week can have every evening, or just one.
  assert.ok(weekSizes.get('4:4') > 0 && weekSizes.get('4:1') > 0);
});

test('a late booking draws only the evenings it still has', () => {
  for (let seed = 1; seed <= 50; seed++) {
    // Five days out: the run-up evenings left are d..d+3 (the practice
    // evening has already gone by).
    const late = drawEventPlan(makeRng(seed), { bookedDay: 116, firstRoundDay: 121, rounds: 3 });
    assert.ok(late.runUp.length >= 1);
    for (const d of late.runUp) assert.ok(d >= 116 && d <= 119, `${d}`);
    assert.ok(late.week.length >= 1);
    // Booked on the eve of round 1: no run-up left at all.
    const eve = drawEventPlan(makeRng(seed), { bookedDay: 120, firstRoundDay: 121, rounds: 3 });
    assert.deepEqual(eve.runUp, []);
    assert.ok(eve.week.length >= 1 && eve.week.every((d) => d >= 120 && d <= 122));
    // A week already under way (a save from before plans existed) gets
    // only the round evenings it has left.
    const midWeek = drawEventPlan(makeRng(seed), { bookedDay: 122, firstRoundDay: 121, rounds: 4 });
    assert.deepEqual(midWeek.runUp, []);
    assert.ok(midWeek.week.length >= 1 && midWeek.week.every((d) => d >= 122 && d <= 123));
    // And on its last round, nothing.
    assert.deepEqual(drawEventPlan(makeRng(seed), { bookedDay: 124, firstRoundDay: 121, rounds: 4 }),
      { runUp: [], week: [] });
  }
});

test('the plan has a seed of its own, apart from the practice round\'s', () => {
  assert.equal(eventPlanSeed(7, 121), eventPlanSeed(7, 121));
  assert.notEqual(eventPlanSeed(7, 121), eventPlanSeed(8, 121), 'another save');
  assert.notEqual(eventPlanSeed(7, 121), eventPlanSeed(7, 150), 'another booking');
  for (let seed = 1; seed < 40; seed++) {
    for (let day = 20; day < 400; day += 7) {
      assert.notEqual(eventPlanSeed(seed, day), practiceSeed(seed, day - PRACTICE_DAYS_BEFORE));
    }
  }
});

function champContext(phase, rung = 'regional', weather = 'fair') {
  return { weather, championship: { rung, phase, round: 1, rounds: 3, daysToRoundOne: 5, setup: 50 } };
}

test('a run-up evening draws a run-up event and a week evening a week event', () => {
  // So a `nextRound` effect can never be offered in the run-up, where it
  // would sit on the week until round 1.
  for (const rung of ['countyOpen', 'regional', 'national']) {
    for (const weather of ['clear', 'fair', 'drizzle', 'rain', 'storm', 'blowy']) {
      for (let seed = 1; seed <= 40; seed++) {
        const runUp = pickChampionshipEvent(champContext('runUp', rung, weather), makeRng(seed));
        assert.equal(runUp.phase, 'runUp', runUp.id);
        assert.ok(runUp.when(champContext('runUp', rung, weather)), `${runUp.id} eligible`);
        const week = pickChampionshipEvent(champContext('week', rung, weather), makeRng(seed));
        assert.equal(week.phase, 'week', week.id);
        assert.ok(week.when(champContext('week', rung, weather)), `${week.id} eligible`);
      }
    }
  }
  assert.equal(pickChampionshipEvent({ weather: 'fair', championship: null }, makeRng(1)), null,
    'nothing booked, nothing drawn');
});

test('a championship event is not repeated until its phase\'s pool is used up', () => {
  for (const phase of ['runUp', 'week']) {
    const pool = CHAMPIONSHIP_EVENTS.filter((e) => e.phase === phase);
    for (const weather of ['clear', 'rain']) {
      const context = champContext(phase, 'regional', weather);
      const eligible = pool.filter((e) => e.when(context));
      for (let seed = 1; seed <= 20; seed++) {
        const rng = makeRng(seed);
        let seen = [];
        const shown = [];
        for (let i = 0; i < eligible.length; i++) {
          const picked = pickChampionshipEvent(context, rng, seen);
          shown.push(picked.id);
          seen = rememberChampionshipEvent(seen, picked.id);
        }
        assert.equal(new Set(shown).size, eligible.length, `${phase} in ${weather}: ${shown}`);
        // And then they come round again.
        const again = pickChampionshipEvent(context, rng, seen);
        assert.ok(eligible.some((e) => e.id === again.id));
      }
    }
  }
});

test('the memory starts a phase over once all of it has been seen, and keeps the other phase', () => {
  const runUp = CHAMPIONSHIP_EVENTS.filter((e) => e.phase === 'runUp').map((e) => e.id);
  const week = CHAMPIONSHIP_EVENTS.filter((e) => e.phase === 'week').map((e) => e.id);
  let seen = rememberChampionshipEvent([], week[0]);
  for (const id of runUp) seen = rememberChampionshipEvent(seen, id);
  // The last of the run-up pool begins a new round of it, so it is not
  // shown again first; the week's memory is untouched.
  assert.deepEqual(seen, [week[0], runUp.at(-1)]);
  assert.deepEqual(rememberChampionshipEvent(seen, null), seen);
  assert.deepEqual(rememberChampionshipEvent(seen, 'not-an-event'), seen);
  assert.deepEqual(rememberChampionshipEvent(seen, week[0]), seen, 'seen once is seen');
});

test('the championship memory starts empty and survives a save, old or new', () => {
  const state = newGame(4);
  assert.deepEqual(state.championshipEventsSeen, []);
  state.championshipEventsSeen = ['champ-greens-mower'];
  assert.deepEqual(deserialize(serialize(state)).championshipEventsSeen, ['champ-greens-mower']);
  const old = JSON.parse(serialize(newGame(4)));
  delete old.championshipEventsSeen;
  assert.deepEqual(deserialize(JSON.stringify(old)).championshipEventsSeen, []);
});

test('a booking starts with no plan', () => {
  assert.equal(newWeek('regional', 50).eventPlan, null);
});
