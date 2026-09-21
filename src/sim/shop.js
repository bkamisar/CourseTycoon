/**
 * Whether there is anybody behind the counter.
 *
 * The exact shape of `kitchen.js`, for the same reason: `shopStaff` had
 * existed in `economy.js` as a $170/day wage that **nothing in the game
 * read**. Hiring one cost money and changed no number anywhere, which is
 * worse than an amenity being weak — it is a purchase that silently does
 * not exist. `tools/effects.js` found it on its first run.
 *
 * The pro shop is where merchandise is sold, and merchandise is sold by a
 * person. A shop with nobody in it can still take a few sales off the
 * clubhouse desk, and then the queue gets long and people walk out with
 * their money still in their pocket.
 *
 * This is deliberately the same mechanic as the kitchen rather than a new
 * one. The game now says a consistent thing about staff: an amenity is a
 * building, and a building without people in it only half works.
 */
import { clamp } from './hole.js';

/** Golfers a day the clubhouse desk can serve with no shop staff at all.
 * Small on purpose — enough that an empty course still sells a few balls,
 * not enough to run a busy Saturday on. */
export const BASE_SHOP_CAPACITY = 20;

/** Golfers a day each shop hire can serve. */
export const PER_SHOP_STAFF = 50;

/** Even a hopeless queue sells something to the patient. */
export const SHOP_SERVICE_FLOOR = 0.3;

export function shopCapacity(staff = []) {
  const counter = staff.filter((m) => m.role === 'shopStaff').length;
  return BASE_SHOP_CAPACITY + counter * PER_SHOP_STAFF;
}

/**
 * How much of what guests would have bought actually gets sold, given how
 * many of them turned up against how many can be served.
 */
export function shopServiceFactor(golfers, capacity) {
  if (golfers <= 0) return 1;
  if (golfers <= capacity) return 1;
  return clamp(capacity / golfers, SHOP_SERVICE_FLOOR, 1);
}

/** Whether the resort has anything for shop staff to actually staff. A
 * hire is only wasted if there is no counter to stand behind. */
export function hasShopCounter(amenities = []) {
  return amenities.some((a) => a.type === 'proShop');
}
