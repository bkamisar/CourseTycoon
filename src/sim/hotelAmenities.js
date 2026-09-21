/**
 * What a hotel is besides beds.
 *
 * Two things shape this list. The first is the guarantee everything in
 * this game carries: **no amenity pleases every crowd.** Holes have it,
 * menu items have it, and a new surface does not get an exemption.
 *
 * The second is the answer to a problem Act II creates for itself.
 * Locals never book a room in their own town (see `rooms.js`), which
 * would leave the crowd Act I spent sixty days building with nothing to
 * do in Act II. So **every hotel amenity serves overnight guests, day
 * visitors, or both** — a function room sells weddings to the
 * neighbourhood, a brew pub is somewhere to drive out to on a Friday. The
 * hotel earns from people who will never sleep in it.
 *
 * Three of these do real mechanical work rather than adding appeal, and
 * they are the reason the list is interesting:
 *
 * - **`weatherProof`** — the indoor range earns on a day the course is
 *   shut. Weather swings demand from 1.12 to 0.10 in a storm and leaves
 *   every other building on the property idle; a range under a roof is
 *   the one thing that takes money on the worst day of the month. It does
 *   not add revenue so much as *smooth* the variance weather introduced.
 * - **`divertsGroups`** — the short course takes beginners and families
 *   off the main course. Every other amenity in this game draws a crowd
 *   onto a course that then has to flow; this is the only one that helps
 *   pace by subtraction.
 * - **`extraNights`** — the kids' club and the spa lengthen a stay rather
 *   than attracting more of them. A different verb from everything else
 *   here, and the only way to raise occupancy without raising demand.
 *
 * Pure data. Nothing in `src/sim/` computes with a DOM or a clock.
 */

/**
 * `serves` says who an amenity is for:
 *   'overnight' — only guests staying the night
 *   'day'       — only people who drive in, which in practice means locals
 *   'both'
 *
 * `appeal` is 0..1 per crowd, and **no entry may be ≥0.8 for all three**.
 */
const LIST = [
  // --- For the people staying -----------------------------------------
  {
    id: 'pool', label: 'Pool', build: 22000, upkeep: 190, serves: 'both',
    appeal: { locals: 0.45, serious: 0.15, destination: 0.85 },
    blurb: 'Somewhere for the family to be while somebody plays golf. Sells memberships to the neighbourhood too, which is the only reason it earns on a Tuesday in February.',
  },
  {
    id: 'kidsClub', label: "Kids' club", build: 16000, upkeep: 240, serves: 'overnight',
    appeal: { locals: 0.20, serious: 0.05, destination: 0.80 },
    extraNights: 0.8,
    blurb: 'Childcare with a rota and a craft table. Families who would have come for two nights come for three, which is worth more than another family would be.',
  },
  {
    id: 'spa', label: 'Spa', build: 34000, upkeep: 320, serves: 'both',
    appeal: { locals: 0.40, serious: 0.20, destination: 0.80 },
    extraNights: 0.4,
    blurb: 'The reason the half of the party who does not play golf agrees to come at all.',
  },
  {
    id: 'cocktailBar', label: 'Cocktail bar', build: 18000, upkeep: 200, serves: 'both',
    appeal: { locals: 0.40, serious: 0.40, destination: 0.80 },
    blurb: 'Somewhere to end the evening that is not the clubhouse. Guests drink more when they are not driving home.',
  },
  {
    id: 'fineDining', label: 'Fine dining room', build: 38000, upkeep: 420, serves: 'both',
    appeal: { locals: 0.50, serious: 0.35, destination: 0.90 },
    blurb: 'A proper kitchen and a wine list. Destination guests plan an evening around it; locals drive out for an anniversary.',
  },

  // --- For the people playing serious golf -----------------------------
  {
    id: 'dawnTeeTimes', label: 'Dawn tee times', build: 9000, upkeep: 150, serves: 'overnight',
    appeal: { locals: 0.15, serious: 0.90, destination: 0.30 },
    blurb: 'First off the tee, before the dew burns away, reserved for people sleeping here. This is the answer to why a golfer would pay for a bed at a course he could drive to: the tee time is worth more than the drive.',
  },
  {
    id: 'indoorRange', label: 'Indoor range', build: 30000, upkeep: 280, serves: 'both',
    appeal: { locals: 0.35, serious: 0.90, destination: 0.40 },
    weatherProof: true,
    blurb: 'Bays, mats and a launch monitor, under a roof. Takes money on the days the course takes none — the only thing here that earns in a storm.',
  },
  {
    id: 'clubStorage', label: 'Club storage', build: 8000, upkeep: 110, serves: 'overnight',
    appeal: { locals: 0.10, serious: 0.75, destination: 0.40 },
    blurb: 'Clubs cleaned overnight and waiting on the first tee. Small, cheap, and precisely what a serious golfer notices.',
  },
  {
    id: 'caddieProgramme', label: 'Caddie programme', build: 14000, upkeep: 350, serves: 'both',
    appeal: { locals: 0.15, serious: 0.70, destination: 0.75 },
    blurb: 'Local kids who know where the ball goes. Expensive to run and the thing people remember.',
  },
  {
    id: 'gym', label: 'Gym', build: 12000, upkeep: 130, serves: 'both',
    appeal: { locals: 0.50, serious: 0.60, destination: 0.35 },
    blurb: 'A rack, a bike and a mirror. Nobody travels for it and everybody expects it.',
  },

  // --- For the people who will never book a room ----------------------
  {
    id: 'functionRoom', label: 'Function room', build: 26000, upkeep: 210, serves: 'day',
    appeal: { locals: 0.85, serious: 0.10, destination: 0.20 },
    blurb: 'Weddings, societies, wakes and the golf club AGM. Revenue with no golfer attached, from the crowd who would never book a bed.',
  },
  {
    id: 'brewPub', label: 'Brew pub', build: 24000, upkeep: 230, serves: 'both',
    appeal: { locals: 0.85, serious: 0.60, destination: 0.45 },
    blurb: 'Four taps and a car park. The reason locals are still here at nine on a Friday, and the reason they come on days they are not playing.',
  },
  {
    id: 'shortCourse', label: 'Short course', build: 32000, upkeep: 300, serves: 'both',
    appeal: { locals: 0.70, serious: 0.25, destination: 0.75 },
    divertsGroups: 0.18,
    blurb: 'Three par threes and a practice green. Beginners and families play here instead of holding up the first tee — the only thing you can build that makes the main course faster by taking golfers off it.',
  },
  {
    id: 'conferenceSuite', label: 'Conference suite', build: 29000, upkeep: 260, serves: 'day',
    appeal: { locals: 0.30, serious: 0.15, destination: 0.70 },
    blurb: 'Projector, bad coffee, eighteen holes in the afternoon. Fills rooms on a Tuesday, which is the hardest night of the week to sell.',
  },
];

export const HOTEL_AMENITIES = Object.freeze(Object.fromEntries(
  LIST.map((a) => [a.id, Object.freeze({
    weatherProof: false,
    divertsGroups: 0,
    extraNights: 0,
    ...a,
    appeal: Object.freeze(a.appeal),
  })])
));

export const HOTEL_AMENITY_IDS = Object.freeze(LIST.map((a) => a.id));

/** Everything the resort has built, resolved and safe for unknown ids. */
function built(amenities = []) {
  return amenities
    .map((a) => HOTEL_AMENITIES[a.type])
    .filter(Boolean);
}

/** What the hotel's buildings cost to run, per day. */
export function hotelUpkeep(amenities) {
  return built(amenities).reduce((sum, a) => sum + a.upkeep, 0);
}

/**
 * Extra nights a stay runs to, from amenities that lengthen it.
 *
 * Additive and deliberately modest: two of these together should extend a
 * trip, not double it.
 */
export function extraNightsFrom(amenities) {
  return built(amenities).reduce((sum, a) => sum + a.extraNights, 0);
}

/**
 * The share of groups diverted off the main course onto something else.
 *
 * Capped well below 1: a short course takes the beginners, not the field.
 */
export function divertedShare(amenities) {
  const total = built(amenities).reduce((sum, a) => sum + a.divertsGroups, 0);
  return Math.min(total, 0.35);
}

/** Whether anything here earns on a day the course is unplayable. */
export function hasWeatherProofDraw(amenities) {
  return built(amenities).some((a) => a.weatherProof);
}

/** How much a crowd wants what the hotel offers, 0..1. The best thing on
 * offer drives it and the rest add a little — breadth helps, and does not
 * stack, the same shape `menuPull` uses. */
export function hotelAppeal(amenities, segment) {
  const list = built(amenities);
  if (list.length === 0) return 0;
  const draws = list.map((a) => a.appeal[segment] ?? 0);
  const best = Math.max(...draws);
  const mean = draws.reduce((s, d) => s + d, 0) / draws.length;
  return Math.min(1, mean + 0.5 * (best - mean));
}
