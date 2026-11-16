import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterPercent } from '../src/ui/playHole.js';
import { METER } from '../src/play/swingMeter.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('the meter maps the whole cursor range onto the bar, miss zone to overswing', () => {
  near(meterPercent(METER.LATE_LIMIT), 0);
  near(meterPercent(METER.MAX), 100);
  near(meterPercent(0), (0.1 / 1.2) * 100);
  near(meterPercent(1), (1.1 / 1.2) * 100);
  assert.equal(meterPercent(5), 100);
  assert.equal(meterPercent(-5), 0);
});
