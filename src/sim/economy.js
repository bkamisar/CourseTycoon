import { maxGroupsForDay } from './schedule.js';
import { clamp } from './hole.js';
import { crowdMix, SEGMENT_KEYS } from './segments.js';
import { MENU_SLOTS, menuPull, menuBasket, menuCogs } from './menu.js';

/** Daily wage by role. */
export const WAGES = {
  groundskeeper: 240,
  marshal: 180,
  shopStaff: 170,
  kitchenStaff: 180,
};

/**
 * Daily upkeep by amenity, what it costs to build, and what it contributes.
 *
 * Repriced once the effects audit could measure scarcity rather than guess
 * at it. Every amenity together cost $68,800 to build and $955 a day to
 * run, against a fully built resort earning $5,222 a day — it bought
 * itself back in thirteen days, which is to say the player owned
 * everything before the first act was half over and then had nothing left
 * to spend money on. The Act I gate asks for $50,000; ten days of profit
 * cleared it.
 *
 * Costs roughly doubled, upkeep more than doubled. Upkeep matters more
 * than the build price here: a one-off cost is a delay, where a daily one
 * is a standing decision about whether a thing is still earning its keep.
 */
/** Daily upkeep by amenity, and what each contributes. */
export const AMENITIES = {
  clubhouse:    { upkeep: 400, build: 0,     satisfaction: 2 },
  proShop:      { upkeep: 130,  build: 11000,  satisfaction: 3, spendPerGuest: 14 },
  snackShack:   { upkeep: 110,  build: 7000,  satisfaction: 3, spendPerGuest: 9 },
  halfwayHouse: { upkeep: 105,  build: 8000,  satisfaction: 5, spendPerGuest: 11 },
  restaurant:   { upkeep: 300, build: 22000, satisfaction: 6, spendPerGuest: 26 },
  restrooms:    { upkeep: 70,  build: 4000,  satisfaction: 4 },
  drivingRange: { upkeep: 125,  build: 10000,  satisfaction: 4 },
  practiceGreen:{ upkeep: 95,  build: 6000,  satisfaction: 3 },
  /**
   * The most transformative thing on this list and priced accordingly.
   *
   * A fleet of carts takes about 32 minutes off a round and moves
   * satisfaction nearly ten points - nothing else comes close. At $9,000
   * and $110 a day it paid for itself in four days against a median of
   * fourteen, which made it less a decision than a checkbox: there was no
   * point in a course that had not bought one immediately.
   *
   * It is now a capital item. You have to be doing well to afford it, and
   * it still transforms the course when you do.
   */
  cartBarn:     { upkeep: 520, build: 34000, satisfaction: 3 },
  // Reaches golfers without stopping them, which is what separates her
  // from the halfway house — see round.js's cartStop and spec §7. Cheaper
  // to build than the halfway house because she carries less, and cheaper
  // to run because she needs no building.
  beverageCart: { upkeep: 180,  build: 9000,  satisfaction: 3 },
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

/** How many dollars of perceived value one point of an amenity's
 * `satisfaction` is worth — see `amenityPerceivedValue` below, which is
 * what the Amenities sheet reads to tell the player what a given amenity
 * is actually worth, in the same dollars `perceivedValue` spends it in. */
const AMENITY_VALUE_PER_SATISFACTION = 1.6;

/** What one amenity of `type` adds to `perceivedValue` — the same dollar
 * figure that both raises the green fee a round can bear AND (via
 * `demandGroups`' `valueRatio`) draws more golfers. Exported so UI copy
 * (the Amenities sheet) can quote the real number instead of re-deriving
 * it, which is exactly how a shown price and the simulation's own price
 * drift apart the first time this formula is retuned. */
export function amenityPerceivedValue(type) {
  return (AMENITIES[type]?.satisfaction ?? 0) * AMENITY_VALUE_PER_SATISFACTION;
}

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
  const amenityValue = amenities.reduce((s, a) => s + amenityPerceivedValue(a.type), 0);
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
 * Splits a whole number of `total` units across `weights` (a plain object
 * of non-negative numbers) in proportion to each weight's share, using
 * largest-remainder rounding so the parts always sum to exactly `total`
 * and none of them can go negative — a naive "round each share, dump the
 * remainder on the last key" approach can drive that last key negative
 * when the earlier ones round up.
 */
function allocateByWeight(total, weights) {
  const keys = Object.keys(weights);
  const result = {};
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  if (total <= 0 || sum <= 0) {
    for (const k of keys) result[k] = 0;
    return result;
  }
  const parts = keys.map((k) => {
    const exact = (total * weights[k]) / sum;
    return { key: k, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let allocated = parts.reduce((s, p) => s + p.floor, 0);
  for (const p of parts) result[p.key] = p.floor;
  parts.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; allocated < total; i++, allocated++) {
    result[parts[i % parts.length].key] += 1;
  }
  return result;
}

/**
 * How many groups turn up, and who they are.
 *
 * Total demand is the sum of each segment's own demand: every segment's
 * appeal for this exact course (see segments.js) drives its own slice of
 * the crowd, rather than one blended "appetite" number standing in for
 * three audiences who want different things. The tee sheet then caps the
 * total, so a wildly popular course still cannot sell more rounds than
 * daylight allows. Word of mouth and reputation are properties of the
 * whole resort, not of any one segment, so they scale the crowd uniformly
 * once appeal has decided its composition.
 */
export function demandGroups({
  courseRating, prestige, amenities, greenFee, teeInterval,
  recentSatisfaction = 50, holesOpen = FULL_COURSE_HOLES,
  courseDifficulty = 50, scenery = 50, turfQuality = 50, amenityScore,
  hasRooms = false,
}) {
  const value = perceivedValue({ courseRating, prestige, amenities, holesOpen });
  // 1.0 when priced at value; segmentAppeal's own priceFit is what makes
  // this hurt each segment differently above that point.
  const valueRatio = greenFee / Math.max(1, value);
  const resolvedAmenityScore = amenityScore ?? clamp(amenities.length / 6, 0, 1);

  const { appeal, share } = crowdMix({
    courseDifficulty, scenery, turfQuality, amenityScore: resolvedAmenityScore,
    valueRatio, hasRooms,
  });

  const reputationPull = 0.35 + (prestige / 100) * 0.9;

  /**
   * Word of mouth. A resort people leave unhappy empties out, and this is
   * the only route by which a bad course reaches the player's wallet.
   *
   * The exponent was 1.5, and at that slope Act I had one right answer.
   * Measured on a fully built nine over ninety days, the best green fee
   * was $40 with guests at 31% satisfaction — a packed, miserable resort
   * — and the strategy got *better* over time rather than decaying,
   * because food revenue scales with bodies through the gate and prestige
   * only fell thirteen points for the misery. Cheap-and-jammed beat
   * expensive-and-pleasant at every horizon tested.
   *
   * At 2.5 the optimum moves to $80 with guests at 57, and $60, $80 and
   * $100 all land within 18% of each other: a price range to judge rather
   * than a number to find. 3.5 overcorrects and collapses the low end.
   *
   * The passive-operator floor barely notices — money $81,526 to $79,059,
   * satisfaction and turf marginally up — because a passive operator was
   * never running the miserable strategy in the first place.
   */
  const wordOfMouth = clamp((recentSatisfaction / 55) ** 2.5, 0.05, 1.25);
  const pull = reputationPull * wordOfMouth;

  const capacity = maxGroupsForDay(teeInterval);

  const rawBySegment = {};
  let rawTotal = 0;
  for (const key of SEGMENT_KEYS) {
    const raw = capacity * appeal[key] * pull;
    rawBySegment[key] = raw;
    rawTotal += raw;
  }

  const total = clamp(Math.round(rawTotal), 0, capacity);
  const bySegment = allocateByWeight(total, rawBySegment);

  return { total, bySegment, share };
}

export function dailyRevenue({
  groupsPlayed, greenFee, amenities, averageSatisfaction, shopService = 1,
}) {
  const golfers = groupsPlayed * 4;
  const greenFees = golfers * greenFee;

  // Satisfied guests open their wallets; unhappy ones leave straight away.
  const spendMultiplier = 0.4 + (averageSatisfaction / 100) * 1.2;

  // Food no longer comes from a flat spendPerGuest here — menuRevenue (see
  // above) replaces it, reading the actual board rather than the amenity's
  // mere presence. Left at 0 rather than removed from the shape, so every
  // caller that reads revenue.food still gets a number.
  let merchandise = 0;
  const food = 0;
  for (const a of amenities) {
    const spec = AMENITIES[a.type];
    if (a.type !== 'proShop' || !spec?.spendPerGuest) continue;
    // Merchandise is sold by a person. With nobody behind the counter the
    // queue turns money away — see shop.js, and the kitchen's identical
    // treatment of food.
    merchandise += golfers * spec.spendPerGuest * spendMultiplier * shopService;
  }

  return {
    greenFees: Math.round(greenFees),
    merchandise: Math.round(merchandise),
    food,
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
/**
 * How much custom each food amenity generates per guest.
 *
 * Calibrated so a well-matched menu earns roughly what the flat
 * `spendPerGuest` it replaces already earned. That neutrality matters
 * more than any individual value: the whole economy - build costs, wages,
 * the Act I gate - was balanced against the old flat numbers, so if menus
 * were a revenue increase every cost in the game would be retroactively
 * too cheap. Menus add a way to be wrong, not a way to earn more.
 */
export const MENU_RATE = Object.freeze({
  snackShack: 1.3,
  halfwayHouse: 1.3,
  restaurant: 1.25,
  beverageCart: 1.3,
});

/**
 * What the resort's food and drink takes, and what it cost to serve.
 *
 * `crowd` is golfers per segment, not groups. Each segment is charged its
 * own pull and its own basket, because the whole point is that the same
 * board is worth different amounts to different people.
 */
export function menuRevenue({ amenities, crowd, serviceFactor = 1 }) {
  let revenue = 0;
  let foodCost = 0;
  for (const amenity of amenities) {
    const rate = MENU_RATE[amenity.type];
    if (!rate || !MENU_SLOTS[amenity.type]) continue;
    for (const key of SEGMENT_KEYS) {
      const heads = crowd?.[key] ?? 0;
      if (heads <= 0) continue;
      const pull = menuPull(amenity.menu, key);
      if (pull <= 0) continue;
      revenue += heads * pull * menuBasket(amenity.menu, key) * rate * serviceFactor;
      foodCost += heads * pull * menuCogs(amenity.menu, key) * rate * serviceFactor;
    }
  }
  return { revenue: Math.round(revenue), foodCost: Math.round(foodCost) };
}

/**
 * What you get back for demolishing an amenity, as a fraction of what it
 * cost to build.
 *
 * Deliberately not the full refund the hole editor gives. That one is full
 * because rebuilding a hole has to cost the same as stripping it and
 * rebuilding, or the two routes disagree — a constraint amenities do not
 * have. Here a partial refund is doing real work: a full one would make
 * "build everything, sell whatever turns out not to help" a risk-free
 * strategy, and the whole point of the second-order measurements is that
 * what helps depends on what else you own.
 *
 * Two thirds is enough that discovering a mistake is not ruinous — and
 * mistakes are easy to make here, since the halfway house is a loss of
 * $1,437 a day once a snack shack and a cart are already feeding people,
 * and nothing warns you until it has happened.
 */
export const DEMOLITION_REFUND = 0.65;

/** What removing `type` puts back in the bank. */
export function demolitionRefund(type) {
  return Math.round((AMENITIES[type]?.build ?? 0) * DEMOLITION_REFUND);
}

export const BUILD_COSTS = Object.freeze({
  hole: 12000,
  bunker: 800,
  pond: 2500,
  trees: 300,
  greenUpgrade: 1500,
});
