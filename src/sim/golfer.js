import { clamp } from './hole.js';

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
 * Prestige pulls the handicap distribution down (better players) and the
 * green fee pulls wallets up. Both are gentle: a resort never draws only
 * one kind of golfer.
 */
export function makeGuest(rng, { prestige, greenFee }) {
  const handicapMean = 20 - (prestige / 100) * 9;
  const handicap = clamp(Math.round(rng.normal(handicapMean, 7)), 0, 36);
  const wallet = Math.round(clamp(rng.normal(greenFee * 1.45 + 25, greenFee * 0.4), 15, 900));

  return {
    id: nextId++,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    handicap,
    wallet,
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
