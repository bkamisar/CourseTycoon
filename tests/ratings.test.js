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
    // Read from the constant, not a literal: this said 7 and broke the
    // moment satisfactionDays moved to 10, reporting a gate failure that
    // was really a stale fixture.
    satisfactionHistory: new Array(GATE_THRESHOLDS.satisfactionDays).fill(GATE_THRESHOLDS.satisfaction),
  };
  assert.equal(actOneGate(met).passed, true);

  assert.equal(actOneGate({ ...met, holesOpen: 8 }).passed, false);
  assert.equal(actOneGate({ ...met, money: GATE_THRESHOLDS.money - 1 }).passed, false);
  assert.equal(actOneGate({ ...met, prestige: GATE_THRESHOLDS.prestige - 1 }).passed, false);
  assert.equal(
    actOneGate({ ...met, satisfactionHistory: new Array(GATE_THRESHOLDS.satisfactionDays).fill(GATE_THRESHOLDS.satisfaction - 5) }).passed,
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

test('a course is rated on whether it suits the people playing it', () => {
  // Fairness used to target a fixed difficulty of 48, which asserted that
  // golf courses have one correct difficulty - exactly what the segments
  // deny. Building what serious golfers want (72) therefore cost about
  // eleven points of rating for doing it deliberately.
  const brutal = ['waterPar3', 'doglegPar4', 'longPar5', 'waterPar3', 'doglegPar4',
    'longPar5', 'doglegPar4', 'waterPar3', 'longPar5']
    .map((t, i) => { const h = makeHole(t, i + 1); h.corridorWidth = 26; return h; });

  const localsCrowd = { locals: { count: 80 }, serious: { count: 10 }, destination: { count: 10 } };
  const seriousCrowd = { locals: { count: 10 }, serious: { count: 80 }, destination: { count: 10 } };

  const suited = courseRating(brutal, 80, seriousCrowd);
  const mismatched = courseRating(brutal, 80, localsCrowd);

  assert.ok(suited > mismatched + 8,
    `the same course should rate far better for the crowd it suits: ${suited} vs ${mismatched}`);
});

test('rating with no crowd falls back to the mean of what the segments want', () => {
  // Day one has no crowd, and the fallback must not be a magic number.
  const holes = [makeHole('straightPar4', 1), makeHole('shortPar3', 2)];
  const noCrowd = courseRating(holes, 80, null);
  const empty = courseRating(holes, 80, {
    locals: { count: 0 }, serious: { count: 0 }, destination: { count: 0 },
  });
  assert.equal(noCrowd, empty);
  assert.ok(noCrowd > 0 && noCrowd <= 100);
});
