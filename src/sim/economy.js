import { maxGroupsForDay } from './schedule.js';
import { clamp } from './hole.js';

/** Daily wage by role. */
export const WAGES = {
  groundskeeper: 240,
  marshal: 180,
  shopStaff: 170,
  kitchenStaff: 180,
};

/** Daily upkeep by amenity, and what each contributes. */
export const AMENITIES = {
  clubhouse:    { upkeep: 400, build: 0,     satisfaction: 2 },
  proShop:      { upkeep: 70,  build: 6000,  satisfaction: 3, spendPerGuest: 14 },
  snackShack:   { upkeep: 55,  build: 3500,  satisfaction: 3, spendPerGuest: 9 },
  halfwayHouse: { upkeep: 65,  build: 4500,  satisfaction: 5, spendPerGuest: 11 },
  restaurant:   { upkeep: 140, build: 12000, satisfaction: 6, spendPerGuest: 26 },
  restrooms:    { upkeep: 30,  build: 1800,  satisfaction: 4 },
  drivingRange: { upkeep: 80,  build: 7000,  satisfaction: 4 },
  practiceGreen:{ upkeep: 45,  build: 3000,  satisfaction: 3 },
  cartBarn:     { upkeep: 110, build: 9000,  satisfaction: 3 },
};

/**
 * A full round is eighteen holes. Fewer, and you are selling less golf.
 *
 * This was nine, which quietly capped the whole game's economy: an
 * eighteen hole round was worth no more than a nine, so the back nine in
 * Act III earned nothing and there was no runway left for Act IV. The arc
 * from the end of Act I to a finished eighteen was 46% of value growth,
 * where it should be closer to threefold.
 *
 * Act I's nine is therefore half a golf course, priced accordingly, and
 * completing the eighteen is what doubles what a round is worth.
 */
const FULL_COURSE_HOLES = 18;

/**
 * What a round here is worth to a golfer, in dollars.
 *
 * Scaled by how much golf is actually on offer. Without this a three-hole
 * resort is worth exactly as much as a finished nine and draws the same
 * crowd at the same price, which is nonsense and forces every cost in the
 * game to be inflated to compensate. Three holes are worth about a third
 * of nine, so a full green fee is a rip-off until the course is built -
 * which is what gives the player a reason to build it.
 */
export function perceivedValue({
  courseRating, prestige, amenities, holesOpen = FULL_COURSE_HOLES,
}) {
  const amenityValue = amenities.reduce(
    (s, a) => s + (AMENITIES[a.type]?.satisfaction ?? 0) * 1.6,
    0
  );
  // Sublinear, not proportional: a nine is worth rather more than half an
  // eighteen, because some of what a golfer pays for - the place, the
  // clubhouse, the round itself being a round - does not halve with the
  // hole count. A straight ratio made the opening three holes worth so
  // little that nobody turned up at any sane green fee.
  const completeness = clamp(
    Math.pow(holesOpen / FULL_COURSE_HOLES, 0.7), 0.15, 1
  );
  return (18 + courseRating * 0.62 + prestige * 0.45 + amenityValue) * completeness;
}

/**
 * How many groups turn up. Appetite is driven by price against perceived
 * value; the tee sheet then caps it, so a wildly popular course still
 * cannot sell more rounds than daylight allows.
 */
export function demandGroups({
  courseRating, prestige, amenities, greenFee, teeInterval,
  recentSatisfaction = 50, holesOpen = FULL_COURSE_HOLES,
}) {
  const value = perceivedValue({ courseRating, prestige, amenities, holesOpen });
  // 1.0 when priced at value; falls away above it, gains slowly below it.
  const ratio = greenFee / Math.max(1, value);
  const appetite = ratio <= 1
    ? 1 + (1 - ratio) * 0.35
    : Math.max(0, 1 - (ratio - 1) * 1.8);

  const reputationPull = 0.35 + (prestige / 100) * 0.9;

  // Word of mouth. A resort people leave unhappy empties out, and this is
  // the only route by which a bad course reaches the player's wallet.
  const wordOfMouth = clamp((recentSatisfaction / 55) ** 1.5, 0.05, 1.25);

  const capacity = maxGroupsForDay(teeInterval);

  return clamp(Math.round(capacity * appetite * reputationPull * wordOfMouth), 0, capacity);
}

export function dailyRevenue({ groupsPlayed, greenFee, amenities, averageSatisfaction }) {
  const golfers = groupsPlayed * 4;
  const greenFees = golfers * greenFee;

  // Satisfied guests open their wallets; unhappy ones leave straight away.
  const spendMultiplier = 0.4 + (averageSatisfaction / 100) * 1.2;

  let merchandise = 0;
  let food = 0;
  for (const a of amenities) {
    const spec = AMENITIES[a.type];
    if (!spec?.spendPerGuest) continue;
    const spend = golfers * spec.spendPerGuest * spendMultiplier;
    if (a.type === 'proShop') merchandise += spend;
    else food += spend;
  }

  return {
    greenFees: Math.round(greenFees),
    merchandise: Math.round(merchandise),
    food: Math.round(food),
    total: Math.round(greenFees + merchandise + food),
  };
}

export function dailyCosts({ holeUpkeep, staff, amenities }) {
  const payroll = staff.reduce((s, m) => s + (WAGES[m.role] ?? 0), 0);
  const amenityUpkeep = amenities.reduce(
    (s, a) => s + (AMENITIES[a.type]?.upkeep ?? 0),
    0
  );
  return {
    holeUpkeep: Math.round(holeUpkeep),
    payroll,
    amenityUpkeep,
    total: Math.round(holeUpkeep + payroll + amenityUpkeep),
  };
}

/**
 * One-off construction costs, per §8.3 of the spec.
 *
 * These belong here beside the amenity build costs rather than in the UI.
 * A price written down in a screen drifts from the simulation the first
 * time anything is retuned, and the player is then quoted one number and
 * charged another.
 */
export const BUILD_COSTS = Object.freeze({
  hole: 12000,
  bunker: 800,
  pond: 2500,
  trees: 300,
  greenUpgrade: 1500,
});
