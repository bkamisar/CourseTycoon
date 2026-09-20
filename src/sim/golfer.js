import { clamp } from './hole.js';
import { SEGMENTS, SEGMENT_KEYS } from './segments.js';

const FIRST = ['Dana', 'Marcus', 'Priya', 'Tom', 'Elise', 'Gus', 'Nora', 'Wes',
  'Iris', 'Cal', 'Ruth', 'Otto', 'Jean', 'Hal', 'Mara', 'Vic'];
const LAST = ['Boyle', 'Nakamura', 'Okafor', 'Reyes', 'Lindqvist', 'Ashby',
  'Duval', 'Moreno', 'Kelleher', 'Sandoval', 'Pike', 'Vance'];

let nextId = 1;
/** Test hook — keeps guest ids deterministic across runs. */
export function resetGuestIds() {
  nextId = 1;
}

/**
 * How far each segment's handicap mean sits from the baseline, in
 * strokes. Serious golfers travelled a long way to be tested, so they are
 * markedly better than the locals baseline; destination guests, often
 * affluent club members away from home, sit a little ahead of it too.
 */
const HANDICAP_OFFSET = {
  locals: 0,
  serious: -9,
  destination: -3,
};

/** Every caller who never passes `share` — and every existing test —
 * should keep drawing exactly the locals-only crowd they always have. */
const DEFAULT_SHARE = { locals: 1 };

/**
 * Picks a segment key by a weighted draw from `share`.
 *
 * A single-segment share (the default, and any all-locals call) resolves
 * without touching the rng at all. Drawing anyway would silently shift the
 * random sequence downstream of every guest — reordering the handicaps and
 * shot rolls that follow it — for callers who supplied no share and expect
 * none of this to change; that once flipped an unrelated seeded test on the
 * far side of the day simulation.
 */
function pickSegment(rng, share) {
  const keys = SEGMENT_KEYS.filter((k) => (share[k] ?? 0) > 0);
  if (keys.length === 0) return 'locals';
  if (keys.length === 1) return keys[0];
  const total = keys.reduce((s, k) => s + share[k], 0);
  let roll = rng.next() * total;
  for (const k of keys) {
    roll -= share[k];
    if (roll <= 0) return k;
  }
  return keys[keys.length - 1];
}

/**
 * Prestige pulls the handicap distribution down (better players) and the
 * green fee pulls wallets up. Both are gentle: a resort never draws only
 * one kind of golfer.
 *
 * `share` is each segment's proportion of the crowd (see
 * `segments.crowdMix`); it decides which segment this particular guest
 * belongs to, which then biases their handicap and scales their wallet.
 */
export function makeGuest(rng, { prestige, greenFee, share = DEFAULT_SHARE }) {
  const segment = pickSegment(rng, share);
  const seg = SEGMENTS[segment];

  const handicapMean = 20 - (prestige / 100) * 9 + HANDICAP_OFFSET[segment];
  const handicap = clamp(Math.round(rng.normal(handicapMean, 7)), 0, 36);
  const wallet = Math.round(
    clamp(rng.normal(greenFee * 1.45 + 25, greenFee * 0.4), 15, 900) * seg.spendMultiplier
  );

  return {
    id: nextId++,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    handicap,
    wallet,
    segment,
    patience: 100,
    energy: 100,
    satisfaction: 50,
    stayNights: 1,        // Act II varies this
    nightsRemaining: 1,
    zonePreference: 'near', // Act III uses this
  };
}

export function makeGroup(rng, conditions, id) {
  return {
    id,
    guests: [0, 1, 2, 3].map(() => makeGuest(rng, conditions)),
  };
}
