import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNGS } from '../src/sim/tournaments.js';
import { championshipCards } from '../src/ui/championshipCard.js';

test('no cards on an ordinary evening', () => {
  assert.deepEqual(championshipCards({ day: 40 }, {}), []);
});

test('the invitation arrives as its own card', () => {
  const cards = championshipCards({ day: 60, actThreeArrived: true }, { act: 3 });
  assert.equal(cards.length, 1);
  assert.match(cards[0].id, /invit/i);
  assert.ok(cards[0].prompt.length > 80, 'a letter from a governing body deserves words');
  assert.equal(cards[0].choices.length, 1, 'an announcement, not a decision');
});

test('the result names every condition, met or missed', () => {
  // The whole point of four named conditions is that the player can see
  // which one cost them. A card showing only the total would make the
  // contract an opaque score again.
  const report = {
    day: 90,
    tournament: {
      rung: 'countyOpen',
      met: ['target', 'turf'],
      missed: ['pace', 'crowd'],
      paid: 61000, prestige: 4, barDays: 0,
      setup: 52, band: RUNGS.countyOpen.band, turfQuality: 88,
      field: {
        averageToPar: 5.4, underPar: 2, best: -2,
        hardestHole: 14, averageRoundMinutes: 268,
      },
      difficulty: 47, minDifficulty: 45, difficultyMet: true,
      week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [{ round: 1, leaderToPar: -2, pins: 'fair', weather: 'fair' }, { round: 2, leaderToPar: -1, pins: 'tough', weather: 'breezy' }] },
    },
  };
  const cards = championshipCards(report, { act: 3 });
  assert.equal(cards.length, 1);
  const card = cards[0];
  for (const condition of ['target', 'turf', 'pace', 'crowd']) {
    assert.ok(card.conditions.some((c) => c.id === condition),
      `${condition} must appear on the result card`);
  }
  assert.equal(card.conditions.filter((c) => c.met).length, 2);
  assert.match(card.prompt, /61,000/, 'the money must be in the words');
});

test('the card and the payout cannot disagree', () => {
  // A card is built from the contract's own line items and the report's
  // met list, so what it shows as earned has to add up to what was
  // actually banked. This is the bug species this project produces more
  // than any other, on the one surface where it would be loudest.
  const report = {
    day: 91,
    tournament: {
      rung: 'regional', met: ['target', 'turf', 'pace'], missed: ['crowd'],
      paid: 0, prestige: 6, barDays: 0,
      setup: 70, band: RUNGS.regional.band, turfQuality: 84,
      field: { averageToPar: 7.1, underPar: 1, best: -1, hardestHole: 9, averageRoundMinutes: 279 },
      difficulty: 47, minDifficulty: 45, difficultyMet: true,
      week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [{ round: 1, leaderToPar: -2, pins: 'fair', weather: 'fair' }, { round: 2, leaderToPar: -1, pins: 'tough', weather: 'breezy' }] },
    },
  };
  const contract = championshipCards(report, { act: 3 })[0];
  const earned = contract.conditions
    .filter((c) => c.met)
    .reduce((sum, c) => sum + c.amount, RUNGS.regional.baseFee);
  assert.equal(earned, contract.wouldPay,
    'the line items the card shows as met must sum to what it says was earned');
});

test('a missed target says the other conditions were earned but not paid', () => {
  // The target gates the rest. The card must not silently drop three conditions
  // the player genuinely met -- that reads as the game losing them.
  const report = {
    day: 92,
    tournament: {
      rung: 'countyOpen', met: ['turf', 'pace', 'crowd'], missed: ['target'],
      paid: RUNGS.countyOpen.baseFee, prestige: 2, barDays: 0,
      setup: 12, band: RUNGS.countyOpen.band, turfQuality: 94,
      field: { averageToPar: 1.1, underPar: 17, best: -8, hardestHole: 2, averageRoundMinutes: 241 },
      difficulty: 47, minDifficulty: 45, difficultyMet: true,
      week: { rounds: 2, winningTotal: -9, target: { low: -4, high: 2 }, roundLog: [{ round: 1, leaderToPar: -2, pins: 'fair', weather: 'fair' }, { round: 2, leaderToPar: -1, pins: 'tough', weather: 'breezy' }] },
    },
  };
  const [card] = championshipCards(report, { act: 3 });
  assert.equal(card.conditions.filter((c) => c.met).length, 3);
  assert.equal(card.conditions.filter((c) => c.paid).length, 0,
    'nothing pays without the target');
  assert.match(card.prompt, /-9/, 'the winning score is what missed');
  assert.match(card.prompt, /-4 to \+2/, 'and the card has to say what was wanted');
});

test('a barred rung says so, because a setback the player cannot see is a dead end', () => {
  const report = {
    day: 93,
    tournament: {
      rung: 'countyOpen', met: [], missed: ['target', 'turf', 'pace', 'crowd'],
      paid: RUNGS.countyOpen.baseFee, prestige: -6, barDays: 120,
      setup: 5, band: RUNGS.countyOpen.band, turfQuality: 40,
      field: { averageToPar: 1.2, underPar: 19, best: -7, hardestHole: 3, averageRoundMinutes: 240 },
      difficulty: 47, minDifficulty: 45, difficultyMet: true,
      week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [{ round: 1, leaderToPar: -2, pins: 'fair', weather: 'fair' }, { round: 2, leaderToPar: -1, pins: 'tough', weather: 'breezy' }] },
    },
  };
  const [card] = championshipCards(report, { act: 3 });
  assert.match(card.prompt, /120|season/i, 'the bar has to be stated');
});

test('the field is described, since it is what the dial was for', () => {
  const report = {
    day: 94,
    tournament: {
      rung: 'national', met: ['target', 'turf', 'pace', 'crowd'], missed: [],
      paid: RUNGS.national.purseCeiling, prestige: 18, barDays: 0,
      setup: 86, band: RUNGS.national.band, turfQuality: 90,
      field: { averageToPar: 9.1, underPar: 0, best: 1, hardestHole: 17, averageRoundMinutes: 284 },
      difficulty: 47, minDifficulty: 45, difficultyMet: true,
      week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [{ round: 1, leaderToPar: -2, pins: 'fair', weather: 'fair' }, { round: 2, leaderToPar: -1, pins: 'tough', weather: 'breezy' }] },
    },
  };
  const [card] = championshipCards(report, { act: 3 });
  assert.match(card.field, /9\.1|nine/i, 'what the field averaged');
  assert.match(card.field, /17/, 'and which hole took the most off them');
});

test('passing the act gets its own card, after the write-up', () => {
  // A gate the player cannot see is a dead end rather than an ending.
  const report = {
    day: 300,
    actThreePassed: true,
    tournament: {
      rung: 'national', met: ['target', 'turf', 'pace', 'crowd'], missed: [],
      paid: RUNGS.national.purseCeiling, prestige: 18, barDays: 0,
      setup: 86, band: RUNGS.national.band, turfQuality: 90,
      field: { averageToPar: 9.1, underPar: 0, best: 1, hardestHole: 17, averageRoundMinutes: 284 },
      difficulty: 47, minDifficulty: 45, difficultyMet: true,
      week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [{ round: 1, leaderToPar: -2, pins: 'fair', weather: 'fair' }, { round: 2, leaderToPar: -1, pins: 'tough', weather: 'breezy' }] },
    },
  };
  const cards = championshipCards(report, { act: 3 });
  assert.equal(cards.length, 2, 'the week, then what the week meant');
  assert.match(cards[0].id, /result/);
  assert.match(cards[1].id, /passed/);
});

test('the write-up is about the winning score, round by round', () => {
  const report = {
    day: 95,
    tournament: {
      rung: 'regional', met: ['target', 'turf', 'pace', 'crowd'], missed: [],
      paid: RUNGS.regional.purseCeiling, prestige: 11, barDays: 0, setup: 70,
      band: RUNGS.regional.band, turfQuality: 86, difficulty: 57, minDifficulty: 55, difficultyMet: true,
      field: { averageToPar: 6, underPar: 1, best: -1, hardestHole: 12, averageRoundMinutes: 270 },
      week: {
        rounds: 3, winningTotal: 5, target: { low: 2, high: 8 },
        roundLog: [
          { round: 1, leaderToPar: -1, pins: 'fair', weather: 'clear' },
          { round: 2, leaderToPar: 1, pins: 'tough', weather: 'fair' },
          { round: 3, leaderToPar: 5, pins: 'brutal', weather: 'blowy' },
        ],
      },
    },
  };
  const card = championshipCards(report, { act: 3 })[0];
  assert.match(card.prompt, /\+5/, 'the winning score is in the words');
  assert.match(card.prompt, /\+2 to \+8/, 'and what was wanted');
  assert.doesNotMatch(card.prompt, /competitor|player [0-9]/i, 'and nobody is named');
});

test('the winning score is the week, never the last round\'s best', () => {
  // `field` is the final round only. Its best (-1) must not be passed off
  // as the winner's week (+5).
  const report = {
    day: 95,
    tournament: {
      rung: 'regional', met: ['target', 'turf', 'pace', 'crowd'], missed: [],
      paid: RUNGS.regional.purseCeiling, prestige: 11, barDays: 0, setup: 70,
      band: RUNGS.regional.band, turfQuality: 86, difficulty: 57, minDifficulty: 55, difficultyMet: true,
      field: { averageToPar: 6, underPar: 1, best: -1, hardestHole: 12, averageRoundMinutes: 270 },
      week: { rounds: 3, winningTotal: 5, target: { low: 2, high: 8 }, roundLog: [] },
    },
  };
  const card = championshipCards(report, { act: 3 })[0];
  assert.match(card.prompt, /winner finished \+5/);
  assert.doesNotMatch(card.prompt, /-1\b/, 'the final round\'s best is not the winner');
  assert.match(card.field, /^In the final round, the field averaged/,
    'the field figures are one round, and say so');
});

test('the field is told under par in words, not as "-0.4 over"', () => {
  const base = {
    rung: 'countyOpen', met: ['target', 'turf', 'pace', 'crowd'], missed: [],
    paid: 61000, prestige: 4, barDays: 0, setup: 52, band: RUNGS.countyOpen.band, turfQuality: 88,
    difficulty: 47, minDifficulty: 45, difficultyMet: true,
    week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [] },
  };
  const under = championshipCards({
    day: 1, tournament: { ...base, field: { averageToPar: -0.4, underPar: 40, best: -5, hardestHole: 3 } },
  }, { act: 3 })[0];
  assert.match(under.field, /0\.4 under par/);
  assert.doesNotMatch(under.field, /-0\.4/);
  const even = championshipCards({
    day: 2, tournament: { ...base, field: { averageToPar: 0.02, underPar: 40, best: -5, hardestHole: 3 } },
  }, { act: 3 })[0];
  assert.match(even.field, /even par/);
  assert.doesNotMatch(even.field, /0\.0/);
  const over = championshipCards({
    day: 3, tournament: { ...base, field: { averageToPar: 6.2, underPar: 0, best: 1, hardestHole: 3 } },
  }, { act: 3 })[0];
  assert.match(over.field, /6\.2 over par/);
});

test('a course under the floor is told as that, not as a scoring miss', () => {
  const report = {
    day: 96,
    tournament: {
      rung: 'national', met: ['turf'], missed: ['target', 'pace', 'crowd'],
      paid: RUNGS.national.baseFee, prestige: -18, barDays: 120, setup: 86,
      band: RUNGS.national.band, turfQuality: 90, difficulty: 61.4, minDifficulty: 65, difficultyMet: false,
      field: { averageToPar: 8, underPar: 0, best: 2, hardestHole: 4, averageRoundMinutes: 290 },
      week: { rounds: 4, winningTotal: 14, target: { low: 12, high: 18 }, roundLog: [] },
    },
  };
  const card = championshipCards(report, { act: 3 })[0];
  assert.match(card.prompt, /61\.4/);
  assert.match(card.prompt, /65/);
});

test('a course a tenth short of the floor does not read as meeting it', () => {
  // The report stores difficulty floored to a tenth, so 44.9 against a
  // floor of 45 must not be printed "45 against 45".
  const report = {
    day: 97,
    tournament: {
      rung: 'countyOpen', met: ['turf'], missed: ['target', 'pace', 'crowd'],
      paid: RUNGS.countyOpen.baseFee, prestige: -2, barDays: 60, setup: 40,
      band: RUNGS.countyOpen.band, turfQuality: 90, difficulty: 44.9, minDifficulty: 45, difficultyMet: false,
      field: { averageToPar: 3, underPar: 4, best: -3, hardestHole: 4, averageRoundMinutes: 250 },
      week: { rounds: 2, winningTotal: -3, target: { low: -2, high: 3 }, roundLog: [] },
    },
  };
  const card = championshipCards(report, { act: 3 })[0];
  assert.match(card.prompt, /44\.9/);
  assert.doesNotMatch(card.prompt, /measured 45\b/);
});

function weekPrompt(roundLog, extra = {}) {
  return championshipCards({
    day: 98,
    tournament: {
      rung: 'regional', met: ['target', 'turf', 'pace', 'crowd'], missed: [],
      paid: RUNGS.regional.purseCeiling, prestige: 11, barDays: 0, setup: 70,
      band: RUNGS.regional.band, turfQuality: 86, difficulty: 57, minDifficulty: 55, difficultyMet: true,
      field: { averageToPar: 6, underPar: 1, best: -1, hardestHole: 12 },
      week: { rounds: roundLog.length, winningTotal: 2, target: { low: 0, high: 4 }, roundLog },
      ...extra,
    },
  }, { act: 3 })[0].prompt;
}

const round = (n, leaderToPar, pins) => ({ round: n, leaderToPar, pins, weather: 'fair' });

test('the lead is a score, not a person who gave something back', () => {
  const moved = weekPrompt([round(1, -1, 'fair'), round(2, 2, 'fair')]);
  assert.match(moved, /The lead was -1 after the first round and \+2 by the end\./);
  assert.doesNotMatch(moved, /gave back|found|leader was/i);
  const still = weekPrompt([round(1, 2, 'fair'), round(2, 2, 'fair')]);
  assert.match(still, /The lead was \+2 after the first round and the same at the end./);
});

test('the pins are called harder or easier against the first round, only when that is true', () => {
  const said = (log) => weekPrompt(log);
  assert.match(said([round(1, 0, 'fair'), round(2, 1, 'tough')]), /pins went in harder/);
  assert.match(said([round(1, 0, 'brutal'), round(2, 1, 'tough')]), /pins came out easier/);
  assert.match(said([round(1, 0, 'easy'), round(2, 1, 'fair'), round(3, 2, 'brutal')]), /pins went in harder/);
  // Opened tough and stayed tough: nothing went in harder.
  assert.doesNotMatch(said([round(1, 0, 'tough'), round(2, 1, 'tough')]), /pins/);
  // Went both ways: not a story.
  assert.doesNotMatch(said([round(1, 0, 'fair'), round(2, 1, 'brutal'), round(3, 2, 'easy')]), /pins/);
  // A pin id the game does not know says nothing rather than guessing.
  assert.doesNotMatch(said([round(1, 0, 'fair'), round(2, 1, 'sadistic')]), /pins/);
});

test('a report with no target does not print an empty range', () => {
  const prompt = weekPrompt([], { week: { rounds: 2, winningTotal: 2, roundLog: [] } });
  assert.match(prompt, /The winner finished \+2/);
  assert.doesNotMatch(prompt, / to  |inside the {2}|wanted \./);
  const missed = weekPrompt([], {
    met: ['turf'], missed: ['target'], week: { rounds: 2, winningTotal: 2, roundLog: [] },
  });
  assert.doesNotMatch(missed, /They wanted\s*,|wanted  /);
  assert.match(missed, /misses the target/);
});

test('the field band comes from the tenth it prints', () => {
  const [card] = championshipCards({
    day: 99,
    tournament: {
      rung: 'regional', met: ['target'], missed: [], paid: 1, prestige: 0, barDays: 0, setup: 70,
      band: RUNGS.regional.band, turfQuality: 86, difficulty: 57, minDifficulty: 55, difficultyMet: true,
      field: { averageToPar: 3.96, underPar: 1, best: 0, hardestHole: 5 },
      week: { rounds: 2, winningTotal: 0, target: { low: -2, high: 3 }, roundLog: [] },
    },
  }, { act: 3 });
  assert.match(card.field, /4\.0 over par — a fair one/, '3.96 prints as 4.0, so it is called what 4.0 is');
});

test('a National that met the target, turf and pace is a good week without the crowd', () => {
  // The kicker used to need the whole ceiling, which needs the crowd bonus,
  // which the National's gallery puts out of a sensible resort's reach --
  // so the week the act is for could never be called a good one.
  const week = (met) => ({
    day: 94,
    tournament: {
      rung: 'national', met, missed: ['target', 'turf', 'pace', 'crowd'].filter((m) => !met.includes(m)),
      paid: 500000, prestige: 18, barDays: 0,
      setup: 86, band: RUNGS.national.band, turfQuality: 84,
      field: { averageToPar: 9.1, underPar: 0, best: 3, hardestHole: 9, averageRoundMinutes: 270 },
      difficulty: 65.2, minDifficulty: 65, difficultyMet: true,
      week: { rounds: 4, winningTotal: 16, target: { low: 14, high: 20 }, roundLog: [{ round: 1, leaderToPar: 4, pins: 'fair', weather: 'fair' }] },
    },
  });
  assert.equal(championshipCards(week(['target', 'turf', 'pace']), { act: 3 })[0].kicker, 'A GOOD WEEK');
  assert.equal(championshipCards(week(['target', 'turf', 'pace', 'crowd']), { act: 3 })[0].kicker, 'A GOOD WEEK');
  // And it is not handed out: each of the three is needed.
  for (const met of [['target', 'turf'], ['target', 'pace', 'crowd'], ['turf', 'pace', 'crowd']]) {
    assert.equal(championshipCards(week(met), { act: 3 })[0].kicker, 'THE WRITE-UP', met.join(','));
  }
});

// --- The practice round (run-up spec 2026-10-04 §2) -------------------

function practiceReport(overrides = {}) {
  return {
    day: 29,
    practiceRound: {
      rung: 'national',
      target: RUNGS.national.target,
      minDifficulty: RUNGS.national.minDifficulty,
      setupAtRoundOne: 86,
      difficulty: 66.27,
      median: 11,
      low: 8,
      high: 14,
      samples: 16,
      ...overrides,
    },
  };
}

test('the practice round is an announcement from the governing body, numbers from the report', () => {
  const cards = championshipCards(practiceReport(), { act: 3 });
  assert.equal(cards.length, 1);
  const card = cards[0];
  assert.equal(card.id, 'practice-round-29');
  assert.equal(card.kicker, 'THE PRACTICE ROUND');
  assert.equal(card.speaker, 'The governing body');
  assert.equal(card.choices.length, 1, 'information, not a decision');
  const t = RUNGS.national.target;
  for (const text of ['about +11', '+8 to +14', `${t.low > 0 ? '+' : ''}${t.low} to +${t.high}`,
    '(86)', '66.2', `${RUNGS.national.minDifficulty}`, 'as it stands']) {
    assert.ok(card.prompt.includes(text), `expected "${text}" in: ${card.prompt}`);
  }
});

test('the practice round floors the difficulty to a tenth, like the report', () => {
  // 64.96 against a floor of 65 is under it, and "65.0" would read as met.
  const card = championshipCards(practiceReport({ difficulty: 64.96, minDifficulty: 65 }), {})[0];
  assert.ok(card.prompt.includes('64.9'), card.prompt);
  assert.ok(!card.prompt.includes('65.0'), card.prompt);
});

test('the practice round says which way the forecast misses the target', () => {
  const t = RUNGS.national.target;
  const under = championshipCards(practiceReport({ median: t.low - 3, low: t.low - 6, high: t.low - 1 }), {})[0];
  assert.match(under.prompt, /too easy/i);
  const over = championshipCards(practiceReport({ median: t.high + 3, low: t.high, high: t.high + 6 }), {})[0];
  assert.match(over.prompt, /too hard/i);
  const right = championshipCards(practiceReport({ median: t.low + 1, low: t.low - 2, high: t.high }), {})[0];
  assert.doesNotMatch(right.prompt, /too (easy|hard)/i);
});

test('a practice card comes before any result card the same evening', () => {
  const report = {
    ...practiceReport(),
    tournament: {
      rung: 'countyOpen', met: ['target'], missed: [], paid: 1, prestige: 1, barDays: 0,
      difficulty: 47, minDifficulty: 45, difficultyMet: true,
      week: { rounds: 2, winningTotal: -1, target: { low: -4, high: 2 }, roundLog: [] },
    },
  };
  const ids = championshipCards(report, {}).map((c) => c.id);
  assert.equal(ids[0], 'practice-round-29');
  assert.match(ids[1], /^championship-result/);
});
