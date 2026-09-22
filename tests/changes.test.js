import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/fakeDom.js';

const { CHANGES, BUILD, unseenChanges, openChangeLog } = await import('../src/ui/changes.js');
const { FakeNode } = await import('./helpers/fakeDom.js');
const { mountStartScreen } = await import('../src/ui/start.js');

/**
 * The "since you last played" note.
 *
 * It rendered `CHANGES[0]` and nothing else, under a heading reading
 * "Since you last played". It stored which version had been seen and then
 * never used it — so a player who skipped a release never saw those notes
 * at all, and the heading described a span the data did not support.
 *
 * Reported by the player as: "it's just the updates from the most recent
 * push right, it's not tailored to the last time someone actually played
 * — so if they missed one update they miss the pop up right?" Yes.
 */

test('a player who has seen nothing gets every entry', () => {
  assert.deepEqual(unseenChanges(null), CHANGES,
    'a new player, or one whose browser storage was cleared, should see the lot');
});

test('a player who is current gets nothing', () => {
  assert.deepEqual(unseenChanges(CHANGES[0].version), [],
    'somebody who has read the newest note must not be shown it again');
});

test('a player who missed a release gets everything since, not just the newest', () => {
  // The bug, stated directly, against a list long enough to state it.
  // The shipped CHANGES has two entries, and with two entries
  // "everything since" and "only the newest" are the same answer — so a
  // test written against the real list passes whether this is fixed or
  // not. That is the trap in spec §15c and it caught this file once
  // already.
  const list = [
    { version: 'd', notes: ['newest'] },
    { version: 'c', notes: ['third'] },
    { version: 'b', notes: ['second'] },
    { version: 'a', notes: ['oldest'] },
  ];

  const missedThree = unseenChanges('a', list);
  assert.equal(missedThree.length, 3,
    'somebody back on the oldest release must be shown all three since');
  assert.deepEqual(missedThree.map((e) => e.version), ['d', 'c', 'b']);

  assert.deepEqual(unseenChanges('c', list).map((e) => e.version), ['d'],
    'and somebody one release behind sees exactly one');
});

test('the shipped list behaves the same way', () => {
  assert.ok(CHANGES.length >= 2,
    'this needs at least two releases to say anything; do not trim CHANGES to one');
  assert.deepEqual(unseenChanges(CHANGES[CHANGES.length - 1].version), CHANGES.slice(0, -1),
    'somebody on the oldest shipped release must be shown every release since');
});

test('an unrecognised stored version shows too much rather than too little', () => {
  // A cleared entry, an old format, a hand-edit. Repeating a note the
  // player has read is a mild annoyance; silently dropping one is the
  // failure this file exists to prevent.
  assert.deepEqual(unseenChanges('2019-01-01-nonsense'), CHANGES);
});

test('every entry is readable from the start screen, seen or not', () => {
  // The pop-up is a one-shot. This is the way back to it.
  let rendered = null;
  openChangeLog({ open(def) { rendered = new FakeNode('div'); def.render(rendered); } });

  assert.ok(rendered, 'the log has to open as a sheet');
  const text = rendered.textContent;
  for (const entry of CHANGES) {
    assert.ok(text.includes(entry.version), `${entry.version} is missing from the log`);
    for (const note of entry.notes) {
      assert.ok(text.includes(note),
        `a note from ${entry.version} is missing from the log`);
    }
  }
});

test('the log marks which release you are actually on', () => {
  let rendered = null;
  openChangeLog({ open(def) { rendered = new FakeNode('div'); def.render(rendered); } });
  assert.ok(rendered.textContent.includes(`${CHANGES[0].version} — current`),
    'the newest entry should say it is the one being played');
  assert.equal(CHANGES[0].version, BUILD,
    'and the newest entry must match the build, or the log is describing someone else’s game');
});

// --- The way back to the notes ----------------------------------------

test('the start screen carries a card that opens the log', () => {
  // The pop-up is a one-shot and the log is only useful if there is a
  // door to it. A test, because the door is easy to add and easy to lose
  // in a later edit of a long render function.
  const root = new FakeNode('div');
  let opened = null;
  mountStartScreen(root, {
    save: null,
    saveCode: null,
    sheets: { open(def) { opened = new FakeNode('div'); def.render(opened); } },
    onContinue() {}, onNewGame() {}, onLoadCode() {},
  });

  const btn = root.findAll((n) => n.tagName === 'button')
    .find((b) => /change/i.test(b.textContent));
  assert.ok(btn, 'the start screen must offer a way to read the changes');

  btn.click();
  assert.ok(opened, 'and it must actually open the log');
  assert.ok(opened.textContent.includes(CHANGES[0].notes[0]),
    'which has to contain the notes');
});
