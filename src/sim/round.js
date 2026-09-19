import { LIE, lieAt } from './terrain.js';
import { holeStats, greenCentre, GREEN_DIFFICULTY, clamp } from './hole.js';
import { resolveShot, puttsToHole, distanceRemaining } from './shot.js';
import { makeGroup, resetGuestIds } from './golfer.js';
import { makeRng } from './rng.js';

/** Time costs in minutes. */
const PRE_SHOT = 0.55;       // per stroke, per golfer
const PER_PUTT = 0.5;
const SAND_PENALTY = 0.5;
const WATER_PENALTY = 1.0;
const TREES_PENALTY = 1.5;   // looking for it
const WALK_YARDS_PER_MIN = 75;
const CART_WALK_FACTOR = 0.55;
const TIRED_PENALTY = 0.12;  // extra minutes per stroke at zero energy

const MAX_STROKES = 12;      // pick up and move on

/**
 * Plays one group through one hole. Mutates each guest's energy — they get
 * tireder as the round goes on — and returns scores, elapsed minutes and
 * the events a renderer will replay.
 */
export function playHole(rng, hole, group, { carts }) {
  const stats = holeStats(hole);
  const greenDifficulty = GREEN_DIFFICULTY[hole.greenPreset];
  const scores = [];
  const events = [];
  let penaltyMinutes = 0;
  let totalStrokes = 0;

  for (const guest of group.guests) {
    let position = { ...hole.teePos };
    let lie = LIE.TEE;
    let strokes = 0;

    while (strokes < MAX_STROKES) {
      if (lie === LIE.GREEN) break;

      const shot = resolveShot(rng, hole, position, lie, guest.handicap);
      strokes++;
      events.push({
        type: 'shot',
        holeId: hole.id,
        guestId: guest.id,
        from: shot.from,
        to: shot.to,
        lie: shot.lie,
      });

      if (shot.lie === LIE.WATER) {
        strokes++; // penalty stroke
        penaltyMinutes += WATER_PENALTY;
        events.push({ type: 'water', holeId: hole.id, guestId: guest.id, at: shot.to });
        // Drop back on the corridor, short of the hazard.
        position = dropPoint(hole, shot.from);
        lie = lieAt(hole, position);
        continue;
      }

      if (shot.lie === LIE.SAND) penaltyMinutes += SAND_PENALTY;
      if (shot.lie === LIE.TREES) penaltyMinutes += TREES_PENALTY;
      if (shot.lie === LIE.SAND) {
        events.push({ type: 'sand', holeId: hole.id, guestId: guest.id, at: shot.to });
      }

      position = shot.to;
      lie = shot.lie;
    }

    // Hole out.
    const feetToPin = distanceRemaining(hole, position) * 3;
    const putts = lie === LIE.GREEN
      ? puttsToHole(rng, feetToPin, guest.handicap, greenDifficulty)
      : 2;
    strokes += putts;
    strokes = Math.min(strokes, MAX_STROKES + 2);

    events.push({ type: 'holed', holeId: hole.id, guestId: guest.id, strokes, putts });
    scores.push({ guestId: guest.id, strokes, putts, par: stats.par });
    totalStrokes += strokes;

    // Energy drains with distance walked and strokes taken.
    const drain = (stats.length / 500) * (carts ? 4 : 9) + strokes * 0.4;
    guest.energy = clamp(guest.energy - drain, 0, 100);
  }

  const walkFactor = carts ? CART_WALK_FACTOR : 1;
  const walkMinutes = (stats.length / WALK_YARDS_PER_MIN) * walkFactor;
  const puttMinutes = scores.reduce((s, x) => s + x.putts, 0) * PER_PUTT;
  const averageEnergy =
    group.guests.reduce((s, g) => s + g.energy, 0) / group.guests.length;
  const tiredMinutes = totalStrokes * TIRED_PENALTY * (1 - averageEnergy / 100);

  const minutes =
    walkMinutes + totalStrokes * PRE_SHOT + puttMinutes + penaltyMinutes + tiredMinutes;

  return { scores, minutes, events, totalStrokes };
}

/** Where a ball is dropped after finding water: back toward the previous lie. */
function dropPoint(hole, from) {
  const centre = greenCentre(hole);
  const dx = centre.x - from.x;
  const dy = centre.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Advance 60% of the way to the green, then it is wherever it is.
  return { x: from.x + (dx / dist) * dist * 0.6, y: from.y + (dy / dist) * dist * 0.6 };
}

/**
 * The average minutes a representative group takes on this hole.
 * This is the "Expected minutes" figure the editor shows live, and it is
 * measured by simulation rather than by formula because it depends on how
 * the hole actually plays.
 */
export function expectedMinutes(hole, { carts }, samples = 12) {
  let total = 0;
  for (let i = 0; i < samples; i++) {
    resetGuestIds();
    const rng = makeRng(1000 + i);
    const group = makeGroup(rng, { prestige: 50, greenFee: 45 }, 0);
    total += playHole(rng, hole, group, { carts }).minutes;
  }
  return total / samples;
}
