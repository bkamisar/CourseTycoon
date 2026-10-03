import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole, courseDifficultyOf } from '../src/sim/hole.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { newWeek, recordRound } from '../src/sim/championshipWeek.js';
import { narrowToDifficulty, reactivePins, NARROWEST } from '../tools/championshipPolicy.js';

const TEMPLATES = [
  'shortPar3', 'waterPar3', 'straightPar4', 'doglegPar4', 'longPar5', 'reachablePar5',
];

/** The eighteen-hole template rotation an untouched resort is built from. */
function templateCourse() {
  return Array.from({ length: 18 }, (_, i) => ({
    ...makeHole(TEMPLATES[i % TEMPLATES.length], i + 1),
    open: true,
  }));
}

// --- narrowToDifficulty -------------------------------------------------

test('narrowing reaches a minimum the editor can reach', () => {
  const holes = templateCourse();
  assert.ok(courseDifficultyOf(holes) < RUNGS.regional.minDifficulty, 'sanity: starts under it');
  const reached = narrowToDifficulty(holes, RUNGS.regional.minDifficulty);
  assert.ok(reached >= RUNGS.regional.minDifficulty, `reached ${reached.toFixed(1)}`);
  assert.equal(reached, courseDifficultyOf(holes), 'and what it returns is the course as left');
});

test('a course already at the minimum is left alone', () => {
  const holes = templateCourse();
  const before = holes.map((h) => h.corridorWidth);
  narrowToDifficulty(holes, courseDifficultyOf(holes) - 1);
  assert.deepEqual(holes.map((h) => h.corridorWidth), before);
});

test('an unreachable minimum stops at the narrowest fairway instead of looping', () => {
  const holes = templateCourse();
  const reached = narrowToDifficulty(holes, 100);
  assert.ok(reached < 100, 'it falls short');
  assert.equal(reached, courseDifficultyOf(holes), 'and says how far it got');
  for (const h of holes) {
    assert.ok(h.corridorWidth >= NARROWEST, `hole ${h.id} narrowed past the editor's limit`);
    assert.ok(h.corridorWidth - 2 < NARROWEST, `hole ${h.id} was left at ${h.corridorWidth} with room to go`);
  }
});

// --- reactivePins -------------------------------------------------------

/*
 * A national after one round of four. The target's centre is 17, so the
 * leader is "due" 17 / 4 = 4.25 after round 1; the pins read how far the
 * leader is from that.
 */
function nationalAfterOne(leader) {
  return recordRound(newWeek('national', 10), {
    handicaps: [0, 0, 0],
    playerToPar: [leader, leader + 3, leader + 6],
  });
}
const CALM = 1;
const ROUGH = 1.28;

test('the first morning is fair in calm weather and easy in rough', () => {
  const week = newWeek('national', 10);
  assert.equal(reactivePins({ week, spread: CALM }), 'fair');
  assert.equal(reactivePins({ week, spread: ROUGH }), 'easy');
});

test('a field taking the course apart gets tougher pins', () => {
  // 0 is 4.25 under where the leader should be; 2 is 2.25 under.
  assert.equal(reactivePins({ week: nationalAfterOne(0), spread: CALM }), 'brutal');
  assert.equal(reactivePins({ week: nationalAfterOne(2), spread: CALM }), 'tough');
});

test('a leader on schedule gets fair pins, and one running high gets easy ones', () => {
  // 4 is 0.25 under and 5 is 0.75 over: on schedule, either way.
  assert.equal(reactivePins({ week: nationalAfterOne(4), spread: CALM }), 'fair');
  assert.equal(reactivePins({ week: nationalAfterOne(5), spread: CALM }), 'fair');
  // 6 is 1.75 over. Easing starts a stroke over schedule, not two:
  // measured, it lifted the Regional's reacting rate from 80% to 83% on
  // 120 seeds.
  assert.equal(reactivePins({ week: nationalAfterOne(6), spread: CALM }), 'easy');
});

test('rough weather eases the call one step when the field is ahead of the course', () => {
  // Wind does the pins' job, and brutal pins in a gale wreck the pace.
  assert.equal(reactivePins({ week: nationalAfterOne(0), spread: ROUGH }), 'tough');
  assert.equal(reactivePins({ week: nationalAfterOne(2), spread: ROUGH }), 'fair');
  assert.equal(reactivePins({ week: nationalAfterOne(4), spread: ROUGH }), 'easy');
});
