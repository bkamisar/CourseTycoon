import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/fakeDom.js';
import { newGame, amenity } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { startingInvestors } from '../src/sim/investors.js';
import { makeRng } from '../src/sim/rng.js';

const { mountReport } = await import('../src/ui/report.js');
const { FakeNode } = await import('./helpers/fakeDom.js');

/**
 * The day recap's money breakdown.
 *
 * It used to name three revenue lines and three cost lines by hand while
 * the simulation reported six and five. Rooms, the indoor range and the
 * food stock bill were computed, folded into the totals, and never shown
 * — so the first Act II playthrough had a recap withholding $1,176 of
 * room revenue and $1,387 of cost, with rows that did not add up to the
 * total printed beneath them. The player's report was "it doesn't say how
 * much money you've made from the hotel, so it's unclear if you're making
 * any money from the rooms", which is exactly right: the nightly rate is
 * the one decision Act II asks for daily and it had no feedback attached.
 *
 * The invariant below is the fix, not the two missing rows: **what is on
 * screen has to add up to the total on screen.** That holds for any line
 * the simulation grows later.
 */

/** Every label/value pair in the breakdown, in screen order. */
function pairs(state, report) {
  const root = new FakeNode('div');
  mountReport(root, { state, report, onContinue() {} });
  const cells = root.findAll((n) => typeof n.className === 'string'
    && (n.className.startsWith('report-breakdown-row')
      || n.className.startsWith('report-breakdown-value')));
  const out = [];
  for (let i = 0; i < cells.length; i += 2) {
    const raw = cells[i + 1].textContent;
    out.push({
      label: cells[i].textContent,
      value: Number(raw.replace(/[^0-9.]/g, '')) * (raw.trim().startsWith('-') ? -1 : 1),
      isTotal: cells[i].className.includes('report-breakdown-total'),
    });
  }
  return out;
}

function act2Day() {
  let state = newGame(21);
  state.act = 2;
  state.money = 400000;
  state.resort.rooms = { standard: 12, suite: 5 };
  state.resort.pricing.roomRate = 120;
  state.resort.amenities.push(
    amenity('proShop'), amenity('snackShack'), amenity('indoorRange'),
  );
  state.investors = startingInvestors(state, makeRng(21));
  return runDay(state, 2100);
}

test('the revenue rows on screen add up to the revenue total on screen', () => {
  const { state, report } = act2Day();
  const rows = pairs(state, report);
  const totalIdx = rows.findIndex((r) => r.isTotal);
  const parts = rows.slice(0, totalIdx);
  const sum = parts.reduce((a, r) => a + r.value, 0);

  assert.ok(parts.length > 0, 'there should be revenue lines at all');
  assert.equal(Math.round(sum), Math.round(rows[totalIdx].value),
    `revenue rows (${parts.map((p) => p.label).join(', ')}) do not add up to the total`);
});

test('the cost rows on screen add up to the cost total on screen', () => {
  const { state, report } = act2Day();
  const rows = pairs(state, report);
  const first = rows.findIndex((r) => r.isTotal);
  const second = rows.findIndex((r, i) => i > first && r.isTotal);
  const parts = rows.slice(first + 1, second);
  const sum = parts.reduce((a, r) => a + r.value, 0);

  assert.ok(parts.length > 0, 'there should be cost lines at all');
  assert.equal(Math.round(sum), Math.round(rows[second].value),
    `cost rows (${parts.map((p) => p.label).join(', ')}) do not add up to the total`);
});

test('a resort with a hotel says what the hotel earned and what it cost', () => {
  // The player's actual complaint. Both halves have to be there: room
  // revenue alone would still leave them unable to tell whether the
  // nightly rate covers the upkeep.
  const { state, report } = act2Day();
  const labels = pairs(state, report).map((r) => r.label);
  assert.ok(labels.includes('Rooms'), 'the recap must say what the rooms earned');
  assert.ok(labels.includes('Hotel upkeep'), 'and what they cost to run');
  assert.ok(report.revenue.rooms > 0, 'sanity: this resort actually let rooms');
});

test('an Act I recap stays as short as it was', () => {
  // The lines only appear once they are worth something, so a nine-hole
  // course with no hotel does not grow a row of zeroes.
  const { state, report } = runDay(newGame(3), 300);
  const labels = pairs(state, report).map((r) => r.label);
  assert.ok(!labels.includes('Rooms'), 'a resort with no hotel should not list rooms');
  assert.ok(!labels.includes('Indoor range'), 'nor a range it has not built');
  assert.ok(labels.includes('Green fees') && labels.includes('Payroll'),
    'but the core lines always show, even at zero');
});

test('a line the simulation adds later still reaches the screen', () => {
  // The structural half of the fix. An unlabelled key renders under a
  // humanized version of its own name rather than vanishing, so the rows
  // keep adding up even when this file has not been told about it yet.
  const { state, report } = act2Day();
  report.revenue.weddingHire = 600;
  report.revenue.total += 600;
  const rows = pairs(state, report);
  const labels = rows.map((r) => r.label);
  assert.ok(labels.includes('Wedding hire'),
    `an unknown revenue key must still show; got ${labels.join(', ')}`);
  const totalIdx = rows.findIndex((r) => r.isTotal);
  assert.equal(
    Math.round(rows.slice(0, totalIdx).reduce((a, r) => a + r.value, 0)),
    Math.round(rows[totalIdx].value),
    'and the rows must still add up',
  );
});

// --- Which act's goals the recap shows ---------------------------------

/** The section titles on a rendered recap, in order. */
function sectionTitles(state, report) {
  const root = new FakeNode('div');
  mountReport(root, { state, report, onContinue() {} });
  return root.findAll((n) => n.className === 'report-section-title')
    .map((n) => n.textContent);
}

test('Act I shows what it takes to reach Act II', () => {
  const { state, report } = runDay(newGame(4), 400);
  assert.ok(sectionTitles(state, report).some((t) => /Act II/.test(t)),
    'an Act I recap has to say what it is working toward');
});

test('Act II does not still show Act I goals', () => {
  // The four gate conditions are finished business once the investors
  // arrive; the standing investor target higher up the screen is what the
  // player is now playing to. Showing both was the second thing the first
  // Act II playthrough complained about.
  const { state, report } = act2Day();
  assert.equal(report.investorsArrived ?? false, false,
    'sanity: this is a later Act II day, not the day they arrived');
  const titles = sectionTitles(state, report);
  assert.ok(!titles.some((t) => /Working Toward Act II|Act I/.test(t)),
    `an Act II recap still lists Act I's goals: ${titles.join(' / ')}`);
});

test('the day Act I is completed still says so', () => {
  // runDay flips `act` to 2 in the same tick the investors arrive, so
  // testing the act alone would hide the completion screen on the one day
  // it is worth showing.
  const { state, report } = act2Day();
  report.investorsArrived = true;
  report.gate.passed = true;
  const titles = sectionTitles(state, report);
  assert.ok(titles.some((t) => /Complete/.test(t)),
    `the day the gate is passed must be celebrated; got ${titles.join(' / ')}`);
});
