import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { AMENITIES, WAGES } from '../src/sim/economy.js';
import { maxGroupsForDay } from '../src/sim/schedule.js';

/**
 * A minimal fake DOM, just enough of `document.createElement` for panels.js
 * to run headless. panels.js never reads layout, style computation or CSS
 * matching — only element creation, property/attribute assignment, text
 * content, append/replaceChildren, and click/input events — so this stub
 * covers it without pulling in a real DOM dependency.
 */
class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this._listeners = {};
    this._text = '';
  }
  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  append(...items) {
    for (const item of items) {
      this.appendChild(typeof item === 'string' ? fakeDocument.createTextNode(item) : item);
    }
  }
  replaceChildren(...items) {
    this.children = [];
    this.append(...items);
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i !== -1) this.parentNode.children.splice(i, 1);
  }
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }
  dispatch(type, evt = {}) {
    for (const fn of this._listeners[type] ?? []) fn(evt);
  }
  click() {
    this.dispatch('click', {});
  }
  fireInput() {
    this.dispatch('input', {});
  }
  get textContent() {
    if (this.tagName === '#text') return this._text;
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this.children = [];
    this._text = v;
  }
  // Buttons/inputs found by walking the tree, since these tests don't have
  // a real querySelector.
  findAll(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.findAll(pred, out);
    return out;
  }
}

const fakeDocument = {
  createElement: (tag) => new FakeNode(tag),
  createTextNode: (text) => {
    const n = new FakeNode('#text');
    n._text = text;
    return n;
  },
  head: new FakeNode('head'),
};

globalThis.document = fakeDocument;

const { openBuildSheet, openStaffSheet, openPricingSheet } = await import('../src/ui/panels.js');

function fakeSheetHost() {
  let body = null;
  return {
    open(def) {
      body = new FakeNode('div');
      def.render(body);
    },
    dismiss() {},
    get body() {
      return body;
    },
  };
}

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
