/**
 * What a championship needs that a resort does not.
 *
 * These are deliberately **dead capital**. Eleven of the fourteen hotel
 * buildings earn something every day; these earn nothing between events,
 * and that is the decision being asked for — whether to sink money into a
 * stand that is empty fifty-one weeks a year so that once, for one week,
 * four thousand people have somewhere to sit.
 *
 * The hospitality pavilion is the exception, because a building that can
 * host a wedding between championships is one a real resort would put up.
 *
 * Kept out of `hotelAmenities.js` on purpose. That file guarantees every
 * entry serves overnight guests or day visitors and that none pleases
 * every crowd; these serve neither and please nobody, and bending those
 * invariants would cost more than a second file does.
 *
 * They do share the `resort.amenities` array, because
 * `tournaments.eligibleFor` already checks each rung's `requires` against
 * the types built there. Which means `hotelUpkeep` does not bill them — it
 * returns 0 for types it does not know — so `championshipUpkeep` exists
 * and `day.js` adds it separately.
 *
 * Pure data. Nothing in `src/sim/` computes with a DOM or a clock.
 */

const LIST = [
  {
    id: 'grandstands', label: 'Grandstands', build: 65000, upkeep: 220,
    rung: 'regional', gallery: 3000,
    blurb: 'Scaffold, planking and a safety certificate. Empty fifty-one weeks a year, and the only reason four thousand people can watch the eighteenth at all.',
  },
  {
    id: 'overflowParking', label: 'Overflow parking', build: 38000, upkeep: 90,
    rung: 'regional', gallery: 2500,
    blurb: 'Two fields, a hardcore track and a gate. Nobody has ever admired a car park, and a championship without one is a traffic story in the local paper instead of a golf story.',
  },
  {
    id: 'mediaCentre', label: 'Media centre', build: 90000, upkeep: 340,
    rung: 'national', gallery: 800,
    blurb: 'Desks, cabling, and somewhere to put forty laptops and a coffee urn. The week is only national if somebody files copy about it.',
  },
  {
    id: 'hospitalityPavilion', label: 'Hospitality pavilion', build: 110000, upkeep: 400,
    rung: 'national', gallery: 2200,
    // The one that is not dead capital. `trade` matches the shape
    // `hotelAmenities.js` uses for the function room, so the existing
    // indoor-trade machinery earns from it without a new code path.
    trade: { base: 380, weather: 520 },
    blurb: 'A marquee on a permanent base with a kitchen behind it. Corporate tables during the championship, weddings and dinners the rest of the year, which is why it is the only one of these that earns its keep in February.',
  },
];

export const CHAMPIONSHIP_BUILDINGS = Object.freeze(Object.fromEntries(
  LIST.map((b) => [b.id, Object.freeze(b)])
));

export const CHAMPIONSHIP_BUILDING_IDS = Object.freeze(LIST.map((b) => b.id));

/**
 * What the gallery for each rung amounts to.
 *
 * Set so the buildings a rung *requires* are deliberately not enough on
 * their own. If the required pair covered a regional's gallery, the crowd
 * bonus would be free the moment the rung became biddable — which is the
 * same fault the band gate was added to fix, arriving by another door.
 */
const GALLERY = Object.freeze({
  countyOpen: 1200,
  regional: 7500,
  national: 12000,
});

/** How many people a rung brings through the gate. 0 for an unknown rung. */
export function galleryFor(rungId) {
  return GALLERY[rungId] ?? 0;
}

/**
 * The clubhouse, the car park and the verges.
 *
 * A county open is watched by people who parked on the grass and stood
 * behind a rope, and a resort that has finished two acts can do that
 * without building anything. Non-zero so the smallest rung is not gated
 * on infrastructure the spec says it does not need.
 */
export const BASE_GALLERY_CAPACITY = 1500;

/**
 * What the rest of the property lends a championship.
 *
 * From the spec's callbacks table: the short course is "somewhere for the
 * gallery and a practice area", the brew pub is "where the gallery eats".
 * A national needs these, which is the point — the biggest week asks the
 * whole resort for help, not only the four buildings bought for it.
 */
const BORROWED_GALLERY = Object.freeze({
  shortCourse: 1200,
  brewPub: 500,
  functionRoom: 400,
  conferenceSuite: 400,
  pool: 300,
});

/** Everyone the property can hold, given what stands on it. */
export function galleryCapacity(amenities = []) {
  let held = BASE_GALLERY_CAPACITY;
  for (const built of amenities) {
    held += CHAMPIONSHIP_BUILDINGS[built.type]?.gallery ?? 0;
    held += BORROWED_GALLERY[built.type] ?? 0;
  }
  return held;
}

/** Whether the gallery this rung draws has somewhere to be. */
export function crowdHandledFor(amenities = [], rungId) {
  const needed = galleryFor(rungId);
  if (!needed) return false;
  return galleryCapacity(amenities) >= needed;
}

/** Daily upkeep of the championship buildings, summed. */
export function championshipUpkeep(amenities = []) {
  let total = 0;
  for (const built of amenities) {
    total += CHAMPIONSHIP_BUILDINGS[built.type]?.upkeep ?? 0;
  }
  return total;
}
