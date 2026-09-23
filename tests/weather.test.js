import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, deserialize, serialize } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { weatherOn, forecast, CONDITIONS, CONDITION_KEYS, effectsOf } from '../src/sim/weather.js';

test('every condition is fully specified', () => {
  for (const key of CONDITION_KEYS) {
    const c = CONDITIONS[key];
    assert.ok(c.label && c.short && c.note, `${key} is missing copy`);
    for (const field of ['demand', 'pace', 'spread']) {
      assert.ok(c[field] > 0, `${key}.${field} must be a positive multiplier`);
    }
    assert.equal(typeof c.turf, 'number', `${key}.turf must be a number`);
  }
});

test('THE FORECAST IS THE WEATHER, not a prediction of it', () => {
  // The whole architecture. A forecast that can disagree with the day is
  // this project's signature bug — the renderer against lieAt, prices in
  // the UI against the sim, a pace forecast that ignored marshals. Here it
  // is made impossible rather than tested for, and this is the test that
  // the impossibility holds.
  const seed = 4242;
  const ahead = forecast(seed, 10, 5);
  for (const entry of ahead) {
    assert.equal(entry.key, weatherOn(seed, entry.day),
      `the forecast for day ${entry.day} disagrees with the day itself`);
  }
});

test('a forecast made on any day agrees with one made on any other', () => {
  const seed = 99;
  const early = forecast(seed, 20, 3).map((e) => e.key);
  const late = forecast(seed, 20, 3).map((e) => e.key);
  assert.deepEqual(early, late);
  // And a forecast that overlaps another must agree on the shared days.
  const from18 = forecast(seed, 18, 5);
  const from20 = forecast(seed, 20, 3);
  for (const entry of from20) {
    const shared = from18.find((e) => e.day === entry.day);
    if (shared) assert.equal(shared.key, entry.key, `day ${entry.day} forecast twice, differently`);
  }
});

test('the same resort always gets the same weather on the same day', () => {
  assert.equal(weatherOn(7, 30), weatherOn(7, 30));
  // And different resorts get different climates.
  const a = Array.from({ length: 40 }, (_, d) => weatherOn(1, d + 1)).join('');
  const b = Array.from({ length: 40 }, (_, d) => weatherOn(2, d + 1)).join('');
  assert.notEqual(a, b, 'two resorts should not share a calendar');
});

test('most days are playable golf', () => {
  // Bad weather has to read as an event, not as the climate.
  const days = Array.from({ length: 400 }, (_, d) => weatherOn(3, d + 1));
  const good = days.filter((k) => effectsOf(k).demand >= 0.94).length;
  assert.ok(good / days.length > 0.6, `only ${(good / days.length * 100).toFixed(0)}% of days are decent golf`);
  const awful = days.filter((k) => k === 'storm').length;
  assert.ok(awful / days.length < 0.06, 'storms should be rare');
  assert.ok(awful > 0, 'but they should happen');
});

test('a day reports what the sky did and what is coming', () => {
  const { report } = runDay(newGame(11), 5);
  assert.ok(report.weather, 'the report should say what the weather was');
  assert.ok(CONDITIONS[report.weather.key], `unknown condition ${report.weather.key}`);
  assert.equal(report.weather.forecast.length, 3);
  for (const entry of report.weather.forecast) {
    assert.ok(CONDITIONS[entry.key]);
  }
});

test('tomorrow in the forecast is what actually happens tomorrow', () => {
  // End to end, through the real day loop rather than the module alone.
  let state = newGame(12);
  const first = runDay(state, 1);
  const promised = first.report.weather.forecast[0];
  state = first.state;
  const second = runDay(state, 2);
  assert.equal(second.report.weather.key, promised.key,
    'the game promised one sky and delivered another');
});

test('rain keeps golfers away and clear skies bring them out', () => {
  // The variance source. Without it every seed plays out near-identically
  // and bankruptcy sits at exactly 0% forever, which it has done in every
  // balance run this project has ever produced.
  assert.ok(effectsOf('storm').demand < effectsOf('rain').demand);
  assert.ok(effectsOf('rain').demand < effectsOf('fair').demand);
  assert.ok(effectsOf('fair').demand < effectsOf('clear').demand);
});

test('rain waters the course and sunshine bakes it', () => {
  assert.ok(effectsOf('rain').turf > 0, 'rain should help the turf');
  assert.ok(effectsOf('clear').turf < 0, 'a dry day should cost turf');
});

test('wind scatters shots and slows the round', () => {
  assert.ok(effectsOf('blowy').spread > effectsOf('fair').spread);
  assert.ok(effectsOf('blowy').pace > effectsOf('fair').pace);
});

test('a save made before weather existed gets a climate', () => {
  const before = JSON.parse(serialize(newGame(3)));
  delete before.weatherSeed;
  const loaded = deserialize(JSON.stringify(before));
  assert.equal(typeof loaded.weatherSeed, 'number');
  const { report } = runDay(loaded, 9);
  assert.ok(CONDITIONS[report.weather.key]);
});

test('weather actually moves the day', () => {
  // Two resorts identical but for their sky.
  function play(weatherSeed) {
    let state = newGame(21);
    state.weatherSeed = weatherSeed;
    const daily = [];
    for (let d = 0; d < 30; d++) {
      const r = runDay(state, 500 + d);
      state = r.state;
      daily.push(r.report.groupsPlayed);
    }
    return daily;
  }
  const a = play(1);
  const b = play(2);
  // Compared day by day rather than as two season totals. The totals
  // version of this test failed once with both seasons summing to 394
  // while the days underneath were 12,16,17,17,18... against
  // 10,16,16,17,18... -- completely different weather, one number, a
  // coincidence indistinguishable from a broken variance source.
  assert.notDeepEqual(a, b, 'two different climates should produce different seasons');
  const differingDays = a.filter((v, i) => v !== b[i]).length;
  assert.ok(differingDays >= 5,
    `only ${differingDays} of 30 days differed between two climates`);
});
