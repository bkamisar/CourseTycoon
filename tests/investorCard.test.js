import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/fakeDom.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { startingInvestors, payBuyout } from '../src/sim/investors.js';
import { makeRng } from '../src/sim/rng.js';
import { GATE_THRESHOLDS } from '../src/sim/acts.js';
import { builtOutNine } from '../tools/scenarios.js';

const { investorCards } = await import('../src/ui/investorCard.js');
const { mountEventCard } = await import('../src/ui/event.js');
const { FakeNode } = await import('./helpers/fakeDom.js');

/**
 * The investors on the decision card.
 *
 * The act's whole pressure used to arrive as small grey lines on the
 * evening report -- they turned up in a sentence, judged you in a
 * sentence, and called their money in in a sentence.
 *
 * The risk in moving them onto a card is that a card is prose, and prose
 * is where a screen most easily starts describing a game that did not
 * happen. So every card is built from the report the day produced, and
 * the tests below are mostly about a card not being able to say something
 * the report does not support -- especially the announcements, which must
 * fire once and not every morning afterwards.
 */

function act2(overrides = {}) {
  const state = newGame(21);
  state.act = 2;
  state.day = 30;
  state.money = 300000;
  state.resort.rooms = { standard: 12, suite: 5 };
  state.resort.pricing.roomRate = 120;
  state.investors = startingInvestors(state, makeRng(21));
  Object.assign(state.investors, overrides);
  return state;
}

test('an ordinary day earns no investor card', () => {
  const { state, report } = runDay(act2(), 2100);
  assert.deepEqual(investorCards(report, state), [],
    'a quiet fortnight must not interrupt the player every evening');
});

test('a resort with no investors at all earns none', () => {
  const { state, report } = runDay(newGame(3), 300);
  assert.deepEqual(investorCards(report, state), []);
});

test('the investors get a card the day they arrive, and only that day', () => {
  // Driven through the real gate rather than faked, because the first
  // version of this test built a three-hole resort, never reached Act II
  // at all, and passed on "the arrival card fired 0 times, which is at
  // most once". A test that cannot reach the thing it is about agrees
  // with everything -- spec 15c, and the third time it has happened on
  // this project.
  let state = builtOutNine(7);
  state.money = GATE_THRESHOLDS.money + 200000;
  state.prestige = GATE_THRESHOLDS.prestige + 15;
  state.satisfactionHistory = Array(GATE_THRESHOLDS.satisfactionDays + 5)
    .fill(GATE_THRESHOLDS.satisfaction + 10);

  let arrivals = 0;
  let reached = false;
  for (let d = 0; d < 6; d++) {
    const out = runDay(state, 900 + d);
    state = out.state;
    if (state.act >= 2) reached = true;
    if (investorCards(out.report, state).some((c) => c.id === 'investors-arrive')) arrivals += 1;
  }

  assert.ok(reached, 'the fixture has to actually pass the gate, or this test proves nothing');
  assert.equal(arrivals, 1,
    `the arrival card fired ${arrivals} times; it must fire exactly once`);
});

test('the arrival card names the first target the investors set', () => {
  let state = builtOutNine(11);
  state.money = GATE_THRESHOLDS.money + 200000;
  state.prestige = GATE_THRESHOLDS.prestige + 15;
  state.satisfactionHistory = Array(GATE_THRESHOLDS.satisfactionDays + 5)
    .fill(GATE_THRESHOLDS.satisfaction + 10);

  const out = runDay(state, 950);
  assert.ok(out.report.investorsArrived, 'sanity: they arrive on this day');
  const card = investorCards(out.report, out.state).find((c) => c.id === 'investors-arrive');
  assert.ok(card, 'their arrival has to reach a card');
  assert.match(card.prompt, new RegExp(String(out.report.investors.target.dueDay)),
    'the card must name the deadline the report carries');
});

test('a review card quotes the verdict the report recorded', () => {
  const state = act2();
  state.investors.nextTarget = {
    measure: 'prestige', threshold: 5, dueDay: state.day, reviewIndex: 0,
  };
  const { state: after, report } = runDay(state, 2100);

  const card = investorCards(report, after).find((c) => c.id.startsWith('investors-review'));
  assert.ok(card, 'a review that happened has to be announced');
  assert.ok(report.investors.reviewed, 'sanity: the report recorded a review');
  assert.match(card.prompt, new RegExp(String(Math.round(report.investors.confidence))),
    'the card must quote the confidence the report carries');
  assert.equal(card.choices.length, 1, 'a verdict is an announcement, not a choice');
});

test('the settlement card is the only one with a real decision', () => {
  const state = act2({ confidence: 0 });
  const { state: after, report } = runDay(state, 2100);
  assert.ok(report.investors.demandRaised, 'sanity: confidence at zero raises a demand');

  const card = investorCards(report, after).find((c) => c.id === 'investors-settlement');
  assert.ok(card, 'the demand has to reach a card');
  assert.equal(card.choices.length, 2, 'pay it or do not');
  assert.equal(card.choices[0].effect, 'payBuyout');
  assert.match(card.choices[0].label, /Pay \$/);
});

test('the settlement card fires the day it is raised, not every day it stands', () => {
  let state = act2({ confidence: 0 });
  let raised = 0;
  for (let d = 0; d < 10; d++) {
    const out = runDay(state, 2200 + d);
    state = out.state;
    if (investorCards(out.report, state).some((c) => c.id === 'investors-settlement')) raised += 1;
  }
  assert.equal(raised, 1,
    `the demand card appeared ${raised} times; a fortnight-long deadline must not nag daily`);
});

test('a demand you cannot afford shows the button shut off, not missing', () => {
  const state = act2({ confidence: 0 });
  state.money = 100;
  const { state: after, report } = runDay(state, 2100);
  const card = investorCards(report, after).find((c) => c.id === 'investors-settlement');
  assert.equal(card.choices[0].disabled, true, 'it must not be clickable');
  assert.match(card.choices[0].cost, /not enough/,
    'and it should say why, rather than looking broken');
});

test('paying the buyout is announced once and then never again', () => {
  const state = act2({ confidence: 0 });
  const { state: demanded } = runDay(state, 2100);
  assert.ok(demanded.investors.buyoutDemand, 'sanity: a demand stands');

  let current = payBuyout(demanded);
  assert.ok(current.investors.bought, 'sanity: it was affordable');

  let announced = 0;
  for (let d = 0; d < 6; d++) {
    const out = runDay(current, 2300 + d);
    current = out.state;
    if (investorCards(out.report, current).some((c) => c.id === 'investors-bought')) announced += 1;
  }
  assert.equal(announced, 1, `the buyout was announced ${announced} times`);
});

test('liquidation is announced once, and never as a buyout', () => {
  const state = act2({ confidence: 0 });
  state.money = 0;
  let current = runDay(state, 2100).state;
  current.investors.buyoutDemand.dueDay = current.day;

  let liquidations = 0;
  let boughts = 0;
  for (let d = 0; d < 6; d++) {
    const out = runDay(current, 2400 + d);
    current = out.state;
    const ids = investorCards(out.report, current).map((c) => c.id);
    if (ids.includes('investors-liquidated')) liquidations += 1;
    if (ids.includes('investors-bought')) boughts += 1;
  }
  assert.equal(liquidations, 1, `liquidation announced ${liquidations} times`);
  assert.equal(boughts, 0, 'losing the rooms must never read as having bought them out');
});

test('an announcement card does not claim to be a decision', () => {
  // "Your call" over a single button reading "Understood" is the
  // interface offering a choice the player does not have.
  const state = act2();
  state.investors.nextTarget = {
    measure: 'prestige', threshold: 5, dueDay: state.day, reviewIndex: 0,
  };
  const { state: after, report } = runDay(state, 2100);
  const card = investorCards(report, after).find((c) => c.id.startsWith('investors-review'));

  const root = new FakeNode('div');
  mountEventCard(root, { event: card, onChoose() {} });
  assert.ok(!root.textContent.includes('Your call'),
    'an announcement must not be kickered as a decision');
  assert.ok(root.textContent.includes(card.kicker));
});

test('a disabled choice cannot be chosen', () => {
  let chosen = null;
  const root = new FakeNode('div');
  mountEventCard(root, {
    event: {
      kicker: 'TEST', speaker: 'x', prompt: 'y',
      choices: [{ label: 'nope', cost: '', disabled: true }, { label: 'yes', cost: '' }],
    },
    onChoose: (i) => { chosen = i; },
  });
  const buttons = root.findAll((n) => n.tagName === 'button');
  buttons[0].click();
  assert.equal(chosen, null, 'a shut-off button must not fire');
  buttons[1].click();
  assert.equal(chosen, 1);
});
