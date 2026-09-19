import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandGroups } from '../src/sim/economy.js';
import { nextPrestige } from '../src/sim/ratings.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';

const conditions = {
  courseRating: 60, prestige: 50, amenities: [{ type: 'clubhouse' }],
  greenFee: 45, teeInterval: 10,
};

test('word of mouth sharply cuts demand when recent satisfaction is poor', () => {
  const unhappy = demandGroups({ ...conditions, recentSatisfaction: 15 });
  const happy = demandGroups({ ...conditions, recentSatisfaction: 85 });
  assert.ok(
    unhappy < happy * 0.5,
    `expected a resort with recentSatisfaction 15 to draw well under half the groups of one at 85, got ${unhappy} vs ${happy}`
  );
});

test('demandGroups with no recentSatisfaction behaves like the old, unaffected call', () => {
  const withDefault = demandGroups(conditions);
  const withNeutral = demandGroups({ ...conditions, recentSatisfaction: 50 });
  assert.equal(withDefault, withNeutral, 'omitting recentSatisfaction should be identical to passing the neutral default');
});

test('a poor-satisfaction resort does not grow its group count over ten days', () => {
  let state = newGame(21);
  const groupsByDay = [];
  const satisfactionByDay = [];
  for (let i = 0; i < 10; i++) {
    const { state: next, report } = runDay(state, 21 * 1000 + i);
    state = next;
    groupsByDay.push(report.groupsPlayed);
    satisfactionByDay.push(report.averageSatisfaction);
  }

  const averageSatisfaction =
    satisfactionByDay.reduce((s, v) => s + v, 0) / satisfactionByDay.length;
  assert.ok(
    averageSatisfaction < 45,
    `this scenario is only a useful test of the feedback loop if satisfaction is genuinely poor, got ${averageSatisfaction}`
  );

  // Day one runs on the neutral default (no history yet to judge the resort
  // by). If satisfaction genuinely stays poor, word of mouth should keep
  // day ten's turnout from ever exceeding that unbiased starting point -
  // the failure mode this closes is demand climbing toward capacity every
  // single day regardless of how guests actually felt.
  assert.ok(
    groupsByDay[9] <= groupsByDay[0],
    `day 10 (${groupsByDay[9]}) should not exceed day 1's neutral turnout (${groupsByDay[0]}); groups by day: ${groupsByDay.join(',')}`
  );
});

test('prestige weighs satisfaction more heavily than rating', () => {
  // Same starting prestige, same distance from 0 to 100 on each axis, but
  // one call leans on a high rating with a miserable satisfaction, and the
  // other leans on a high satisfaction with a miserable rating.
  const towardHighRatingLowSatisfaction = nextPrestige(0, 100, 0);
  const towardHighSatisfactionLowRating = nextPrestige(0, 0, 100);

  assert.ok(
    towardHighSatisfactionLowRating > towardHighRatingLowSatisfaction,
    `expected satisfaction to pull prestige further than rating: rating-led ${towardHighRatingLowSatisfaction}, satisfaction-led ${towardHighSatisfactionLowRating}`
  );
});
