import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestSatisfaction, buildComplaints, ordinal } from '../src/sim/satisfaction.js';
import { SEGMENTS } from '../src/sim/segments.js';

const baseline = {
  handicap: 15,
  strokesOverPar: 15,
  waitMinutes: 0,
  greenFee: 45,
  perceivedValue: 60,
  scenery: 55,
  turfQuality: 70,
  amenityBonus: 6,
};

test('satisfaction stays within 0 and 100', () => {
  const awful = guestSatisfaction({
    ...baseline, waitMinutes: 300, strokesOverPar: 60, greenFee: 500,
    perceivedValue: 5, scenery: 0, turfQuality: 0, amenityBonus: 0,
  });
  const ideal = guestSatisfaction({
    ...baseline, waitMinutes: 0, strokesOverPar: -4, greenFee: 10,
    perceivedValue: 200, scenery: 100, turfQuality: 100, amenityBonus: 30,
  });
  assert.ok(awful >= 0 && awful <= 100);
  assert.ok(ideal >= 0 && ideal <= 100);
});

test('waiting hurts', () => {
  const quick = guestSatisfaction({ ...baseline, waitMinutes: 0 });
  const slow = guestSatisfaction({ ...baseline, waitMinutes: 45 });
  assert.ok(slow < quick - 10, `quick ${quick} slow ${slow}`);
});

test('playing better than your handicap helps', () => {
  const poor = guestSatisfaction({ ...baseline, strokesOverPar: 26 });
  const good = guestSatisfaction({ ...baseline, strokesOverPar: 4 });
  assert.ok(good > poor);
});

test('overpaying hurts, underpaying helps', () => {
  const gouged = guestSatisfaction({ ...baseline, greenFee: 140, perceivedValue: 60 });
  const bargain = guestSatisfaction({ ...baseline, greenFee: 30, perceivedValue: 60 });
  assert.ok(bargain > gouged);
});

test('scenery and turf both matter', () => {
  const bleak = guestSatisfaction({ ...baseline, scenery: 10, turfQuality: 20 });
  const lovely = guestSatisfaction({ ...baseline, scenery: 95, turfQuality: 95 });
  assert.ok(lovely > bleak);
});

test('the same hard, pristine, expensive round satisfies serious golfers and not locals', () => {
  const round = {
    ...baseline,
    strokesOverPar: 15,
    greenFee: 110,
    perceivedValue: 90,
    turfQuality: 96,
    scenery: 55,
    courseDifficulty: 72, // the serious golfers' ideal, per segments.js
  };
  const local = guestSatisfaction({ ...round, segment: 'locals' });
  const serious = guestSatisfaction({ ...round, segment: 'serious' });
  assert.ok(serious > local + 15, `local ${local} serious ${serious}`);
});

test('waiting hurts locals more than destination guests', () => {
  const quick = { ...baseline, waitMinutes: 0 };
  const slow = { ...baseline, waitMinutes: 45 };
  const localDrop =
    guestSatisfaction({ ...quick, segment: 'locals' }) - guestSatisfaction({ ...slow, segment: 'locals' });
  const destinationDrop =
    guestSatisfaction({ ...quick, segment: 'destination' }) - guestSatisfaction({ ...slow, segment: 'destination' });
  assert.ok(localDrop > destinationDrop, `local drop ${localDrop} destination drop ${destinationDrop}`);
});

test('turf matters far more to serious golfers than to locals', () => {
  const shaggy = { ...baseline, turfQuality: 20 };
  const pristine = { ...baseline, turfQuality: 95 };
  const localGain =
    guestSatisfaction({ ...pristine, segment: 'locals' }) - guestSatisfaction({ ...shaggy, segment: 'locals' });
  const seriousGain =
    guestSatisfaction({ ...pristine, segment: 'serious' }) - guestSatisfaction({ ...shaggy, segment: 'serious' });
  assert.ok(seriousGain > localGain * 2, `local gain ${localGain} serious gain ${seriousGain}`);
});

test('difficulty satisfaction peaks at each segment\'s own ideal', () => {
  for (const key of Object.keys(SEGMENTS)) {
    const atIdeal = guestSatisfaction({ ...baseline, segment: key, courseDifficulty: SEGMENTS[key].idealDifficulty });
    const farFromIdeal = guestSatisfaction({ ...baseline, segment: key, courseDifficulty: SEGMENTS[key].idealDifficulty + 90 });
    assert.ok(atIdeal > farFromIdeal, `${key}: at ideal ${atIdeal}, far ${farFromIdeal}`);
  }
});

test('omitting courseDifficulty behaves exactly like the pre-segments call', () => {
  const withDifficulty = guestSatisfaction({ ...baseline, segment: 'locals' });
  const withoutSegmentOrDifficulty = guestSatisfaction({ ...baseline });
  assert.equal(withDifficulty, withoutSegmentOrDifficulty);
});

test('a slow hole produces a complaint naming that hole', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: [0, 0, 0, 260, 0, 0, 0, 0, 0],
    groupsPlayed: 20,
    turfQuality: 80,
    amenityTypes: ['clubhouse', 'restrooms'],
    averageSatisfaction: 60,
    nearActGate: false,
  });
  assert.ok(complaints.some((c) => c.includes('4th')), complaints.join(' | '));
});

test('poor turf produces a maintenance complaint', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(9).fill(0),
    groupsPlayed: 20,
    turfQuality: 25,
    amenityTypes: ['clubhouse', 'restrooms'],
    averageSatisfaction: 60,
    nearActGate: false,
  });
  assert.ok(complaints.some((c) => /bunker|turf|greens/i.test(c)), complaints.join(' | '));
});

test('missing restrooms produce a complaint', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(9).fill(0),
    groupsPlayed: 20,
    turfQuality: 85,
    amenityTypes: ['clubhouse'],
    averageSatisfaction: 60,
    nearActGate: false,
  });
  assert.ok(complaints.some((c) => /restroom/i.test(c)), complaints.join(' | '));
});

test('a well run day produces few or no complaints', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(9).fill(0),
    groupsPlayed: 20,
    turfQuality: 92,
    amenityTypes: ['clubhouse', 'restrooms', 'snackShack', 'proShop'],
    averageSatisfaction: 85,
    nearActGate: false,
  });
  assert.ok(complaints.length <= 1, complaints.join(' | '));
});

test('nearing the act gate foreshadows lodging', () => {
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(9).fill(0),
    groupsPlayed: 20,
    turfQuality: 90,
    amenityTypes: ['clubhouse', 'restrooms'],
    averageSatisfaction: 80,
    nearActGate: true,
  });
  assert.ok(complaints.some((c) => /sleep|stay|motel|room/i.test(c)), complaints.join(' | '));
});

test('hole ordinals read correctly past the front nine', () => {
  // A hard-coded table of nine produced "The undefined takes forever."
  assert.equal(ordinal(1), '1st');
  assert.equal(ordinal(2), '2nd');
  assert.equal(ordinal(3), '3rd');
  assert.equal(ordinal(9), '9th');
  assert.equal(ordinal(11), '11th');
  assert.equal(ordinal(12), '12th');
  assert.equal(ordinal(13), '13th');
  assert.equal(ordinal(18), '18th');
  assert.equal(ordinal(21), '21st');
});

test('a slow hole on the back nine is named, not undefined', () => {
  const waits = new Array(18).fill(0);
  waits[13] = 400; // the 14th
  const complaints = buildComplaints({
    waitTotalsByHole: waits,
    groupsPlayed: 20,
    turfQuality: 85,
    amenityTypes: ['clubhouse', 'restrooms', 'snackShack'],
    averageSatisfaction: 70,
    nearActGate: false,
  });
  assert.ok(complaints.some((c) => c.includes('14th')), complaints.join(' | '));
  assert.ok(!complaints.some((c) => c.includes('undefined')), complaints.join(' | '));
});

test('a short course is never told about a hole it does not have', () => {
  // The restroom complaint used to hard-code "past the 6th", which on the
  // three-hole starting resort described a hole that does not exist.
  const complaints = buildComplaints({
    waitTotalsByHole: new Array(3).fill(0),
    groupsPlayed: 12,
    turfQuality: 85,
    amenityTypes: ['clubhouse'],
    averageSatisfaction: 65,
    nearActGate: false,
  });
  const joined = complaints.join(' | ');
  assert.ok(/restroom/i.test(joined), joined);
  for (const n of [4, 5, 6, 7, 8, 9]) {
    assert.ok(!joined.includes(ordinal(n)), `named a nonexistent hole: ${joined}`);
  }
});
