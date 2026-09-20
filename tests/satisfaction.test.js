import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestSatisfaction, buildComplaints, ordinal } from '../src/sim/satisfaction.js';

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
