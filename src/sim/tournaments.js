/**
 * Championships: what they ask for, what they pay, and how they are judged.
 *
 * Act III's central idea is a shape of time the game has never had. Every
 * day in Acts I and II is the same shape — open, play, read the report,
 * decide. A championship is a spike the player sees coming, pays for in
 * advance, and then survives or does not.
 *
 * Three rungs, climbed in order. Bidding is deliberately NOT a dice roll:
 * the player applies and is accepted if the requirements are met, because
 * a management game should not hinge on luck for its central progression.
 * The uncertainty belongs in how the week goes.
 *
 * Pure. Nothing here computes with a DOM or a clock.
 */

/** The eighteen a championship needs. Named rather than inlined because
 * the Act I gate's nine and this are different numbers for different
 * reasons and should not drift into each other. */
export const CHAMPIONSHIP_HOLES = 18;

const LIST = [
  {
    id: 'countyOpen',
    label: 'County Open',
    blurb: 'Two hundred entries, a local paper, and a trophy somebody has to fetch from a cupboard. Nobody outside the county will hear about it, which is the point of starting here.',
    prestige: 55,
    requires: [],
    band: { low: 45, high: 60 },
    baseFee: 18000,
    purseCeiling: 48000,
  },
  {
    id: 'regional',
    label: 'Regional Championship',
    blurb: 'A field worth watching and a crowd worth seating. The first rung where people arrive who did not drive themselves, and the first where the course is expected to be a test rather than a nice day out.',
    prestige: 70,
    requires: ['grandstands', 'overflowParking'],
    band: { low: 62, high: 78 },
    baseFee: 45000,
    purseCeiling: 120000,
  },
  {
    id: 'national',
    label: 'National Open',
    blurb: 'Television, a press tent, and every hole photographed from the air. A week that makes a resort or files it permanently under "nearly".',
    prestige: 82,
    requires: ['mediaCentre', 'hospitalityPavilion'],
    band: { low: 80, high: 92 },
    baseFee: 110000,
    purseCeiling: 290000,
  },
];

export const RUNGS = Object.freeze(Object.fromEntries(
  LIST.map((r) => [r.id, Object.freeze({ ...r, band: Object.freeze(r.band) })])
));

/** In climbing order. */
export const RUNG_IDS = Object.freeze(LIST.map((r) => r.id));

/** Safe for an unknown id, the way every other lookup in this codebase is. */
export function rungFor(id) {
  return RUNGS[id] ?? null;
}

/**
 * Whether the resort could host this rung today.
 *
 * Prestige is a floor rather than the real gate: a resort leaving Act II
 * measures 78-85, so the buildings are what actually decides. That is
 * deliberate — the decision being asked for is whether to sink money into
 * things that do nothing most of the year.
 */
export function eligibleFor(rungId, { prestige = 0, resort, holesOpen = 0 }) {
  const rung = rungFor(rungId);
  if (!rung) return false;
  if (holesOpen < CHAMPIONSHIP_HOLES) return false;
  if (prestige < rung.prestige) return false;
  const built = new Set((resort?.amenities ?? []).map((a) => a.type));
  return rung.requires.every((type) => built.has(type));
}
