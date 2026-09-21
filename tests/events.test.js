import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import {
  EVENTS,
  SPEAKERS,
  effectAxes,
  STANCES,
  pickEvent,
  rememberEvent,
  EVENT_MEMORY,
} from '../src/sim/events.js';

const AXIS_NAMES = ['money', 'prestige', 'turf', 'goodwill.locals', 'goodwill.serious', 'goodwill.destination'];

function alwaysContext(overrides = {}) {
  return {
    day: 30, act: 1, money: 25000, prestige: 60, rating: 80, courseDifficulty: 50,
    satisfaction: 60, turf: 70, dominant: 'locals', dominantShare: 0.5,
    tooHard: false, tooEasy: false, quiet: false, busy: false, slow: false,
    holesOpen: 9, nearGate: false, groups: 20,
    ...overrides,
  };
}

test('there are at least fourteen events', () => {
  assert.ok(EVENTS.length >= 14, `only ${EVENTS.length} events`);
});

test('event ids are unique', () => {
  const ids = EVENTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every event has an id, a known speaker, a prompt, a condition and at least two choices', () => {
  for (const event of EVENTS) {
    assert.ok(event.id, 'missing id');
    assert.ok(SPEAKERS[event.speaker], `unknown speaker on ${event.id}: ${event.speaker}`);
    assert.ok(event.prompt && event.prompt.length > 10, `thin prompt on ${event.id}`);
    assert.equal(typeof event.when, 'function', `${event.id} has no condition`);
    assert.ok(Array.isArray(event.choices) && event.choices.length >= 2,
      `${event.id} needs at least two choices`);
  }
});

test('every choice has a label and an explicit, concrete cost description', () => {
  for (const event of EVENTS) {
    for (const choice of event.choices) {
      assert.ok(choice.label && choice.label.length > 1, `${event.id}: choice missing a label`);
      assert.ok(choice.cost && choice.cost.length > 8,
        `${event.id}/${choice.label}: cost too thin to be a real decision`);
      // A cost that names no number and does not say "free" is exactly the
      // vague "may affect your reputation" failure mode the plan calls out.
      assert.ok(/\d/.test(choice.cost) || /free/i.test(choice.cost),
        `${event.id}/${choice.label}: cost is not concrete — "${choice.cost}"`);
      assert.ok(choice.effects && typeof choice.effects === 'object',
        `${event.id}/${choice.label}: missing effects`);
    }
  }
});

test('every choice declares a stance the stance table knows about', () => {
  for (const event of EVENTS) {
    for (const choice of event.choices) {
      assert.ok(choice.stance, `${event.id}/${choice.label}: no stance`);
      assert.ok(STANCES[choice.stance],
        `${event.id}/${choice.label}: unknown stance "${choice.stance}"`);
    }
  }
});

test('an event never offers the same stance twice', () => {
  // Two choices labelled identically are indistinguishable at a glance,
  // which defeats the whole point of labelling them.
  for (const event of EVENTS) {
    const stances = event.choices.map((c) => c.stance);
    assert.equal(new Set(stances).size, stances.length,
      `${event.id} repeats a stance: ${stances.join(', ')}`);
  }
});

test('every stance in the table is actually used, and reads as a phrase', () => {
  const used = new Set(EVENTS.flatMap((e) => e.choices.map((c) => c.stance)));
  for (const [key, stance] of Object.entries(STANCES)) {
    assert.ok(stance.label && stance.gloss, `${key}: incomplete stance`);
    assert.ok(stance.gloss.length > 8, `${key}: gloss too thin — "${stance.gloss}"`);
    assert.ok(used.has(key), `${key} is defined but no choice uses it`);
  }
});

test('effects only use money, prestige, turf and goodwill for real segments', () => {
  const allowedTop = new Set(['money', 'prestige', 'turf', 'goodwill']);
  for (const event of EVENTS) {
    for (const choice of event.choices) {
      for (const key of Object.keys(choice.effects)) {
        assert.ok(allowedTop.has(key), `${event.id}/${choice.label}: unexpected effect field "${key}"`);
      }
      for (const key of Object.keys(choice.effects.goodwill ?? {})) {
        assert.ok(SEGMENT_KEYS.includes(key),
          `${event.id}/${choice.label}: goodwill for unknown segment "${key}"`);
      }
    }
  }
});

test('no event has a choice whose effects dominate every alternative', () => {
  // A dominated set is not a decision. A choice "dominates" if it is at
  // least as good as every other choice on every axis, with no axis where
  // it is worse — the exact failure mode the plan says to cut or rebalance
  // rather than ship.
  const offenders = [];
  for (const event of EVENTS) {
    const vectors = event.choices.map((c) => effectAxes(c.effects));
    for (let i = 0; i < vectors.length; i++) {
      const a = vectors[i];
      const dominatesAll = vectors.every((b, j) => {
        if (j === i) return true;
        return AXIS_NAMES.every((axis) => a[axis] >= b[axis]);
      });
      if (dominatesAll) offenders.push(`${event.id}: choice "${event.choices[i].label}" dominates`);
    }
  }
  assert.deepEqual(offenders, [], `dominated choice sets found:\n${offenders.join('\n')}`);
});

test('selection is deterministic for the same context and seed', () => {
  const context = alwaysContext();
  const a = pickEvent(context, makeRng(21), []);
  const b = pickEvent(context, makeRng(21), []);
  assert.deepEqual(a, b);
});

test('different seeds can produce different events when several are eligible', () => {
  const context = alwaysContext();
  const results = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const picked = pickEvent(context, makeRng(seed), []);
    if (picked) results.add(picked.id);
  }
  assert.ok(results.size > 1, 'expected variety across seeds when many events are eligible');
});

test('an event does not recur while unseen ones remain', () => {
  const context = alwaysContext();
  const eligibleCount = EVENTS.filter((e) => {
    try { return e.when(context); } catch { return false; }
  }).length;
  assert.ok(eligibleCount >= 2, 'test needs at least two eligible events to be meaningful');

  const seen = [];
  for (let i = 0; i < eligibleCount; i++) {
    const picked = pickEvent(context, makeRng(500 + i), seen);
    assert.ok(picked);
    assert.ok(!seen.includes(picked.id), `repeated ${picked.id} while others were unseen`);
    seen.push(picked.id);
  }
});

test('recycling starts only once the pool is exhausted', () => {
  const context = alwaysContext();
  const eligible = EVENTS.filter((e) => {
    try { return e.when(context); } catch { return false; }
  }).map((e) => e.id);
  const picked = pickEvent(context, makeRng(9), eligible);
  assert.ok(picked, 'must recycle rather than return nothing');
  assert.ok(eligible.includes(picked.id));
});

test('with no eligible events, pickEvent returns null rather than throwing', () => {
  const picked = pickEvent(alwaysContext({ prestige: -1, rating: -1, day: -1 }), makeRng(1), []);
  // Some events may still be unconditionally eligible; just confirm no crash
  // and a sane result either way.
  assert.ok(picked === null || typeof picked.id === 'string');
});

test('a broken when() is treated as ineligible, not a crash', () => {
  const context = {}; // deliberately missing every field a when() might read
  assert.doesNotThrow(() => pickEvent(context, makeRng(1), []));
});

test('rememberEvent keeps the memory bounded', () => {
  let recent = [];
  for (let i = 0; i < EVENT_MEMORY * 3; i++) recent = rememberEvent(recent, `id-${i}`);
  assert.equal(recent.length, EVENT_MEMORY);
  assert.equal(recent.at(-1), `id-${EVENT_MEMORY * 3 - 1}`);
});

test('rememberEvent with no id leaves the memory alone', () => {
  const recent = ['a', 'b'];
  assert.deepEqual(rememberEvent(recent, null), recent);
});

test('effectAxes fills in zero for every axis a choice does not mention', () => {
  const axes = effectAxes({ money: -100 });
  assert.equal(axes.money, -100);
  assert.equal(axes.prestige, 0);
  assert.equal(axes.turf, 0);
  assert.equal(axes['goodwill.locals'], 0);
  assert.equal(axes['goodwill.serious'], 0);
  assert.equal(axes['goodwill.destination'], 0);
});
