import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNGS, RUNG_IDS, rungFor, eligibleFor, SETUP_DECAY_PER_DAY, setupClimb, nextSetup, setupDifficultyBonus, withinBand, RUN_UP_DAYS, bidFor, nextRungFor, scoreTournament, contractFor } from '../src/sim/tournaments.js';

test('there are three rungs, each fully specified', () => {
  assert.equal(RUNG_IDS.length, 3);
  for (const id of RUNG_IDS) {
    const rung = RUNGS[id];
    assert.equal(rung.id, id, `${id}: id does not match its key`);
    assert.ok(rung.label && rung.blurb && rung.blurb.length > 30, `${id}: thin copy`);
    assert.ok(rung.prestige > 0, `${id}: needs a prestige floor`);
    assert.ok(rung.band.low < rung.band.high, `${id}: band is inverted`);
    assert.ok(rung.band.low >= 0 && rung.band.high <= 100, `${id}: band outside 0-100`);
    assert.ok(rung.baseFee > 0 && rung.purseCeiling > rung.baseFee,
      `${id}: the ceiling must beat the base or the bonuses are decoration`);
    assert.ok(Array.isArray(rung.requires), `${id}: requires must be a list`);
  }
});

test('the rungs escalate', () => {
  const order = RUNG_IDS.map((id) => RUNGS[id]);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].prestige > order[i - 1].prestige, 'prestige floor must rise');
    assert.ok(order[i].baseFee > order[i - 1].baseFee, 'the money must rise');
    assert.ok(order[i].band.low > order[i - 1].band.low, 'the course must be asked for more');
  }
});

test('eligibility needs the prestige AND the buildings', () => {
  const resort = { amenities: [], rooms: {} };
  assert.equal(eligibleFor('countyOpen', { prestige: 40, resort, holesOpen: 18 }), false,
    'prestige 40 is below every floor');
  assert.equal(eligibleFor('countyOpen', { prestige: 60, resort, holesOpen: 9 }), false,
    'nine holes cannot host a championship');
  assert.equal(eligibleFor('countyOpen', { prestige: 60, resort, holesOpen: 18 }), true);

  assert.equal(eligibleFor('regional', { prestige: 75, resort, holesOpen: 18 }), false,
    'no grandstands, no regional');
  const built = { amenities: [{ type: 'grandstands' }, { type: 'overflowParking' }], rooms: {} };
  assert.equal(eligibleFor('regional', { prestige: 75, resort: built, holesOpen: 18 }), true);
});

test('rungFor tolerates nonsense', () => {
  assert.equal(rungFor('nope'), null);
  assert.equal(rungFor(undefined), null);
});

test('the grounds crew decides how fast the course hardens', () => {
  // Groundskeepers have had one job since Act I. This is their second,
  // and a thin crew physically cannot get a course ready in three weeks.
  assert.equal(setupClimb(0), 0, 'nobody working means nothing happens');
  assert.ok(setupClimb(4) > setupClimb(2), 'more staff, faster');
  // Three weeks is the run-up, so a full crew must be able to reach a
  // national's band inside it or the top rung is unreachable.
  const crew = 6;
  let setup = 0;
  for (let d = 0; d < 21; d++) setup = nextSetup(setup, { keepers: crew, conditioning: true });
  assert.ok(setup >= 80, `six keepers reached only ${setup.toFixed(0)} in 21 days`);
  // And the other half, which is the half that matters: a thin crew
  // must NOT get there. Asserting only that six keepers succeed passes
  // happily against a formula where one keeper would also succeed.
  let thin = 0;
  for (let d = 0; d < 21; d++) thin = nextSetup(thin, { keepers: 2, conditioning: true });
  assert.ok(thin < 80,
    `two keepers reached ${thin.toFixed(0)}, so the crew size is not a real constraint`);
});

test('setup falls back when nobody is working on it', () => {
  let setup = 90;
  for (let d = 0; d < 10; d++) setup = nextSetup(setup, { keepers: 6, conditioning: false });
  assert.ok(setup < 90, 'it has to decay');
  assert.ok(setup >= 0, 'and never go below zero');
  assert.equal(nextSetup(0, { keepers: 0, conditioning: false }), 0);
});

test('a hard setup makes the course play harder', () => {
  assert.equal(setupDifficultyBonus(0), 0, 'an unconditioned course plays as itself');
  assert.ok(setupDifficultyBonus(100) > setupDifficultyBonus(50));
  assert.ok(setupDifficultyBonus(100) <= 30,
    'setup must not be able to outweigh the course the player actually built');
});

test('the band is a band, not a threshold', () => {
  assert.equal(withinBand(52, RUNGS.countyOpen.band), true);
  assert.equal(withinBand(30, RUNGS.countyOpen.band), false, 'under-prepared');
  assert.equal(withinBand(85, RUNGS.countyOpen.band), false,
    'a county open tricked up like a national is also wrong');
});

test('winning a bid books a date three weeks out', () => {
  const state = {
    day: 100, prestige: 75, act: 3, tournament: null,
    resort: { amenities: [{ type: 'grandstands' }, { type: 'overflowParking' }] },
    tournamentsHosted: ['countyOpen'],
  };
  const booked = bidFor(state, 'regional', { holesOpen: 18 });
  assert.ok(booked, 'a resort that meets the requirements should be accepted');
  assert.equal(booked.rung, 'regional');
  assert.equal(booked.day, 100 + RUN_UP_DAYS);
  assert.equal(booked.resolved, false);
});

test('a bid is refused when the requirements are not met', () => {
  const state = {
    day: 100, prestige: 40, act: 3, tournament: null,
    resort: { amenities: [] }, tournamentsHosted: [],
  };
  assert.equal(bidFor(state, 'countyOpen', { holesOpen: 18 }), null);
});

test('rungs are climbed in order, and not skipped', () => {
  assert.equal(nextRungFor([]), 'countyOpen');
  assert.equal(nextRungFor(['countyOpen']), 'regional');
  assert.equal(nextRungFor(['countyOpen', 'regional']), 'national');
  assert.equal(nextRungFor(['countyOpen', 'regional', 'national']), null,
    'there is nothing above a national');
});

test('a resort cannot book two championships at once', () => {
  const state = {
    day: 100, prestige: 90, act: 3,
    tournament: { rung: 'countyOpen', day: 110, resolved: false },
    resort: { amenities: [] }, tournamentsHosted: [],
  };
  assert.equal(bidFor(state, 'countyOpen', { holesOpen: 18 }), null,
    'one week at a time');
});

test('a barred rung refuses the bid until the bar expires', () => {
  const state = {
    day: 100, prestige: 90, act: 3, tournament: null,
    resort: { amenities: [] }, tournamentsHosted: [],
    tournamentBars: { countyOpen: 160 },
  };
  assert.equal(bidFor(state, 'countyOpen', { holesOpen: 18 }), null,
    'barred until day 160');
  assert.ok(bidFor({ ...state, day: 161 }, 'countyOpen', { holesOpen: 18 }),
    'and welcome again afterwards');
});

test('the contract lists every bonus before it is signed', () => {
  // Every cost line in this game tells the player what they are getting
  // into if they read it. The tournament is not an exception.
  for (const id of RUNG_IDS) {
    const contract = contractFor(id);
    assert.equal(contract.baseFee, RUNGS[id].baseFee);
    assert.equal(contract.bonuses.length, 4, 'four named conditions');
    for (const bonus of contract.bonuses) {
      assert.ok(bonus.id && bonus.label && bonus.label.length > 8, 'each bonus needs a name');
      assert.ok(bonus.amount > 0, `${bonus.id} pays nothing`);
    }
    const ceiling = contract.baseFee + contract.bonuses.reduce((s, b) => s + b.amount, 0);
    assert.equal(ceiling, RUNGS[id].purseCeiling,
      `${id}: the advertised ceiling must equal what the bonuses actually add up to`);
  }
});

test('a perfect week earns the ceiling and a shambles earns the base', () => {
  const perfect = scoreTournament('countyOpen', {
    setup: 52, turfQuality: 88, paceOnTarget: true, crowdHandled: true,
  });
  assert.equal(perfect.paid, RUNGS.countyOpen.purseCeiling);
  assert.equal(perfect.met.length, 4);
  assert.ok(perfect.prestige > 0, 'and it should be worth something in reputation');

  const shambles = scoreTournament('countyOpen', {
    setup: 15, turfQuality: 40, paceOnTarget: false, crowdHandled: false,
  });
  assert.equal(shambles.paid, RUNGS.countyOpen.baseFee);
  assert.equal(shambles.met.length, 0);
  assert.ok(shambles.prestige < 0, 'a shambles has to cost reputation');
  assert.ok(shambles.barDays > 0, 'and the rung should go to somebody else for a while');
});

test('overcooking the course fails the band as surely as undercooking', () => {
  const tricked = scoreTournament('countyOpen', {
    setup: 95, turfQuality: 88, paceOnTarget: true, crowdHandled: true,
  });
  assert.ok(!tricked.met.includes('band'),
    'a county open set like a national is not set correctly');
  assert.ok(tricked.paid < RUNGS.countyOpen.purseCeiling);
});

test('missing the band pays base only, even when turf, pace and crowd all hit — '
  + 'and hitting the band pays them, in the same three conditions', () => {
  // Changed with the free-ride fix: band used to be one bonus among four,
  // so a course left unconditioned (or overcooked past the band) still
  // banked turf, pace and crowd for free — three of the four contract
  // conditions are satisfied by ordinary operation, so only band ever
  // required the work. Now band gates the other three: missing it pays
  // the base fee only, whatever else went right that week. Asserted both
  // directions on the identical turf/pace/crowd inputs, so this cannot
  // pass by only ever checking the failing side.
  const common = { turfQuality: 88, paceOnTarget: true, crowdHandled: true };
  const band = RUNGS.countyOpen.band;

  const outOfBand = scoreTournament('countyOpen', { ...common, setup: band.high + 20 });
  assert.ok(!outOfBand.met.includes('band'), 'sanity: this setup must miss the band');
  assert.deepEqual(outOfBand.met.sort(), ['crowd', 'pace', 'turf'],
    'turf, pace and crowd are still individually met and reported as such');
  assert.equal(outOfBand.paid, RUNGS.countyOpen.baseFee,
    'none of the three pay out without the band — base fee only');

  const inBand = scoreTournament('countyOpen', {
    ...common, setup: (band.low + band.high) / 2,
  });
  assert.ok(inBand.met.includes('band'));
  assert.equal(inBand.met.length, 4);
  assert.equal(inBand.paid, RUNGS.countyOpen.purseCeiling,
    'the identical turf/pace/crowd DO pay out once the band is also met');
});

test('a good week is never barred', () => {
  const good = scoreTournament('regional', {
    setup: 70, turfQuality: 85, paceOnTarget: true, crowdHandled: true,
  });
  assert.equal(good.barDays, 0);
});

test('a crew never conditions past what it was asked for', () => {
  // The band bonus used to be a coin flip for a well-staffed resort.
  // Conditioning was all-or-nothing -- full climb up, full decay down --
  // so a big crew shot past the target and fell back through the band,
  // and whether the event landed on a good day was luck. Measured on a
  // national before the fix, nine groundskeepers sat outside the band on
  // six days in twenty.
  //
  // Swept across crew sizes rather than asserted at one, because the bug
  // only appeared once the crew outgrew the target and a single-crew test
  // would have passed throughout.
  for (const [rung, target] of [['countyOpen', 52], ['regional', 70], ['national', 86]]) {
    const band = RUNGS[rung].band;
    for (const keepers of [5, 6, 8, 9, 12, 14]) {
      let setup = 0;
      for (let day = 0; day < 60; day++) {
        setup = nextSetup(setup, { keepers, conditioning: setup < target, target });
        assert.ok(setup <= target + 1e-9,
          `${rung} with ${keepers} keepers overshot to ${setup.toFixed(1)} past a target of ${target}`);
        if (day >= 40) {
          assert.ok(setup >= band.low && setup <= band.high,
            `${rung} with ${keepers} keepers settled at ${setup.toFixed(1)}, outside its own band ${band.low}-${band.high}`);
        }
      }
    }
  }
});

test('and a thin crew still cannot get there inside the run-up', () => {
  // The fix must not turn "ask for 86" into "receive 86". What stops it
  // is the clock, not decay: decay only applies when the crew is NOT
  // conditioning, so a thin crew climbs slowly but never slides back.
  // Two groundskeepers add 1.6 a day and simply run out of days.
  //
  // Written against RUN_UP_DAYS rather than a round number, so that
  // shortening the run-up cannot quietly make this pass for the wrong
  // reason. An earlier version of this test ran sixty days and failed:
  // two keepers reached 84.1, because given long enough they arrive.
  let setup = 0;
  for (let day = 0; day < RUN_UP_DAYS; day++) {
    setup = nextSetup(setup, { keepers: 2, conditioning: setup < 86, target: 86 });
  }
  assert.ok(setup < RUNGS.national.band.low,
    `two groundskeepers reached ${setup.toFixed(1)} in ${RUN_UP_DAYS} days, so asking is all it takes`);
  assert.ok(setup > 0, 'sanity: they did do some work');
});
