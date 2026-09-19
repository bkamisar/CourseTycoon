import { maxGroupsForDay } from './schedule.js';
import { clamp } from './hole.js';

/** Daily wage by role. */
export const WAGES = {
  groundskeeper: 120,
  marshal: 100,
  shopStaff: 90,
  kitchenStaff: 95,
};

/** Daily upkeep by amenity, and what each contributes. */
export const AMENITIES = {
  clubhouse:    { upkeep: 60,  build: 0,     satisfaction: 2 },
  proShop:      { upkeep: 70,  build: 6000,  satisfaction: 3, spendPerGuest: 14 },
  snackShack:   { upkeep: 55,  build: 3500,  satisfaction: 3, spendPerGuest: 9 },
  halfwayHouse: { upkeep: 65,  build: 4500,  satisfaction: 5, spendPerGuest: 11 },
  restaurant:   { upkeep: 140, build: 12000, satisfaction: 6, spendPerGuest: 26 },
  restrooms:    { upkeep: 30,  build: 1800,  satisfaction: 4 },
  drivingRange: { upkeep: 80,  build: 7000,  satisfaction: 4 },
  practiceGreen:{ upkeep: 45,  build: 3000,  satisfaction: 3 },
  cartBarn:     { upkeep: 110, build: 9000,  satisfaction: 3 },
};

/** What a round here is worth to a golfer, in dollars. */
export function perceivedValue({ courseRating, prestige, amenities }) {
  const amenityValue = amenities.reduce(
    (s, a) => s + (AMENITIES[a.type]?.satisfaction ?? 0) * 1.6,
    0
  );
  return 18 + courseRating * 0.62 + prestige * 0.45 + amenityValue;
}

/**
 * How many groups turn up. Appetite is driven by price against perceived
 * value; the tee sheet then caps it, so a wildly popular course still
 * cannot sell more rounds than daylight allows.
 */
export function demandGroups({
  courseRating, prestige, amenities, greenFee, teeInterval,
}) {
  const value = perceivedValue({ courseRating, prestige, amenities });
  // 1.0 when priced at value; falls away above it, gains slowly below it.
  const ratio = greenFee / Math.max(1, value);
  const appetite = ratio <= 1
    ? 1 + (1 - ratio) * 0.35
    : Math.max(0, 1 - (ratio - 1) * 1.15);

  const reputationPull = 0.35 + (prestige / 100) * 0.9;
  const capacity = maxGroupsForDay(teeInterval);

  return clamp(Math.round(capacity * appetite * reputationPull), 0, capacity);
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
