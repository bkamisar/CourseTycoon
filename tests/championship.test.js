import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { newWeek, recordRound, PIN_IDS } from '../src/sim/championshipWeek.js';
import { runDay } from '../src/sim/day.js';
import { effectsOf } from '../src/sim/weather.js';
import { computeChampionshipData, dialNote, practiceNote } from '../src/ui/championship.js';

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

test('the fixture really has eighteen open holes', () => {
  // The trap that has cost this project two measurements: holes live at
  // resort.courses[0].holes, and assigning to resort.holes is silently
  // ignored. A sheet test that quietly ran on three holes would report
  // every rung ineligible and look like a bug in the sheet.
  const state = championshipResort(1);
  assert.equal(state.resort.courses[0].holes.filter((h) => h.open).length, 18);
});

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
  // A button disabled for reasons the player cannot see is the same bug as
  // a cost line that does not say what it buys.
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

test('a missed rung is offered again, but not until its bar lifts', () => {
  // A miss is not hosted (day.js), so the missed rung is still the next
  // one. While it is barred the sheet must say so rather than offer an
  // Apply button that `bidFor` will refuse.
  const state = championshipResort(9);
  state.tournamentsHosted = ['countyOpen'];
  state.resort.amenities.push(
    { id: 'g', type: 'grandstands', menu: [] }, { id: 'o', type: 'overflowParking', menu: [] },
  );
  state.tournamentBars = { regional: state.day + 30 };
  const during = computeChampionshipData(state);
  assert.equal(during.next.id, 'regional', 'the missed rung is still the next one');
  assert.equal(during.next.eligible, false);
  assert.equal(during.next.barredUntil, state.day + 30);

  state.day += 31;
  const after = computeChampionshipData(state);
  assert.equal(after.next.eligible, true, 'and once the bar lifts it can be bid for');
  assert.equal(after.next.barredUntil, null);
  assert.equal(after.ladder.find((r) => r.id === 'regional').hosted, false, 'with no tick beside it');
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

test('the note under the dial treats the band as advice, not the judge', () => {
  // It used to say asking outside the band "will not score" and that the
  // rung "is judged between" its ends. The week is judged on the winning
  // score; the band is the suggestion for a course at the minimum.
  const band = RUNGS.countyOpen.band;
  for (const target of [20, 52, 90]) {
    const note = dialNote({ target }, band);
    assert.ok(!/will not score|judged between|as bad as/i.test(note),
      `target ${target}: the note still calls the band the judge: "${note}"`);
  }
  assert.match(dialNote({ target: 20 }, band), /under their 45–60/);
  assert.match(dialNote({ target: 20 }, band), /past the minimum/,
    'a soft ask names the course it suits');
  assert.match(dialNote({ target: 90 }, band), /over their 45–60/);
  assert.match(dialNote({ target: 90 }, band), /winner over the target/,
    'and a firm one names the risk, in terms of what is judged');
});

test('the week carries the tee interval the field will tee off at', () => {
  // The resort's own interval paces the field, so the sheet says so.
  const state = championshipResort(10);
  state.resort.pricing.teeInterval = 18;
  state.tournament = newWeek('regional', state.day);
  assert.equal(computeChampionshipData(state).booked.teeInterval, 18);
});

test('the sheet says whether the crowd is covered, and by how much', () => {
  const state = championshipResort(4);
  state.tournament = { rung: 'countyOpen', day: state.day + 5, resolved: false };
  const data = computeChampionshipData(state);
  assert.ok(data.gallery.needed > 0);
  assert.ok(data.gallery.capacity > 0);
  assert.equal(data.gallery.handled, data.gallery.capacity >= data.gallery.needed);
});

test('the gallery readout follows the booked rung, not the next one', () => {
  // While a national is booked the sheet must be talking about the
  // national's gallery. Reading the NEXT rung instead would tell a player
  // mid-run-up that their crowd was covered when it is not -- the exact
  // class of bug this project keeps producing.
  const state = championshipResort(7);
  state.tournamentsHosted = ['countyOpen', 'regional'];
  state.tournament = { rung: 'national', day: state.day + 8, resolved: false };
  const data = computeChampionshipData(state);
  assert.ok(data.gallery.needed > 10000,
    `a national gallery should be the big one, got ${data.gallery.needed}`);
  assert.equal(data.gallery.handled, false, 'and a bare property cannot hold it');
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

test('the buildings say what they cost and whether they stand', () => {
  const state = championshipResort(8);
  state.resort.amenities.push({ id: 'grandstands-1', type: 'grandstands', menu: [] });
  const data = computeChampionshipData(state);
  assert.equal(data.buildings.length, 4);
  const stands = data.buildings.find((b) => b.id === 'grandstands');
  const media = data.buildings.find((b) => b.id === 'mediaCentre');
  assert.equal(stands.built, true);
  assert.equal(media.built, false);
  assert.ok(media.build > 0 && media.upkeep > 0);
  assert.ok(media.forRung.length > 0, 'a building must say which rung wants it');

  // Affordability is reported, because a build button that is simply
  // disabled is a question the player cannot answer.
  state.money = 100;
  const broke = computeChampionshipData(state);
  assert.equal(broke.buildings.find((b) => b.id === 'mediaCentre').affordable, false);
});

test('the apply section quotes the week: rounds, target and difficulty floor', () => {
  const data = computeChampionshipData(championshipResort(1));
  assert.equal(data.next.rounds, RUNGS.countyOpen.rounds);
  assert.deepEqual(data.next.target, RUNGS.countyOpen.target);
  assert.equal(data.next.minDifficulty, RUNGS.countyOpen.minDifficulty);
  assert.ok(typeof data.difficulty === 'number');
});

test('a booked week shows the difficulty against the floor all through the run-up', () => {
  const state = championshipResort(2);
  state.tournament = newWeek('countyOpen', state.day + 10);
  const b = computeChampionshipData(state).booked;
  assert.equal(b.inWeek, false);
  assert.equal(b.minDifficulty, RUNGS.countyOpen.minDifficulty);
  // Both sides: a flag that is always true (or always false) passes a
  // typeof check. The template course measures 40.8 against the County's 45;
  // narrowing every corridor to 34 takes it to about 54.
  assert.equal(b.difficultyMet, false, 'the template course is under the County floor');

  const narrowed = championshipResort(2);
  for (const hole of narrowed.resort.courses[0].holes) hole.corridorWidth = 34;
  narrowed.tournament = newWeek('countyOpen', narrowed.day + 10);
  const harder = computeChampionshipData(narrowed).booked;
  assert.equal(harder.difficultyMet, true, 'a narrowed course clears the County floor');
});

test("during the week the sheet has the pins, the leader and today's weather", () => {
  const state = championshipResort(3);
  let week = newWeek('national', state.day);
  // A full field of sixty, because the same state is played below.
  const toPar = Array(60).fill(6);
  toPar[0] = 4;
  week = recordRound(week, { handicaps: Array(60).fill(0), playerToPar: toPar, entry: { pins: 'fair' } });
  state.tournament = week;
  const b = computeChampionshipData(state).booked;
  assert.equal(b.inWeek, true);
  assert.equal(b.roundsPlayed, 1);
  assert.equal(b.rounds, 4);
  assert.equal(b.leaderToPar, 4);
  assert.equal(b.pins, 'fair');
  assert.deepEqual(b.pinChoices.map((p) => p.id), [...PIN_IDS]);
  assert.ok(b.weather.label.length > 2, 'the pins are set against the day they will be played in');
  // Not just present: the very sky the round is then played in.
  assert.deepEqual(b.weather, effectsOf(runDay(state, 5).report.weather.key));
  assert.equal(b.projectedTotal, 16, 'one round of four in at +4 is on pace for +16');
});

// --- The practice round (run-up spec 2026-10-04 §2) -------------------

const PRACTICE = Object.freeze({
  day: 29, setupAtRoundOne: 85.6, difficulty: 66.2, median: 11, low: 8, high: 14, samples: 16,
});

test('the sheet carries the practice round for the rest of the run-up', () => {
  const state = championshipResort(4);
  state.tournament = { ...newWeek('national', state.day + 9), practice: { ...PRACTICE } };
  const b = computeChampionshipData(state).booked;
  assert.deepEqual(b.practice, PRACTICE, 'the stored forecast, not a recomputation');
  assert.equal(b.inWeek, false);
  const note = practiceNote(b);
  assert.equal(note, 'Practice round (day 29): on pace for about +11 (+8 to +14) at setup 86.');
});

test('no practice line before the practice round, or once the week is under way', () => {
  const before = championshipResort(5);
  before.tournament = newWeek('national', before.day + 15);
  const b = computeChampionshipData(before).booked;
  assert.equal(b.practice, null);
  assert.equal(practiceNote(b), null);

  // The week has its own numbers by then: the leader and the pace.
  const during = championshipResort(5);
  during.tournament = { ...newWeek('national', during.day), practice: { ...PRACTICE } };
  const w = computeChampionshipData(during).booked;
  assert.equal(w.inWeek, true);
  assert.equal(practiceNote(w), null);
});
