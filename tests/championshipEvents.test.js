import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import { EVENTS, SPEAKERS, STANCES, eventContext } from '../src/sim/events.js';
import {
  CHAMPIONSHIP_EVENTS, championshipAxes, ORDERED_AXES, UNORDERED_AXES,
  pinSettingPhrase, pacePhrase,
} from '../src/sim/championshipEvents.js';
import { newGame } from '../src/sim/state.js';
import { newWeek } from '../src/sim/championshipWeek.js';

/*
 * The invariants every ordinary event meets (tests/events.test.js), ported
 * to the championship's own library, plus the ones its new effects need.
 * Copied rather than imported: that file exports no helpers, and the
 * checks are short.
 */

const RUN_UP = CHAMPIONSHIP_EVENTS.filter((e) => e.phase === 'runUp');
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
  for (const event of CHAMPIONSHIP_EVENTS) {
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
  const allowedTop = new Set(['money', 'prestige', 'turf', 'goodwill', 'setup', 'nextRound']);
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

test('magnitudes stay on the scale of the levers they sit beside', () => {
  // Handicap within a point either way (the four pins span 2.25), pace
  // within 0.9-1.15 (heavy rain is 1.16), setup within 8 (about a day and
  // a half of a six-keeper crew's climb), money within a National's prep
  // bill for two days.
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
      if (e.money !== undefined) assert.ok(Math.abs(e.money) <= 10800, `${where}: money ${e.money}`);
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
  for (const event of CHAMPIONSHIP_EVENTS) {
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
  for (const event of CHAMPIONSHIP_EVENTS) {
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
  assert.equal(pacePhrase(1.08), '8% slower');
  assert.equal(pacePhrase(0.95), '5% quicker');
});

test('a choice that pays the player says so, and none pretends to charge for nothing', () => {
  const income = /pays? you|paid|you get|into the bank|they pay|nets?|revenue|brings? in/i;
  const outgoing = /(costs? (the|you)|you put in|you pay)[^.]*\$[\d,]+/i;
  for (const event of CHAMPIONSHIP_EVENTS) {
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
  const badly = /\\u[0-9a-fA-F]{4}|\\n|\\t/;
  for (const event of CHAMPIONSHIP_EVENTS) {
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
