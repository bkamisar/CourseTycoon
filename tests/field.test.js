import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { playField, FIELD_SIZE, FIELD_GROUPS, drawFieldHandicaps } from '../src/sim/field.js';
import { TARGET_MINUTES_PER_HOLE } from '../src/sim/schedule.js';

function course(count = 18) {
  return Array.from({ length: count }, (_, i) =>
    ({ ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true }));
}

test('a field plays the course and reports how it played', () => {
  const round = playField(makeRng(1), course(), { setup: 60, turfQuality: 80 });
  assert.equal(round.players, FIELD_SIZE);
  assert.ok(Number.isFinite(round.averageToPar), 'the headline number must be a number');
  assert.ok(round.best <= round.averageToPar, 'somebody has to be better than average');
  assert.ok(round.worst >= round.averageToPar);
  assert.equal(round.hardestHole >= 1 && round.hardestHole <= 18, true,
    'the hardest hole must be one of the holes');
  assert.ok(round.underPar >= 0 && round.underPar <= FIELD_SIZE);
});

test('a harder setup produces higher scores', () => {
  // The read-out for the whole act. If the field shoots the same however
  // the course is set, the setup dial is decoration and the player has no
  // way to find the band.
  const soft = playField(makeRng(2), course(), { setup: 20, turfQuality: 85 });
  const hard = playField(makeRng(2), course(), { setup: 95, turfQuality: 85 });
  assert.ok(hard.averageToPar > soft.averageToPar + 1,
    `setup 95 (${hard.averageToPar.toFixed(1)}) barely beat setup 20 (${soft.averageToPar.toFixed(1)})`);
  assert.ok(hard.underPar <= soft.underPar, 'fewer should break par on a harder course');
});

test('a championship field is better than a Tuesday fourball', () => {
  // They are not the resort's usual guests. A field of 14-handicappers
  // would make every setup look brutal and the band unfindable.
  const round = playField(makeRng(3), course(), { setup: 55, turfQuality: 85 });
  assert.ok(round.averageToPar < 12,
    `the field averaged ${round.averageToPar.toFixed(1)} over par, which is not a championship field`);
});

test('the same seed plays the same championship', () => {
  const a = playField(makeRng(9), course(), { setup: 70, turfQuality: 75 });
  const b = playField(makeRng(9), course(), { setup: 70, turfQuality: 75 });
  assert.deepEqual(a, b, 'a replayed game must play out identically');
});

test('pace can actually fail', () => {
  // The whole point of pointing the flow-shop scheduler at the field. A
  // wide tee interval gives the group ahead time to clear each hole; a
  // tight one on a hard setup does not, and the field backs up behind
  // whichever hole is slowest — the same congestion rule that paces the
  // resort's own tee sheet.
  const target = course().length * TARGET_MINUTES_PER_HOLE;
  for (const seed of [1, 2, 3, 4, 5]) {
    const wide = playField(makeRng(seed), course(), {
      setup: 30, turfQuality: 85, teeInterval: 16,
    });
    assert.ok(wide.averageRoundMinutes <= target,
      `seed ${seed}: a wide interval still backed the field up (${wide.averageRoundMinutes.toFixed(1)} > ${target})`);

    const tight = playField(makeRng(seed), course(), {
      setup: 90, turfQuality: 85, teeInterval: 8,
    });
    assert.ok(tight.averageRoundMinutes > target,
      `seed ${seed}: a tight interval on a hard setup never backed the field up (${tight.averageRoundMinutes.toFixed(1)} <= ${target})`);
  }
});

test('a slower bottleneck hole is reported, or none when nothing queues', () => {
  const clean = playField(makeRng(4), course(), { setup: 10, turfQuality: 90, teeInterval: 20 });
  assert.equal(clean.bottleneckHole, null, 'nothing should be queueing at a wide-open interval');

  const jammed = playField(makeRng(4), course(), { setup: 90, turfQuality: 85, teeInterval: 8 });
  assert.ok(jammed.bottleneckHole >= 1 && jammed.bottleneckHole <= 18);
  assert.ok(jammed.slowestRoundMinutes >= jammed.averageRoundMinutes,
    'nobody finishes faster than the field average');
});

test('pins move the field, by a stroke or two and not by a setup\'s worth', () => {
  // One seed pair is luck: over 200 seed pairs brutal minus easy averaged
  // 1.92 strokes a round with a spread of 0.56, and 5% of single pairs fell
  // under 1. Averaging four seeds keeps the bounds honest.
  const handicaps = drawFieldHandicaps(makeRng(40));
  let easy = 0;
  let brutal = 0;
  for (const seed of [1, 2, 3, 4]) {
    const play = (pins) => playField(makeRng(seed), course(), { setup: 70, turfQuality: 85, pins, handicaps });
    easy += play('easy').averageToPar / 4;
    brutal += play('brutal').averageToPar / 4;
  }
  assert.ok(brutal > easy + 1, `brutal ${brutal} against easy ${easy}`);
  assert.ok(brutal < easy + 4, 'pins fine-tune; they are not a second setup dial');
});

test('wind reaches the field', () => {
  // Weather was always computed on a championship day and the field
  // ignored it. Blowing hard is spread 1.45, clear is 0.95 (weather.js).
  const handicaps = drawFieldHandicaps(makeRng(42));
  let calm = 0;
  let windy = 0;
  for (const seed of [1, 2, 3, 4]) {
    calm += playField(makeRng(seed), course(), { setup: 60, handicaps, spread: 0.95 }).averageToPar;
    windy += playField(makeRng(seed), course(), { setup: 60, handicaps, spread: 1.45 }).averageToPar;
  }
  // Measured over 200 sets of four seeds the gap is 16.98 with a spread of
  // 1.08 -- about four strokes a round. 8 asks for two, which is far from
  // both the noise and zero.
  assert.ok(windy > calm + 8, `windy ${windy / 4} against calm ${calm / 4}`);
});

test('wet weather slows the field', () => {
  // With tee times far enough apart that nothing queues, a round is just
  // the sum of its holes and pace scales it exactly.
  const a = playField(makeRng(43), course(), { setup: 60, pace: 1, teeInterval: 30 });
  const b = playField(makeRng(43), course(), { setup: 60, pace: 1.16, teeInterval: 30 });
  assert.ok(Math.abs(b.averageRoundMinutes / a.averageRoundMinutes - 1.16) < 0.01,
    `heavy rain (pace 1.16) made rounds ${b.averageRoundMinutes / a.averageRoundMinutes} times as long`);
});

test('a field passed in is the field that plays', () => {
  const scratch = new Array(FIELD_SIZE).fill(0);
  const hackers = new Array(FIELD_SIZE).fill(6);
  const good = playField(makeRng(44), course(), { setup: 50, handicaps: scratch });
  const poor = playField(makeRng(44), course(), { setup: 50, handicaps: hackers });
  assert.ok(good.averageToPar < poor.averageToPar);
});

test('every player\'s score is returned in field order', () => {
  const round = playField(makeRng(45), course(), { setup: 55 });
  assert.equal(round.playerToPar.length, FIELD_SIZE);
  assert.equal(Math.min(...round.playerToPar), round.best);
  const mean = round.playerToPar.reduce((s, v) => s + v, 0) / FIELD_SIZE;
  assert.equal(Number(mean.toFixed(2)), round.averageToPar);
});

test('the field\'s shots are kept for the playback', () => {
  const holes = course();
  const round = playField(makeRng(46), holes, { setup: 55 });
  assert.equal(round.playback.schedule.rounds.length, FIELD_GROUPS, 'twenty threeballs tee off');
  assert.equal(round.playback.rawEvents.length, FIELD_GROUPS * holes.length);
  assert.equal(round.playback.holeMinutes.length, holes.length);
  assert.ok(round.playback.rawEvents.some((b) => b.events.some((e) => e.type === 'shot')));
});

test('handicaps are matched to players by position', () => {
  const handicaps = [...new Array(30).fill(0), ...new Array(30).fill(6)];
  const round = playField(makeRng(48), course(), { setup: 50, handicaps });
  const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  assert.ok(mean(round.playerToPar.slice(0, 30)) < mean(round.playerToPar.slice(30)),
    'the scratch half of the field must score better than the six-handicap half');
});

test('a field of the wrong size is refused', () => {
  assert.throws(() => playField(makeRng(49), course(), { handicaps: [0, 1, 2] }), /60 handicaps/);
});

test('drawing a field gives sixty championship handicaps', () => {
  const field = drawFieldHandicaps(makeRng(47));
  assert.equal(field.length, FIELD_SIZE);
  assert.ok(field.every((h) => Number.isInteger(h) && h >= 0 && h <= 6));
});
