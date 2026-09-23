import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { AMENITIES, WAGES, amenityPerceivedValue } from '../src/sim/economy.js';
import { maxGroupsForDay } from '../src/sim/schedule.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';

import { FakeNode, fakeSheetHost } from './helpers/fakeDom.js';


const { openBuildSheet, openStaffSheet, openPricingSheet, paceConsequence, greenFeeCeiling } = await import('../src/ui/panels.js');


function buttonsByText(body, text) {
  return body.findAll((n) => n.tagName === 'button' && n.textContent === text);
}

// --- Build sheet -------------------------------------------------------

test('build sheet shows the exact cost and upkeep AMENITIES holds, for every amenity', () => {
  const state = newGame(1);
  const host = fakeSheetHost();
  openBuildSheet(host, { state, onChange: () => {} });

  for (const [type, spec] of Object.entries(AMENITIES)) {
    const details = host.body.findAll(
      (n) => n.tagName === 'div' && n.textContent.includes(`$${spec.build.toLocaleString()}`) && n.textContent.includes(`$${spec.upkeep}/day`)
    );
    assert.ok(details.length > 0, `no row for ${type} shows its real build/upkeep cost`);
  }
});

test('every amenity row states its real perceivedValue contribution, and that more value draws more golfers', () => {
  // §15a: every choice states its cost explicitly. An amenity's demand
  // effect (raising perceivedValue draws a bigger crowd via
  // demandGroups) used to be invisible — this is what makes it visible,
  // reading the real number straight off amenityPerceivedValue rather
  // than a re-typed copy that could drift from it.
  const state = newGame(1);
  const host = fakeSheetHost();
  openBuildSheet(host, { state, onChange: () => {} });

  for (const type of Object.keys(AMENITIES)) {
    const expected = Math.round(amenityPerceivedValue(type));
    const line = host.body.findAll(
      (n) => n.textContent.includes(`Adds $${expected}`) && n.textContent.toLowerCase().includes('more golfers')
    );
    assert.ok(line.length > 0, `no value line for ${type} (expected "Adds $${expected}...more golfers")`);
  }
});

test('an amenity the player cannot afford is disabled and names the shortfall', () => {
  const state = newGame(1);
  state.money = 100; // short of every amenity except nothing
  const host = fakeSheetHost();
  openBuildSheet(host, { state, onChange: () => {} });

  const proShopCost = AMENITIES.proShop.build;
  const shortfallText = `$${(proShopCost - 100).toLocaleString()} short`;
  const shortfalls = host.body.findAll((n) => n.textContent === shortfallText);
  assert.ok(shortfalls.length > 0, 'expected a shortfall line for an unaffordable amenity');
});

test('buying an amenity deducts exactly its AMENITIES build cost and adds it once', () => {
  const state = newGame(1);
  let changed = null;
  const host = fakeSheetHost();
  openBuildSheet(host, { state, onChange: (next) => (changed = next) });

  const buildButtons = buttonsByText(host.body, 'Build');
  assert.ok(buildButtons.length > 0);
  buildButtons[0].click();

  assert.ok(changed, 'onChange should fire after a purchase');
  assert.equal(changed.resort.amenities.length, state.resort.amenities.length + 1);
  const spentTotal = state.money - changed.money;
  const boughtType = changed.resort.amenities[changed.resort.amenities.length - 1].type;
  assert.equal(spentTotal, AMENITIES[boughtType].build);
  // The original state must be untouched.
  assert.equal(state.resort.amenities.length, 1);
});

test('an already-built amenity shows as Built, not Build, and cannot be bought again', () => {
  const state = newGame(1);
  const host = fakeSheetHost();
  openBuildSheet(host, { state, onChange: () => {} });
  const builtButtons = buttonsByText(host.body, 'Built');
  assert.ok(builtButtons.length >= 1, 'the starting clubhouse should read Built');
  assert.equal(builtButtons[0].disabled, true);
});

// --- Staff sheet ---------------------------------------------------------

test('staff sheet payroll equals the sum of WAGES for current staff', () => {
  const state = newGame(1);
  const host = fakeSheetHost();
  openStaffSheet(host, { state, onChange: () => {} });

  const totalLine = host.body.findAll((n) => n.textContent.startsWith('Total daily payroll'))[0];
  const expected = state.resort.staff.reduce((s, m) => s + WAGES[m.role], 0);
  assert.equal(totalLine.textContent, `Total daily payroll: $${expected.toLocaleString()}`);
});

test('hiring a groundskeeper increases the count and payroll by exactly WAGES.groundskeeper', () => {
  const state = newGame(1);
  let changed = null;
  const host = fakeSheetHost();
  openStaffSheet(host, { state, onChange: (next) => (changed = next) });

  const hireButtons = buttonsByText(host.body, '+');
  hireButtons[0].click(); // groundskeeper is first in STAFF_ROLES

  const before = state.resort.staff.filter((m) => m.role === 'groundskeeper').length;
  const after = changed.resort.staff.filter((m) => m.role === 'groundskeeper').length;
  assert.equal(after, before + 1);

  const payrollBefore = state.resort.staff.reduce((s, m) => s + WAGES[m.role], 0);
  const payrollAfter = changed.resort.staff.reduce((s, m) => s + WAGES[m.role], 0);
  assert.equal(payrollAfter - payrollBefore, WAGES.groundskeeper);
});

test('firing staff cannot go below zero', () => {
  const state = newGame(1);
  state.resort.staff = []; // no staff at all
  const host = fakeSheetHost();
  openStaffSheet(host, { state, onChange: () => {} });
  const fireButtons = buttonsByText(host.body, '−');
  for (const btn of fireButtons) assert.equal(btn.disabled, true);
});

// --- Pricing sheet ---------------------------------------------------------

test('the tee interval consequence line reports exactly maxGroupsForDay for that interval', () => {
  const state = newGame(1);
  const host = fakeSheetHost();
  openPricingSheet(host, { state, onChange: () => {} });

  const sliders = host.body.findAll((n) => n.tagName === 'input');
  const intervalSlider = sliders[1]; // fee first, interval second
  intervalSlider.value = '20';
  intervalSlider.fireInput();

  const expected = maxGroupsForDay(20);
  const line = host.body.findAll((n) => n.textContent.includes('groups a day'))[0];
  assert.ok(line.textContent.includes(String(expected)), `expected ${expected} groups in "${line.textContent}"`);
});

test('moving the green fee slider updates state.resort.pricing.greenFee exactly', () => {
  const state = newGame(1);
  let changed = null;
  const host = fakeSheetHost();
  openPricingSheet(host, { state, onChange: (next) => (changed = next) });

  const sliders = host.body.findAll((n) => n.tagName === 'input');
  const feeSlider = sliders[0];
  feeSlider.value = '77';
  feeSlider.fireInput();

  assert.equal(changed.resort.pricing.greenFee, 77);
  assert.equal(state.resort.pricing.greenFee, 22, 'the original state must not be mutated');
});

// --- Tee interval consequence line: whether the course will back up -------
//
// paceConsequence is the pure threshold logic behind it: queueing begins
// the moment the interval drops below the slowest open hole's playing time
// (schedule.js's flow-shop rule). It takes plain numbers, not a state
// object, so the threshold itself is tested head-on, separate from the DOM.

test('no backup when the interval comfortably exceeds every hole', () => {
  const result = paceConsequence(20, [10, 12, 9]);
  assert.equal(result.backup, false);
});

test('a backup is reported once the interval drops below the slowest hole', () => {
  const result = paceConsequence(10, [10, 12, 9]);
  assert.equal(result.backup, true);
  assert.equal(result.slowestIndex, 1); // the 12-minute hole
  assert.equal(result.slowestMinutes, 12);
});

test('the threshold is exclusive: an interval exactly equal to the slowest hole does not back up', () => {
  const result = paceConsequence(12, [10, 12, 9]);
  assert.equal(result.backup, false);
});

test('one minute under the slowest hole is enough to back up', () => {
  const result = paceConsequence(11, [10, 12, 9]);
  assert.equal(result.backup, true);
  assert.equal(result.slowestIndex, 1);
});

test('the slowest hole is named by its position among the open holes, not its id', () => {
  // Position 3 (0-based) is the slowest, regardless of what a hole's own id is.
  const result = paceConsequence(5, [8, 9, 7, 15, 6]);
  assert.equal(result.slowestIndex, 3);
  assert.equal(result.slowestMinutes, 15);
});

test('no open holes means no backup and no named hole', () => {
  const result = paceConsequence(6, []);
  assert.equal(result.backup, false);
  assert.equal(result.slowestIndex, null);
});

test('the pricing sheet says plainly whether the course will back up, naming the slowest hole', () => {
  // The starting resort's three holes are all short par 3s/4s that play in
  // well under 16 minutes, so a very short interval should trip a backup,
  // and a long one should not.
  const state = newGame(1);
  const host = fakeSheetHost();
  openPricingSheet(host, { state, onChange: () => {} });

  const sliders = host.body.findAll((n) => n.tagName === 'input');
  const intervalSlider = sliders[1];

  intervalSlider.value = '6'; // the slider's own minimum — certain to jam
  intervalSlider.fireInput();
  const jammed = host.body.findAll((n) => n.textContent.includes('back up'))[0];
  assert.ok(jammed, 'expected a "back up" line at the shortest possible interval');

  intervalSlider.value = '30'; // the slider's own maximum — should be clear
  intervalSlider.fireInput();
  // Matched rather than compared exactly: the line now also names how
  // long the slowest hole takes, so that a marshal moving it by a minute
  // is visible. The verdict is still the part being asserted here.
  const clear = host.body.findAll((n) => n.textContent.includes('No backup expected.'))[0];
  assert.ok(clear, 'expected a "No backup expected." verdict at the longest possible interval');
});

test('the green fee ceiling follows what a round is worth', () => {
  // A flat $120 cap meant a course worth $130 a round could not be charged
  // at its own value: the slider, not the market, was setting the ceiling.
  assert.ok(greenFeeCeiling(130) > 130, 'must be able to charge above value');
  assert.ok(greenFeeCeiling(200) > greenFeeCeiling(130), 'a better course buys more room');
});

test('a struggling course still has room to price above its worth', () => {
  // Early on a round may be worth very little; the ceiling must not collapse
  // to something below a sensible fee.
  assert.ok(greenFeeCeiling(12) >= 60);
});

// --- Tee sheet capacity: the one moment more perceived value stops helping -

/** A fully built, well-appointed, cheaply-priced resort — demand this
 * strong, at the longest tee interval, fills every slot the tee sheet
 * has (verified directly against economy.demandGroups: `total` comes back
 * equal to `maxGroupsForDay(30)`). This is the fixture for asserting the
 * pricing sheet actually says so. */
function primedForCapacity() {
  const state = newGame(1);
  const holes = state.resort.courses[0].holes;
  for (let i = 0; i < holes.length; i++) {
    if (!holes[i].open) {
      const templateName = TEMPLATE_NAMES[i % TEMPLATE_NAMES.length];
      holes[i] = { ...makeHole(templateName, holes[i].id), open: true };
    }
  }
  state.prestige = 95;
  state.turfQuality = 95;
  // A resort at prestige 95 with every amenity built has happy guests.
  // Leaving this empty meant the fixture implied satisfaction 50 — the
  // no-history default — which is a resort nobody enjoys, and word of
  // mouth is now steep enough that the contradiction decides the result.
  state.satisfactionHistory = Array(7).fill(85);
  state.resort.amenities = Object.keys(AMENITIES).map((type) => ({ type }));
  state.resort.pricing.greenFee = 10;
  state.resort.pricing.teeInterval = 30;
  return state;
}

test('the pricing sheet says plainly when the tee sheet is full', () => {
  const state = primedForCapacity();
  const host = fakeSheetHost();
  openPricingSheet(host, { state, onChange: () => {} });

  const full = host.body.findAll((n) => n.textContent.includes('full'));
  assert.ok(full.length > 0, 'expected a "full" tee-sheet line under strong demand at a long interval');
});

test('the "full" line is absent for a course with room to spare', () => {
  const state = newGame(1); // day-one Pinehollow: three modest holes, no crowd to speak of
  const host = fakeSheetHost();
  openPricingSheet(host, { state, onChange: () => {} });

  const full = host.body.findAll((n) => n.textContent.includes('full'));
  assert.equal(full.length, 0, 'a day-one course should not claim to be at capacity');
});

test('the "full" line updates live when the green fee slider moves, not just the interval slider', () => {
  const state = primedForCapacity();
  // An eighteen-hole course at prestige 95 with every amenity is worth a
  // great deal more than the nine this fixture used to build, so the fee
  // that suppresses demand below capacity had to rise with it.
  state.resort.pricing.greenFee = 320;
  const host = fakeSheetHost();
  openPricingSheet(host, { state, onChange: () => {} });
  assert.equal(host.body.findAll((n) => n.textContent.includes('full')).length, 0, 'high fee should keep demand under capacity');

  const sliders = host.body.findAll((n) => n.tagName === 'input');
  const feeSlider = sliders[0];
  feeSlider.value = '10';
  feeSlider.fireInput();

  const full = host.body.findAll((n) => n.textContent.includes('full'));
  assert.ok(full.length > 0, 'dropping the fee alone should be enough to fill the tee sheet');
});

// --- The pace line has to move when the pace does ----------------------

/**
 * Reported from play: "the marshal lowers pace but doesn't change logic
 * on the screen where you pick your timing."
 *
 * The marshal factor WAS being applied to the forecast. The problem was
 * what the screen did with it: `paceConsequence` returns `backup` as
 * `interval < slowestMinutes`, a boolean, and on the opening course the
 * slowest hole runs 18.2 minutes against a tee interval in single
 * figures. So `backup` was true at nought marshals and true at three,
 * the sentence was word-for-word identical, and the 2.2 minutes the
 * marshals actually took off the hole appeared nowhere.
 *
 * A correct number that never reaches the screen is indistinguishable
 * from a broken one. The figure is now named.
 */
function pricingText(state) {
  const host = fakeSheetHost();
  openPricingSheet(host, { state, onChange: () => {} });
  return host.body.textContent;
}

test('the pricing sheet names how long the slowest hole takes', () => {
  const text = pricingText(newGame(1));
  assert.match(text, /\d+\.\d min/,
    'the forecast has to show a figure, not just whether it bites');
});

test('hiring marshals visibly changes the pace forecast', () => {
  const bare = newGame(1);
  const staffed = newGame(1);
  staffed.resort.staff.push({ role: 'marshal' }, { role: 'marshal' });

  const before = pricingText(bare);
  const after = pricingText(staffed);
  assert.notEqual(before, after,
    'two marshals change the day and must change the screen that forecasts it');
  assert.match(after, /marshals are already holding that down/,
    'and the sheet should say what they are doing for it');
});

test('paceConsequence reports the minutes, not only the verdict', () => {
  const result = paceConsequence(8, [7.5, 12.25, 9]);
  assert.equal(result.slowestMinutes, 12.25,
    'the figure has to survive to the caller or no screen can show it');
  assert.equal(result.slowestIndex, 1);
  assert.equal(result.backup, true);
});
