import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/render/palette.js';
import { FOOD_SPRITES, FOOD_CHARS, SPRITE_SIZE } from '../src/render/food.js';
import { ITEM_IDS } from '../src/sim/menu.js';

test('every item on the menu has art', () => {
  // A catalogue entry with no sprite is a blank square on the board. This
  // exact failure shipped here once: SPRITES.tee was defined and never
  // registered, every test passed, and the render loop died on page load.
  for (const id of ITEM_IDS) {
    assert.ok(FOOD_SPRITES[id], `no sprite for ${id}`);
  }
});

test('no art exists for an item that is not on the menu', () => {
  // The other direction. Art for a deleted item is dead weight that looks
  // alive, and it hides the fact that something was removed.
  for (const id of Object.keys(FOOD_SPRITES)) {
    assert.ok(ITEM_IDS.includes(id), `${id} has art but is not in the catalogue`);
  }
});

test('every sprite is a well-formed square grid', () => {
  for (const [id, grid] of Object.entries(FOOD_SPRITES)) {
    assert.equal(grid.length, SPRITE_SIZE, `${id}: wrong height`);
    for (const [i, row] of grid.entries()) {
      assert.equal(row.length, SPRITE_SIZE, `${id}: row ${i} is ${row.length} wide, not ${SPRITE_SIZE}`);
    }
  }
});

test('every pixel names a colour the palette actually has', () => {
  for (const [id, grid] of Object.entries(FOOD_SPRITES)) {
    for (const row of grid) {
      for (const ch of row) {
        if (ch === '.') continue;
        const key = FOOD_CHARS[ch];
        assert.ok(key, `${id}: unknown sprite character "${ch}"`);
        assert.ok(PALETTE[key], `${id}: "${ch}" maps to ${key}, which is not in the palette`);
      }
    }
  }
});

test('no sprite is blank', () => {
  for (const [id, grid] of Object.entries(FOOD_SPRITES)) {
    const painted = grid.join('').split('').filter((c) => c !== '.').length;
    assert.ok(painted > 20, `${id}: only ${painted} painted pixels — that will read as an empty square`);
  }
});

test('every character the map defines is actually used by something', () => {
  // An unused entry in FOOD_CHARS is a colour someone meant to draw with
  // and did not, which usually means a sprite is duller than intended.
  const used = new Set();
  for (const grid of Object.values(FOOD_SPRITES)) {
    for (const row of grid) for (const ch of row) if (ch !== '.') used.add(ch);
  }
  for (const ch of Object.keys(FOOD_CHARS)) {
    assert.ok(used.has(ch), `FOOD_CHARS defines "${ch}" (${FOOD_CHARS[ch]}) but no sprite uses it`);
  }
});

test('no two sprites are identical', () => {
  // Two items the player cannot tell apart are worse than one item: the
  // board's whole job is to be scannable at a glance. This catches only
  // exact duplicates — near-misses are what the look-at-it checkpoint is
  // for, and the lobster roll was redrawn because of one.
  const seen = new Map();
  for (const [id, grid] of Object.entries(FOOD_SPRITES)) {
    const key = grid.join('|');
    assert.ok(!seen.has(key), `${id} is pixel-identical to ${seen.get(key)}`);
    seen.set(key, id);
  }
});
