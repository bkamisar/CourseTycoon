import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import { MAX_DURATION } from '../src/sim/conditions.js';
import {
  EVENTS,
  SPEAKERS,
  effectAxes,
  STANCES,
  pickEvent,
  rememberEvent,
  EVENT_MEMORY,
} from '../src/sim/events.js';

// `disruption` folds in the two kinds of damage that have no axis of
// their own -- lost turnout and shut holes -- so a choice cannot hide a
// fortnight of closure behind a small cash saving. Without it here,
// eleven events read as having a dominant choice and none of them did:
// the check was comparing one-off numbers while the real cost of "do
// nothing today" ran for a month where it could not see it.
const AXIS_NAMES = ['money', 'prestige', 'turf', 'disruption', 'goodwill.locals', 'goodwill.serious', 'goodwill.destination'];

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

test('effects only use money, prestige, turf, goodwill and a condition', () => {
  // `condition` is the fifth axis, added when events gained the ability
  // to leave something still wrong next week rather than only subtracting
  // a number once. See src/sim/conditions.js.
  // `fallout` is the chance the choice comes back to bite, rolled once at
  // the moment it is made. It is not a number the day applies, so it does
  // not belong on an axis -- but it does have to be allowed here.
  const allowedTop = new Set(['money', 'prestige', 'turf', 'goodwill', 'condition', 'fallout']);
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


test('every condition an event imposes is one the simulation can apply', () => {
  // A condition with a misspelt field is a consequence that silently does
  // nothing, which is the worst kind: the cost line promises a month of
  // trouble and the player gets a quiet week.
  const allowed = new Set([
    'id', 'label', 'note', 'days',
    'dailyMoney', 'turfPerDay', 'demandFactor', 'holesClosed',
  ]);
  const doesSomething = ['dailyMoney', 'turfPerDay', 'demandFactor', 'holesClosed'];

  for (const event of EVENTS) {
    for (const choice of event.choices) {
      const condition = choice.effects?.condition;
      if (!condition) continue;
      const where = `${event.id}/${choice.label}`;

      for (const key of Object.keys(condition)) {
        assert.ok(allowed.has(key), `${where}: unknown condition field "${key}"`);
      }
      assert.ok(condition.id, `${where}: condition has no id`);
      assert.ok(condition.label, `${where}: condition has no label to show`);
      assert.ok(condition.note && condition.note.length > 10,
        `${where}: condition has no note explaining what is wrong`);
      assert.ok(condition.days >= 1 && condition.days <= MAX_DURATION,
        `${where}: ${condition.days} days is outside 1..${MAX_DURATION}`);
      assert.ok(doesSomething.some((k) => condition[k] !== undefined),
        `${where}: condition lasts ${condition.days} days and does nothing`);
      if (condition.demandFactor !== undefined) {
        assert.ok(condition.demandFactor > 0 && condition.demandFactor <= 1,
          `${where}: demandFactor ${condition.demandFactor} is not a suppression`);
      }
    }
  }
});

// --- Events that follow from earlier events ----------------------------

/** A stand-in for the real event context's memory of past decisions. */
function madeContext(made, day = 40) {
  const look = (id, index, afterDays, needHaunted) => {
    const r = made[id];
    if (!r) return false;
    if (needHaunted && !r.haunted) return false;
    if (index !== undefined && r.index !== index) return false;
    return day - r.day >= (afterDays ?? 0);
  };
  return {
    day, act: 2, prestige: 60, holesOpen: 9, groups: 15, turf: 80,
    satisfaction: 60, rating: 70, slow: false, hasCart: true, money: 100000,
    chose: (id, i, after) => look(id, i, after, false),
    haunted: (id, i, after) => look(id, i, after, true),
    answered: (id) => Boolean(made[id]),
  };
}

/** Every event that exists because of an earlier one. */
const FOLLOW_UPS = EVENTS.filter((e) => /-fallout$|-returns$|-after$/.test(e.id));

test('a follow-up only reaches the resort that earned it', () => {
  // Four ways this mechanic can go wrong and all four are silent: it
  // never fires, it fires for everybody, it fires over and over, or it
  // fires for a player whose roll went their way. None of them would fail
  // any other test in this file.
  assert.ok(FOLLOW_UPS.length >= 5, `only ${FOLLOW_UPS.length} follow-ups found`);

  for (const event of FOLLOW_UPS) {
    assert.equal(event.when(madeContext({})), false,
      `${event.id} fires for a resort that never made the choice`);
    assert.equal(
      event.when(madeContext({ [event.id]: { index: 0, day: 20, haunted: true } })),
      false,
      `${event.id} fires again after it has already been answered`,
    );
  }
});

test('a follow-up needs the roll to have gone against the player', () => {
  // The whole point of the probability. A cheap fix that always comes
  // back is not a gamble, it is a wrong answer with a longer
  // explanation -- so every one of these must be reachable ONLY through
  // `haunted`, never through `chose` alone.
  for (const event of FOLLOW_UPS) {
    const lucky = {};
    for (let index = 0; index < 3; index++) {
      for (const parent of EVENTS) {
        lucky[parent.id] = { index, day: 1, haunted: false };
      }
      delete lucky[event.id];
      assert.equal(event.when(madeContext(lucky)), false,
        `${event.id} fires even though the roll went the player's way`);
    }
  }
});

test('the snorkelling programme comes back only for the resort that said yes', () => {
  const event = EVENTS.find((e) => e.id === 'snorkel-fallout');
  assert.ok(event, 'the fallout event should exist');

  const accepted = { 'snorkel-programme': { index: 0, day: 10, haunted: true } };
  const declined = { 'snorkel-programme': { index: 2, day: 10, haunted: true } };
  const gotAway = { 'snorkel-programme': { index: 0, day: 10, haunted: false } };

  assert.equal(event.when(madeContext(accepted, 12)), false, 'it must not land the same week');
  assert.equal(event.when(madeContext(accepted, 30)), true, 'it must land once enough time has passed');
  assert.equal(event.when(madeContext(declined, 30)), false,
    'a resort that turned him down must never see the reckoning');
  assert.equal(event.when(madeContext(gotAway, 30)), false,
    'and some who said yes get away with it');
});

test('every risky choice can actually be haunted, and every follow-up has a parent', () => {
  // Two halves of the same wiring, and both fail silently. A `fallout` on
  // a choice no follow-up watches for is a die rolled for nothing; a
  // follow-up watching a choice that carries no `fallout` can never fire
  // at all.
  const risky = new Set();
  for (const event of EVENTS) {
    for (const choice of event.choices) {
      if ((choice.effects?.fallout ?? 0) > 0) risky.add(event.id);
    }
  }
  assert.ok(risky.size >= 5, `only ${risky.size} events carry any risk`);

  for (const event of FOLLOW_UPS) {
    const watched = [...risky].filter((parentId) => {
      const made = { [parentId]: { index: 0, day: 1, haunted: true } };
      for (let i = 0; i < 3; i++) {
        made[parentId] = { index: i, day: 1, haunted: true };
        if (event.when(madeContext(made))) return true;
      }
      return false;
    });
    assert.ok(watched.length > 0,
      `${event.id} watches no choice that carries a fallout chance, so it can never fire`);
  }
});

test('a follow-up only talks about things its own storyline established', () => {
  // A player hit the vandalism reckoning — Gus confronted four of them and
  // will not patrol again — and was offered "Leave the gate open and
  // hope". This storyline runs lighting, Gus on overtime, or nothing;
  // there is no gate in it. The gate belongs to the security guard's
  // chain, and had been copied across.
  //
  // A choice that refers to something the player was never told about
  // reads as broken however sensible its numbers are, and no test about
  // effects, costs or dominance can see it. This is a crude guard for one
  // specific class of that: a follow-up naming a prop that appears
  // nowhere in the events it follows from.
  // Words for physical things a choice can act on. Deliberately a short
  // list of concrete nouns: the first draft of this test flagged "a tenth
  // off the gate" in Jay's reckoning, which is gate RECEIPTS and perfectly
  // correct golf usage. That line now says "takings", because a word with
  // two senses is worth avoiding in front of a player as well as in front
  // of a test, but the lesson stands -- keep this list to things that can
  // only be one thing.
  const props = ['gate', 'netting', 'shuttle', 'pond', 'bunker', 'mower'];

  for (const event of FOLLOW_UPS) {
    // Which parents can reach this follow-up at all.
    const parents = EVENTS.filter((candidate) => {
      if (candidate.followUp) return false;
      for (let i = 0; i < candidate.choices.length; i++) {
        const made = { [candidate.id]: { index: i, day: 1, haunted: true } };
        if (event.when(madeContext(made))) return true;
      }
      return false;
    });
    if (parents.length === 0) continue;

    const established = [
      event.prompt,
      ...parents.map((p) => `${p.prompt} ${p.choices.map((c) => `${c.label} ${c.cost}`).join(' ')}`),
    ].join(' ').toLowerCase();
    const offered = event.choices.map((c) => `${c.label} ${c.cost}`).join(' ').toLowerCase();

    for (const prop of props) {
      if (!offered.includes(prop)) continue;
      assert.ok(established.includes(prop),
        `${event.id} offers a choice about a "${prop}" that neither it nor `
        + `${parents.map((p) => p.id).join('/')} ever mentions`);
    }
  }
});

test('no event shows the player an unrendered escape sequence', () => {
  // Three event lines carried a literal backslash-u escape into the game:
  // "residents\u2019 association" and "$23,000 \u2014 more than". They were
  // written through a script that escaped the backslash one time too many,
  // so what reached the player was the escape itself rather than the
  // apostrophe or the dash it stood for.
  //
  // Nothing else could catch this. The strings were valid, the costs were
  // concrete, the effects were fine — it only looks wrong when a human
  // reads it on a screen, which is how it was found.
  const badly = /\u[0-9a-fA-F]{4}|\n|\t/;
  for (const event of EVENTS) {
    const fields = [['prompt', event.prompt]];
    for (const choice of event.choices) {
      fields.push([`choice "${choice.label}" label`, choice.label]);
      fields.push([`choice "${choice.label}" cost`, choice.cost]);
      const c = choice.effects?.condition;
      if (c) {
        fields.push([`condition ${c.id} label`, c.label]);
        fields.push([`condition ${c.id} note`, c.note]);
      }
    }
    for (const [where, text] of fields) {
      assert.ok(typeof text === 'string' && text.length > 0,
        `${event.id}: ${where} is missing`);
      assert.ok(!badly.test(text),
        `${event.id}: ${where} shows an unrendered escape — "${text}"`);
    }
  }
});

test('a choice that pays the player says so, and none pretends to charge for nothing', () => {
  // Reported from play: "why do you need to PAY the 48k if you take the
  // principled route?" The line read "Costs the $48,000 and buys a course
  // that still looks like one" while the money effect was zero — turning
  // an offer down, not paying for the privilege. And the choice that
  // genuinely paid $48,000 INTO the bank said only "$48,000 now", which
  // reads like a charge.
  //
  // Direction of money is the one thing a cost line must never get wrong,
  // because the player cannot check it against anything until after they
  // have chosen.
  // Broadened once already: "nets about $1,200 in guaranteed revenue" is
  // a perfectly clear way to say a choice pays, and the first draft of
  // this list did not know it. The test is about direction being legible,
  // not about a house phrasing.
  const income = /pays? you|paid|you get|into the bank|they pay|nets?|revenue|brings? in/i;
  // Has to name an actual sum. "Saves the wage and costs the knowledge"
  // is a choice that takes no money and says so; only a payment phrase
  // followed by a figure is a claim about the bank.
  const outgoing = /(costs? (the|you)|you put in|you pay)[^.]*\$[\d,]+/i;

  for (const event of EVENTS) {
    for (const choice of event.choices) {
      const money = choice.effects?.money ?? 0;
      const where = `${event.id}/${choice.label}`;

      if (money > 0) {
        assert.ok(income.test(choice.cost),
          `${where} pays the player $${money} and the line does not say so — "${choice.cost}"`);
        assert.ok(!outgoing.test(choice.cost),
          `${where} pays the player $${money} but reads like a charge — "${choice.cost}"`);
      }
      if (money === 0) {
        assert.ok(!outgoing.test(choice.cost),
          `${where} takes no money and reads like it does — "${choice.cost}"`);
      }
    }
  }
});
