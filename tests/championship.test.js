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
