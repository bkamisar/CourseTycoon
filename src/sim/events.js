import { SPEAKERS as NARRATION_SPEAKERS, narrationContext } from './narration.js';
import { SEGMENT_KEYS } from './segments.js';

/**
 * Decision events: tradeoffs with explicit costs and no obviously right
 * answer, delivered by the same cast that narrates the evening report.
 *
 * Narration (narration.js) tells the player about themselves. This tells
 * the player to choose, and the choice has to matter: every option states
 * its cost in plain numbers, and no event may offer an option that beats
 * every alternative on every axis — a dominated set is a button dressed up
 * as a decision, not a decision (see tests/events.test.js). Consequences
 * land on money, prestige, turf and one segment's goodwill (goodwill.js);
 * see the plan for why time-costs (closing the course) are out of scope for
 * this slice.
 */

/** New voices beyond the narration cast, for people narration never had a
 * reason to name. */
export const SPEAKERS = {
  ...NARRATION_SPEAKERS,
  cityRep: 'The city parks office',
  societyRep: 'A society booking secretary',
  juniorRep: "The junior club's coach",
  neighbor: 'The house behind the 6th',
  supplierRep: 'A turf supplier',
  touringPro: 'A touring pro',
  charityRep: 'A hospice fundraiser',
};

/** The axes an event's consequence can move. Goodwill is per segment. */
const MONEY_PRESTIGE_TURF = ['money', 'prestige', 'turf'];

/**
 * Flattens a choice's `effects` into one vector, zero-filled on every axis
 * it does not mention. Used both by the day loop (to apply a choice) and by
 * the dominated-choice-set test (to compare choices axis by axis), so the
 * two can never quietly disagree about what an axis is worth.
 */
export function effectAxes(effects = {}) {
  const axes = {};
  for (const key of MONEY_PRESTIGE_TURF) axes[key] = effects[key] ?? 0;
  for (const key of SEGMENT_KEYS) axes[`goodwill.${key}`] = effects.goodwill?.[key] ?? 0;
  return axes;
}

/**
 * The facts an event's `when` may ask about. A superset of narration's own
 * context — same derivation, so an event and the evening's narration line
 * can never disagree about what day it is or how the course is doing —
 * plus the two fields narration never needed: money, and the act.
 */
export function eventContext({ report, previousReport, state }) {
  const base = narrationContext({ report, previousReport, state });
  return { ...base, money: state.money, act: state.act };
}

/**
 * Every decision event the game can offer.
 *
 * Written to read as the same world narration already inhabits: Gus, the
 * starter, the greenkeeper, the pro shop and the two publications return,
 * alongside new voices for the people narration never had a reason to
 * name — a neighbour, a supplier, a visiting pro.
 */
export const EVENTS = [
  {
    id: 'tournament-invite',
    speaker: 'cityRep',
    prompt: "The city wants to host its amateur championship here next month. Good for the name on the marquee — hard on the course underneath it.",
    when: (c) => c.prestige >= 20,
    choices: [
      {
        label: 'Host it',
        cost: '$2,500 in prep and marshaling, and three days of gallery traffic take a 12-point bite out of the turf.',
        effects: { money: -2500, turf: -12, prestige: 10, goodwill: { serious: 8, locals: -6 } },
      },
      {
        label: 'Decline',
        cost: 'Costs nothing today, but word gets around that you turned the city down — prestige drops about 4 points.',
        effects: { prestige: -4, goodwill: { locals: 3 } },
      },
    ],
  },
  {
    id: 'journalist-interview',
    speaker: 'press',
    prompt: "A writer from Fairway Monthly wants forty minutes. What do you tell her the course is for?",
    when: (c) => c.rating >= 40,
    choices: [
      {
        label: 'Sell the test',
        cost: 'Free to say, but serious golfers hear it loud and clear (goodwill +10) while locals read the same line as a warning (goodwill -8).',
        effects: { goodwill: { serious: 10, locals: -8 } },
      },
      {
        label: 'Sell the value',
        cost: 'Free to say, but locals feel seen (goodwill +10) while the piece reads thin to anyone chasing a tough track (serious goodwill -8).',
        effects: { goodwill: { locals: 10, serious: -8 } },
      },
      {
        label: 'Sell the scenery',
        cost: 'Destination guests take notice, and prestige ticks up 2 points — but the piece barely mentions the golf, and serious golfers notice that too.',
        effects: { prestige: 2, goodwill: { destination: 10, serious: -4 } },
      },
    ],
  },
  {
    id: 'mower-failure',
    speaker: 'keeper',
    prompt: "Main mower's thrown a rod. I can get us running again today, or we make do.",
    when: (c) => c.day >= 3,
    choices: [
      {
        label: 'Pay for the rush part',
        cost: '$4,000 today for parts flown in overnight.',
        effects: { money: -4000 },
      },
      {
        label: 'Wait a week for the standard part',
        cost: 'Free, but the crew falls behind hand-cutting and turf takes a 10-point hit; prestige dips 2 as the course starts to show it.',
        effects: { turf: -10, prestige: -2 },
      },
    ],
  },
  {
    id: 'society-outing',
    speaker: 'societyRep',
    prompt: "A corporate society wants eighteen slots this Saturday morning, at a discount, as a block.",
    when: (c) => c.day >= 4,
    choices: [
      {
        label: 'Take the block booking',
        cost: 'Green fee drops $9 a head for the block, crowding regulars off Saturday morning — nets about $1,200 in guaranteed revenue.',
        effects: { money: 1200, prestige: 2, goodwill: { destination: 4, locals: -6 } },
      },
      {
        label: 'Turn it down',
        cost: 'You walk away from a guaranteed $1,200, but the regulars keep their usual Saturday slots.',
        effects: { goodwill: { locals: 4 } },
      },
    ],
  },
  {
    id: 'junior-club-request',
    speaker: 'juniorRep',
    prompt: "The junior club wants standing access for their Tuesday group, at a fraction of the green fee.",
    when: () => true,
    choices: [
      {
        label: 'Grant standing Tuesday access',
        cost: 'About $300 a week in foregone green fees, every week, for as long as it runs.',
        effects: { money: -300, prestige: 1, goodwill: { locals: 8 } },
      },
      {
        label: 'Offer a one-off clinic instead',
        cost: '$600 for a single Saturday clinic with the pro — no standing commitment.',
        effects: { money: -600, prestige: 2, goodwill: { locals: 4 } },
      },
      {
        label: 'Decline',
        cost: 'Free today, but the club says so publicly, and locals goodwill drops 5.',
        effects: { goodwill: { locals: -5 } },
      },
    ],
  },
  {
    id: 'neighbour-complaint',
    speaker: 'neighbor',
    prompt: "The house behind the 6th has had three balls in the garden this month, and the owner is done being polite about it.",
    when: () => true,
    choices: [
      {
        label: 'Pay for boundary netting',
        cost: '$3,000 for netting along the 6th, and the problem stops for good.',
        effects: { money: -3000, prestige: 1 },
      },
      {
        label: 'Pay them off for now',
        cost: '$500 today, with no guarantee it does not come up again next month.',
        effects: { money: -500 },
      },
      {
        label: 'Do nothing',
        cost: 'Free, but Gus says they are now talking to a solicitor — prestige takes a 5-point hit.',
        effects: { prestige: -5 },
      },
    ],
  },
  {
    id: 'magazine-feature',
    speaker: 'gazette',
    prompt: "A glossy travel magazine will run a two-page feature — for a fee, with no editorial promises about what it says.",
    when: (c) => c.prestige >= 25,
    choices: [
      {
        label: 'Pay for the feature',
        cost: '$5,000, no promises on tone, but two full pages of exposure.',
        effects: { money: -5000, prestige: 6, goodwill: { destination: 6 } },
      },
      {
        label: 'Offer access instead of cash',
        cost: 'Free, but their photographer eats two hours of prime Saturday tee time — regulars notice the bump.',
        effects: { goodwill: { locals: -4, destination: 3 } },
      },
      {
        label: 'Decline',
        cost: 'Free — $0 spent, nothing gained, and you stay reliant on the unpaid coverage that has been thin lately.',
        effects: {},
      },
    ],
  },
  {
    id: 'staff-raise-request',
    speaker: 'keeper',
    prompt: "One of the grounds crew has asked for a raise, in person, and is waiting on an answer.",
    when: (c) => c.day >= 5,
    choices: [
      {
        label: 'Grant the raise',
        cost: '$800 in back pay to settle it, plus a higher rate going forward.',
        effects: { money: -800, turf: 5 },
      },
      {
        label: 'Offer a one-time bonus instead',
        cost: '$300 now, with no change to the weekly rate.',
        effects: { money: -300, turf: 1 },
      },
      {
        label: 'Refuse',
        cost: 'Free today, but the crew\'s mood sours and turf takes a 6-point hit within the week.',
        effects: { turf: -6 },
      },
    ],
  },
  {
    id: 'cheap-supplier',
    speaker: 'supplierRep',
    prompt: "A supplier is offering a cut-price batch of topdressing sand — well below the usual rate, and Gus can't vouch for the consistency.",
    when: () => true,
    choices: [
      {
        label: 'Buy the cheap batch',
        cost: '$400, and the greenkeeper isn\'t thrilled about the consistency — prestige takes a 1-point knock.',
        effects: { money: -400, turf: 3, prestige: -1 },
      },
      {
        label: 'Buy from the usual supplier at full price',
        cost: '$1,100 for the reliable stuff.',
        effects: { money: -1100, turf: 6 },
      },
      {
        label: 'Skip this cycle',
        cost: 'Free, but the greens go without topdressing and it shows — a 5-point turf hit.',
        effects: { turf: -5 },
      },
    ],
  },
  {
    id: 'touring-pro-endorsement',
    speaker: 'touringPro',
    prompt: "A touring pro passing through likes the place, and is offering to lend their name to the signage and the pro shop.",
    when: (c) => c.prestige >= 35,
    choices: [
      {
        label: 'Sign the full endorsement',
        cost: '$6,000 for a season of their name on the signage and in the shop.',
        effects: { money: -6000, prestige: 10, goodwill: { serious: 8 } },
      },
      {
        label: 'Negotiate a single exhibition day',
        cost: '$1,500 for one day only, no standing deal.',
        effects: { money: -1500, prestige: 4, goodwill: { serious: 3 } },
      },
      {
        label: 'Decline',
        cost: 'Free, but Gus reckons the course down the road will happily pay for it instead — prestige dips 2.',
        effects: { prestige: -2 },
      },
    ],
  },
  {
    id: 'pace-complaints',
    speaker: 'gus',
    prompt: "Three groups walked off the back nine unhappy about the pace today, and one of them asked for money back.",
    when: () => true,
    choices: [
      {
        label: 'Refund the late groups',
        cost: '$900 in same-day refunds, and prestige takes a 1-point ding as word gets around you had to apologise.',
        effects: { money: -900, prestige: -1, goodwill: { locals: 5, serious: 3 } },
      },
      {
        label: 'Offer replay vouchers instead of cash',
        cost: '$400 in admin and printing now, against future green fees you will eventually eat.',
        effects: { money: -400, prestige: 1, goodwill: { locals: 3, serious: 2 } },
      },
      {
        label: 'Apologise, nothing more',
        cost: 'Free, but Gus says those three groups are not rushing back.',
        effects: { goodwill: { locals: -6, serious: -4 } },
      },
    ],
  },
  {
    id: 'night-vandalism',
    speaker: 'gus',
    prompt: "Found tire tracks across the 7th this morning. Someone's been coming through at night.",
    when: (c) => c.day >= 6,
    choices: [
      {
        label: 'Install lighting',
        cost: '$3,500 up front, but it stops the problem for good.',
        effects: { money: -3500, prestige: 2, goodwill: { locals: 3 } },
      },
      {
        label: "Pay Gus overtime to patrol",
        cost: '$600 for a week of extra night rounds.',
        effects: { money: -600, goodwill: { locals: 2 } },
      },
      {
        label: 'Do nothing',
        cost: 'Free, but the 7th stays torn up — a 6-point turf hit, and prestige drops 2 as it becomes visible from the road.',
        effects: { turf: -6, prestige: -2 },
      },
    ],
  },
  {
    id: 'charity-tournament',
    speaker: 'charityRep',
    prompt: "A local hospice fundraiser wants to run a forty-player charity scramble here next month.",
    when: (c) => c.day >= 7,
    choices: [
      {
        label: 'Host it free',
        cost: 'Waive the green fee for forty players — about $880 in fees you do not collect.',
        effects: { money: -880, prestige: 3, goodwill: { locals: 6 } },
      },
      {
        label: 'Offer half price instead of free',
        cost: 'About $440 in foregone fees rather than the full amount.',
        effects: { money: -440, prestige: 1, goodwill: { locals: 3 } },
      },
      {
        label: 'Decline',
        cost: 'Costs nothing today, but the organiser says so to anyone who will listen — prestige drops 3.',
        effects: { prestige: -3, goodwill: { locals: -3 } },
      },
    ],
  },
  {
    id: 'regular-loyalty-request',
    speaker: 'regular',
    prompt: "One of the regulars, three rounds a week for two years, wants to know if there is any kind of loyalty deal.",
    when: (c) => c.day >= 3,
    choices: [
      {
        label: 'Start a standing punch-card discount',
        cost: 'About $350 a week in discounted fees, ongoing, for everyone who qualifies.',
        effects: { money: -350, goodwill: { locals: 7 } },
      },
      {
        label: 'Comp him one round',
        cost: 'One green fee, once — about $22.',
        effects: { money: -22, goodwill: { locals: 2 } },
      },
      {
        label: 'Say no',
        cost: 'Free, but he has been coming three times a week for two years, and it stings.',
        effects: { goodwill: { locals: -4 } },
      },
    ],
  },
  {
    id: 'storm-bunker-damage',
    speaker: 'keeper',
    prompt: "Overnight storm caved in the face of the approach bunker on the 4th. Needs sorting before it gets worse.",
    when: () => true,
    choices: [
      {
        label: 'Full rebuild',
        cost: '$2,800 for a proper rebuild that holds up.',
        effects: { money: -2800, turf: 8 },
      },
      {
        label: 'Patch job',
        cost: '$600, but it will not survive the next heavy rain.',
        effects: { money: -600, turf: 2 },
      },
      {
        label: 'Leave it',
        cost: 'Free, but it is an eyesore on the approach shot, and serious golfers notice bunkers — goodwill among them drops 5.',
        effects: { turf: -4, goodwill: { serious: -5 } },
      },
    ],
  },
  {
    id: 'rival-price-cut',
    speaker: 'gazette',
    prompt: "The course across the valley has cut its green fee by a third. Regulars have started asking about it.",
    when: (c) => c.day >= 10,
    choices: [
      {
        label: 'Match it for two weeks',
        cost: 'About $1,600 in lost margin over the fortnight.',
        effects: { money: -1600, goodwill: { locals: 5 } },
      },
      {
        label: 'Run a single discounted Saturday',
        cost: '$500 for one day, to remind people you are here.',
        effects: { money: -500, goodwill: { locals: 2 } },
      },
      {
        label: 'Hold your price',
        cost: 'Free, but Gus says regulars have been asking about "the new place down the road" — goodwill among locals drops 4.',
        effects: { goodwill: { locals: -4 } },
      },
    ],
  },
];

/** How many recently-offered events to remember before recycling. Smaller
 * than narration's memory because there are far fewer events than lines,
 * and events fire roughly weekly rather than daily. */
export const EVENT_MEMORY = 10;

/**
 * Picks the day's decision event, if any is eligible. Mirrors
 * narration.pickNarration: unseen-first, recycle only once a situation's
 * whole pool has been shown, deterministic for a given context and rng.
 */
export function pickEvent(context, rng, recentIds = []) {
  const eligible = EVENTS.filter((event) => {
    try {
      return event.when(context);
    } catch {
      return false;
    }
  });
  if (eligible.length === 0) return null;

  const recent = new Set(recentIds);
  const unseen = eligible.filter((event) => !recent.has(event.id));
  const pool = unseen.length > 0 ? unseen : eligible;

  return pool[rng.int(pool.length)];
}

/** The recent-event memory, trimmed, after offering `id`. */
export function rememberEvent(recentIds = [], id) {
  if (!id) return recentIds;
  return [...recentIds, id].slice(-EVENT_MEMORY);
}
