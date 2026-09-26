import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import {
  LINES,
  SPEAKERS,
  narrationContext,
  pickNarration,
  rememberNarration,
  NARRATION_MEMORY,
} from '../src/sim/narration.js';

function contextFor(overrides = {}) {
  const state = newGame(1);
  const { report } = runDay(state, 7);
  return { ...narrationContext({ report, previousReport: undefined, state }), ...overrides };
}

test('every line has an id, a real speaker, and text', () => {
  for (const line of LINES) {
    assert.ok(line.id, 'missing id');
    assert.ok(SPEAKERS[line.speaker], `unknown speaker on ${line.id}: ${line.speaker}`);
    assert.ok(line.text && line.text.length > 4, `thin text on ${line.id}`);
    assert.equal(typeof line.when, 'function', `${line.id} has no condition`);
  }
});

test('line ids are unique', () => {
  const ids = LINES.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('there are enough lines that a long game does not loop', () => {
  // A sixty day Act I shows roughly fifty lines. Conditions narrow the pool
  // to a handful per situation, so the total has to be well above that.
  assert.ok(LINES.length >= 60, `only ${LINES.length} lines`);
});

test('a day is never silent', () => {
  // Silence is indistinguishable from the feature being broken, so some
  // line must fire for any state the game can reach.
  let state = newGame(3);
  for (let day = 0; day < 20; day++) {
    const { state: next, report } = runDay(state, 400 + day);
    const context = narrationContext({ report, previousReport: state.history.at(-1), state });
    const line = pickNarration(context, makeRng(day), []);
    assert.ok(line, `no line available on day ${day + 1}`);
    assert.ok(line.text, 'line had no text');
    state = next;
  }
});

test('an empty resort still says something', () => {
  const closed = newGame(4);
  for (const h of closed.resort.courses[0].holes) h.open = false;
  const { report } = runDay(closed, 1);
  const context = narrationContext({ report, previousReport: undefined, state: closed });
  assert.ok(pickNarration(context, makeRng(1), []));
});

test('a locals course draws locals lines, and a serious one does not', () => {
  const locals = contextFor({ dominant: 'locals', dominantShare: 0.7, total: 40 });
  const serious = contextFor({ dominant: 'serious', dominantShare: 0.7, total: 40 });

  const localsIds = LINES.filter((l) => l.when(locals)).map((l) => l.id);
  const seriousIds = LINES.filter((l) => l.when(serious)).map((l) => l.id);

  assert.ok(localsIds.some((id) => id.startsWith('loc-')), 'expected locals lines');
  assert.ok(!localsIds.some((id) => id.startsWith('ser-')), 'locals course should not get serious lines');
  assert.ok(seriousIds.some((id) => id.startsWith('ser-')), 'expected serious lines');
  assert.ok(!seriousIds.some((id) => id.startsWith('loc-')), 'serious course should not get locals lines');
});

test('a punishing course is remarked on, and so is a soft one', () => {
  const hard = contextFor({ tooHard: true, tooEasy: false });
  const easy = contextFor({ tooHard: false, tooEasy: true });
  assert.ok(LINES.filter((l) => l.when(hard)).some((l) => l.id.startsWith('hard-')));
  assert.ok(LINES.filter((l) => l.when(easy)).some((l) => l.id.startsWith('easy-')));
});

test('selection is deterministic for the same seed', () => {
  const context = contextFor();
  const a = pickNarration(context, makeRng(11), []);
  const b = pickNarration(context, makeRng(11), []);
  assert.deepEqual(a, b);
});

test('a line is not repeated while its pool has anything unseen left', () => {
  const context = contextFor({ dominant: 'locals', dominantShare: 0.8, total: 40 });
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const line = pickNarration(context, makeRng(500 + i), seen);
    assert.ok(line);
    assert.ok(!seen.includes(line.id), `repeated ${line.id} while others were unseen`);
    seen.push(line.id);
    if (seen.length >= LINES.filter((l) => l.when(context)).length) break;
  }
});

test('recycling starts only once the pool is exhausted', () => {
  const context = contextFor();
  const eligible = LINES.filter((l) => l.when(context)).map((l) => l.id);
  // Everything already seen: it must still produce a line rather than give up.
  const line = pickNarration(context, makeRng(9), eligible);
  assert.ok(line, 'must recycle rather than fall silent');
  assert.ok(eligible.includes(line.id));
});

test('the recent-line memory stays bounded', () => {
  let recent = [];
  for (let i = 0; i < NARRATION_MEMORY * 3; i++) recent = rememberNarration(recent, `id-${i}`);
  assert.equal(recent.length, NARRATION_MEMORY);
  assert.equal(recent.at(-1), `id-${NARRATION_MEMORY * 3 - 1}`);
});

test('remembering nothing leaves the memory alone', () => {
  const recent = ['a', 'b'];
  assert.deepEqual(rememberNarration(recent, null), recent);
});

test('the crowd shift is read from shares, not raw counts', () => {
  // A busier day must not read as a change in who is coming.
  const state = newGame(1);
  const report = {
    crowd: { locals: { count: 60 }, serious: { count: 20 }, destination: { count: 20 } },
    courseDifficulty: 40,
  };
  const previousReport = {
    crowd: { locals: { count: 30 }, serious: { count: 10 }, destination: { count: 10 } },
  };
  const context = narrationContext({ report, previousReport, state });
  assert.equal(context.rising, null, 'doubling everyone is not a shift');
  assert.equal(context.falling, null);
});

test('a real shift in composition is detected', () => {
  const state = newGame(1);
  const report = {
    crowd: { locals: { count: 20 }, serious: { count: 60 }, destination: { count: 20 } },
    courseDifficulty: 60,
  };
  const previousReport = {
    crowd: { locals: { count: 60 }, serious: { count: 20 }, destination: { count: 20 } },
  };
  const context = narrationContext({ report, previousReport, state });
  assert.equal(context.rising, 'serious');
  assert.equal(context.falling, 'locals');
});

test('Dee only speaks when the cart exists', () => {
  // A voice from an amenity the player has not built is the world telling
  // them about something that is not there.
  const withoutCart = contextFor({ hasCart: false });
  const deeLines = LINES.filter((l) => l.speaker === 'dee');
  assert.ok(deeLines.length >= 8, `only ${deeLines.length} lines for Dee — she will repeat`);
  for (const line of deeLines) {
    assert.equal(line.when(withoutCart), false, `${line.id} fired with no cart built`);
  }
  const withCart = contextFor({ hasCart: true });
  assert.ok(deeLines.some((l) => l.when(withCart)), 'Dee should have something to say once she exists');
});

test('the cart shows up in the narration context', () => {
  const state = newGame(2);
  const { report } = runDay(state, 5);
  const before = narrationContext({ report, previousReport: undefined, state });
  assert.equal(before.hasCart, false);

  const withCart = newGame(2);
  withCart.resort.amenities.push({ id: 'c1', type: 'beverageCart', menu: ['draught'] });
  const after = narrationContext({ report, previousReport: undefined, state: withCart });
  assert.equal(after.hasCart, true);
});

// --- Nobody describes something that is not there ---------------------

test('EVERY VOICE THAT NEEDS A BUILDING IS GATED ON HAVING ONE', () => {
  // Dee had this from the day she was written -- a voice from an amenity
  // the player has not built is the world telling them about something
  // that does not exist -- and she was the only one. The pro shop had ten
  // lines, including "Sold a coffee. That was the day.", and nothing
  // checked whether there was a pro shop.
  //
  // Asserted over the speakers rather than line by line, so a new shop
  // line added later cannot slip through ungated.
  const NEEDS = { dee: 'hasCart', shop: 'hasShop' };
  for (const line of LINES) {
    const gate = NEEDS[line.speaker];
    if (!gate) continue;
    assert.ok(String(line.when ?? '').includes(gate),
      `${line.id} is spoken by ${line.speaker} but does not check ${gate}`);
  }
});

test('Dee stops asking for food once there is food', () => {
  // Reported from play as not being able to work out what was being asked
  // for, which is the tell: nothing was. The line fired whenever a cart
  // existed, and a new cart carries a food item by default, so she was
  // asking the owner for something already in her own cooler.
  const line = LINES.find((l) => l.id === 'dee-5');
  assert.ok(line, 'dee-5 should still exist');
  assert.equal(line.when({ hasCart: true, sellsFood: true }), false,
    'she must not ask for food the resort already sells');
  assert.equal(line.when({ hasCart: true, sellsFood: false }), true,
    'and must still ask when there genuinely is none');
  assert.equal(line.when({ hasCart: false, sellsFood: false }), false,
    'and never when she is not out there at all');
});
