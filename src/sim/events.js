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

/**
 * The kinds of answer a person can give.
 *
 * Every choice carries one. It is not a mechanic — nothing in the
 * simulation reads a stance, and two choices sharing one are not
 * otherwise related. It is a reading aid: the cost line underneath says
 * what a choice does, and this says what sort of person it makes you, so
 * the shape of a decision is legible before any of the numbers are.
 *
 * That matters most where the numbers are close. Paying $600 versus
 * paying $2,800 to fix a bunker is arithmetic; "splits the difference"
 * versus "does it properly" is a decision, and the player can recognise
 * their own habit forming across a sixty-day run.
 *
 * The gloss is the half-sentence shown beside the label. Deliberately
 * short — on a phone this sits above a cost line that is already two
 * lines long, and a third line of explanation is a line nobody reads.
 */
export const STANCES = {
  populist:   { label: 'Populist',   gloss: 'keeps the regulars onside' },
  ambitious:  { label: 'Ambitious',  gloss: 'chases the name' },
  commercial: { label: 'Commercial', gloss: 'takes the money' },
  thorough:   { label: 'Thorough',   gloss: 'does it properly' },
  pragmatic:  { label: 'Pragmatic',  gloss: 'splits the difference' },
  principled: { label: 'Principled', gloss: 'the right thing, at a price' },
  thrifty:    { label: 'Thrifty',    gloss: 'spends nothing today' },
  defiant:    { label: 'Defiant',    gloss: 'refuses, and wears it' },
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

  /**
   * A condition, totalled over the days it runs.
   *
   * Without this the dominance check compared one-off numbers only, and
   * every "do nothing today" choice looked strictly better than paying to
   * fix the thing — because the month of damage it imposed was invisible
   * to the comparison. Eleven of the new events read as having a dominant
   * choice for exactly that reason, and none of them did.
   *
   * These are rough totals, not the simulation's own arithmetic. They
   * only have to be good enough to compare two choices in the same event
   * with each other, which is all the dominance check asks of them.
   */
  const c = effects.condition;
  const days = c?.days ?? 0;
  axes.money += (c?.dailyMoney ?? 0) * -days;
  axes.turf += (c?.turfPerDay ?? 0) * days;
  // Lost turnout and shut holes have no axis of their own; both are
  // straightforwardly bad and are scored on one so a choice cannot hide a
  // fortnight of closure behind a small cash saving.
  axes.disruption = -(
    (1 - (c?.demandFactor ?? 1)) * days * 100
    + (c?.holesClosed ?? 0) * days * 8
  );
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
        stance: 'ambitious',
        label: 'Host it',
        cost: '$2,500 in prep and marshaling, and three days of gallery traffic take a 12-point bite out of the turf.',
        effects: { money: -2500, turf: -12, prestige: 10, goodwill: { serious: 8, locals: -6 } },
      },
      {
        stance: 'populist',
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
        stance: 'ambitious',
        label: 'Sell the test',
        cost: 'Free to say, but serious golfers hear it loud and clear (goodwill +10) while locals read the same line as a warning (goodwill -8).',
        effects: { goodwill: { serious: 10, locals: -8 } },
      },
      {
        stance: 'populist',
        label: 'Sell the value',
        cost: 'Free to say, but locals feel seen (goodwill +10) while the piece reads thin to anyone chasing a tough track (serious goodwill -8).',
        effects: { goodwill: { locals: 10, serious: -8 } },
      },
      {
        stance: 'commercial',
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
        stance: 'thorough',
        label: 'Pay for the rush part',
        cost: '$4,000 today for parts flown in overnight.',
        effects: { money: -4000 },
      },
      {
        stance: 'thrifty',
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
        stance: 'commercial',
        label: 'Take the block booking',
        cost: 'Green fee drops $9 a head for the block, crowding regulars off Saturday morning — nets about $1,200 in guaranteed revenue.',
        effects: { money: 1200, prestige: 2, goodwill: { destination: 4, locals: -6 } },
      },
      {
        stance: 'populist',
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
        stance: 'principled',
        label: 'Grant standing Tuesday access',
        cost: 'About $300 a week in foregone green fees, every week, for as long as it runs.',
        effects: { money: -300, prestige: 1, goodwill: { locals: 8 } },
      },
      {
        stance: 'pragmatic',
        label: 'Offer a one-off clinic instead',
        cost: '$600 for a single Saturday clinic with the pro — no standing commitment.',
        effects: { money: -600, prestige: 2, goodwill: { locals: 4 } },
      },
      {
        stance: 'thrifty',
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
        stance: 'thorough',
        label: 'Pay for boundary netting',
        cost: '$3,000 for netting along the 6th, and the problem stops for good.',
        effects: { money: -3000, prestige: 1 },
      },
      {
        stance: 'pragmatic',
        label: 'Pay them off for now',
        cost: '$500 today, with no guarantee it does not come up again next month.',
        effects: { money: -500 },
      },
      {
        stance: 'defiant',
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
        stance: 'ambitious',
        label: 'Pay for the feature',
        cost: '$5,000, no promises on tone, but two full pages of exposure.',
        effects: { money: -5000, prestige: 6, goodwill: { destination: 6 } },
      },
      {
        stance: 'pragmatic',
        label: 'Offer access instead of cash',
        cost: 'Free, but their photographer eats two hours of prime Saturday tee time — regulars notice the bump.',
        effects: { goodwill: { locals: -4, destination: 3 } },
      },
      {
        stance: 'thrifty',
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
        stance: 'principled',
        label: 'Grant the raise',
        cost: '$800 in back pay to settle it, plus a higher rate going forward.',
        effects: { money: -800, turf: 5 },
      },
      {
        stance: 'pragmatic',
        label: 'Offer a one-time bonus instead',
        cost: '$300 now, with no change to the weekly rate.',
        effects: { money: -300, turf: 1 },
      },
      {
        stance: 'defiant',
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
        stance: 'thrifty',
        label: 'Buy the cheap batch',
        cost: '$400, and the greenkeeper isn\'t thrilled about the consistency — prestige takes a 1-point knock.',
        effects: { money: -400, turf: 3, prestige: -1 },
      },
      {
        stance: 'thorough',
        label: 'Buy from the usual supplier at full price',
        cost: '$1,100 for the reliable stuff.',
        effects: { money: -1100, turf: 6 },
      },
      {
        stance: 'defiant',
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
        stance: 'ambitious',
        label: 'Sign the full endorsement',
        cost: '$6,000 for a season of their name on the signage and in the shop.',
        effects: { money: -6000, prestige: 10, goodwill: { serious: 8 } },
      },
      {
        stance: 'pragmatic',
        label: 'Negotiate a single exhibition day',
        cost: '$1,500 for one day only, no standing deal.',
        effects: { money: -1500, prestige: 4, goodwill: { serious: 3 } },
      },
      {
        stance: 'thrifty',
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
        stance: 'principled',
        label: 'Refund the late groups',
        cost: '$900 in same-day refunds, and prestige takes a 1-point ding as word gets around you had to apologise.',
        effects: { money: -900, prestige: -1, goodwill: { locals: 5, serious: 3 } },
      },
      {
        stance: 'pragmatic',
        label: 'Offer replay vouchers instead of cash',
        cost: '$400 in admin and printing now, against future green fees you will eventually eat.',
        effects: { money: -400, prestige: 1, goodwill: { locals: 3, serious: 2 } },
      },
      {
        stance: 'defiant',
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
        stance: 'thorough',
        label: 'Install lighting',
        cost: '$3,500 up front, but it stops the problem for good.',
        effects: { money: -3500, prestige: 2, goodwill: { locals: 3 } },
      },
      {
        stance: 'pragmatic',
        label: "Pay Gus overtime to patrol",
        cost: '$600 for a week of extra night rounds.',
        effects: { money: -600, goodwill: { locals: 2 } },
      },
      {
        stance: 'defiant',
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
        stance: 'principled',
        label: 'Host it free',
        cost: 'Waive the green fee for forty players — about $880 in fees you do not collect.',
        effects: { money: -880, prestige: 3, goodwill: { locals: 6 } },
      },
      {
        stance: 'pragmatic',
        label: 'Offer half price instead of free',
        cost: 'About $440 in foregone fees rather than the full amount.',
        effects: { money: -440, prestige: 1, goodwill: { locals: 3 } },
      },
      {
        stance: 'thrifty',
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
        stance: 'populist',
        label: 'Start a standing punch-card discount',
        cost: 'About $350 a week in discounted fees, ongoing, for everyone who qualifies.',
        effects: { money: -350, goodwill: { locals: 7 } },
      },
      {
        stance: 'pragmatic',
        label: 'Comp him one round',
        cost: 'One green fee, once — about $22.',
        effects: { money: -22, goodwill: { locals: 2 } },
      },
      {
        stance: 'defiant',
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
        stance: 'thorough',
        label: 'Full rebuild',
        cost: '$2,800 for a proper rebuild that holds up.',
        effects: { money: -2800, turf: 8 },
      },
      {
        stance: 'pragmatic',
        label: 'Patch job',
        cost: '$600, but it will not survive the next heavy rain.',
        effects: { money: -600, turf: 2 },
      },
      {
        stance: 'defiant',
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
        stance: 'populist',
        label: 'Match it for two weeks',
        cost: 'About $1,600 in lost margin over the fortnight.',
        effects: { money: -1600, goodwill: { locals: 5 } },
      },
      {
        stance: 'pragmatic',
        label: 'Run a single discounted Saturday',
        cost: '$500 for one day, to remind people you are here.',
        effects: { money: -500, goodwill: { locals: 2 } },
      },
      {
        stance: 'defiant',
        label: 'Hold your price',
        cost: 'Free, but Gus says regulars have been asking about "the new place down the road" — goodwill among locals drops 4.',
        effects: { goodwill: { locals: -4 } },
      },
    ],
  },

  // --- Things that are still wrong next week ---------------------------
  //
  // Everything above this line resolves the moment it is answered. These
  // impose a `condition` instead (see `src/sim/conditions.js`): damage
  // with a duration, which is what makes a choice something to live with
  // rather than a number subtracted once.
  //
  // They are written so the four kinds of damage are genuinely different
  // problems. A bill wants cash, a blight wants groundskeepers and time,
  // bad press wants outlasting, and a shut hole changes what the course
  // is while it lasts. A player should never have one habit that answers
  // all of them, which is why almost every choice below trades one kind
  // of pain for another rather than offering a clean way out.

  {
    id: 'drainage-failure',
    speaker: 'keeper',
    prompt: "The drainage under the low end has given up. Every wet morning from here is going to sit in that hollow until someone digs it out properly.",
    when: (c) => c.turf < 80 && c.holesOpen >= 5,
    choices: [
      {
        stance: 'thorough',
        label: 'Dig it out now',
        cost: '$14,000, and two holes shut for a week while the machines are in.',
        effects: {
          money: -14000,
          condition: {
            id: 'drainage-works', label: 'Drainage works',
            note: 'Two holes shut while the ground is open.',
            days: 7, holesClosed: 2,
          },
        },
      },
      {
        stance: 'thrifty',
        label: 'Pump it when it floods',
        cost: 'Nothing today. The ground stays sour for 16 days and the greens lose about 3.4 points a day while it does.',
        effects: {
          condition: {
            id: 'sour-ground', label: 'Sour ground',
            note: 'Water sitting in the hollow. The turf loses ground daily.',
            days: 16, turfPerDay: -3.4,
          },
        },
      },
      {
        stance: 'pragmatic',
        label: 'Patch the worst of it',
        cost: '$5,000 and 9 days of slower recovery, which is neither fix nor disaster.',
        effects: {
          money: -5000,
          condition: {
            id: 'sour-ground', label: 'Soft ground',
            note: 'Patched, not solved. The turf recovers slowly.',
            days: 9, turfPerDay: -1.8,
          },
        },
      },
    ],
  },

  {
    id: 'irrigation-main',
    speaker: 'keeper',
    prompt: "The main split overnight. We can run hoses for now, but hoses do not water a golf course, they water the bits somebody remembers.",
    when: (c) => c.holesOpen >= 5,
    choices: [
      {
        stance: 'thorough',
        label: 'Replace the main',
        cost: '$11,000 up front and it is done with.',
        effects: { money: -11000 },
      },
      {
        stance: 'thrifty',
        label: 'Run hoses',
        cost: 'Free, and the course dries out unevenly for 12 days, losing about 2.6 points a day.',
        effects: {
          condition: {
            id: 'hosing', label: 'Hand watering',
            note: 'Hoses instead of a main. The course dries out in patches.',
            days: 12, turfPerDay: -2.6,
          },
        },
      },
    ],
  },

  {
    id: 'kitchen-inspection',
    speaker: 'cityRep',
    prompt: "Environmental health came through the kitchen this morning. The report uses the word 'immediate' twice.",
    when: (c) => c.day >= 12,
    choices: [
      {
        stance: 'thorough',
        label: 'Close and refit',
        cost: '$8,500, and nobody eats here for five days.',
        effects: {
          money: -8500,
          condition: {
            id: 'kitchen-shut', label: 'Kitchen closed',
            note: 'Refit in progress. Fewer reasons to make the drive out.',
            days: 5, demandFactor: 0.82,
          },
        },
      },
      {
        stance: 'defiant',
        label: 'Appeal it',
        cost: 'Nothing today. The notice stays on the door 12 days and turnout runs about a third down while it does.',
        effects: {
          prestige: -3,
          condition: {
            id: 'health-notice', label: 'Notice on the door',
            note: 'An appeal pending, in public. People read the notice, not the appeal.',
            days: 12, demandFactor: 0.66,
          },
        },
      },
    ],
  },

  {
    id: 'bad-review',
    speaker: 'press',
    prompt: "Fairway Monthly ran eight hundred words on this place. Six hundred of them are about the wait on the first tee.",
    when: (c) => c.satisfaction < 55 && c.day >= 15,
    choices: [
      {
        stance: 'principled',
        label: 'Write back and own it',
        cost: 'Costs nothing and helps a little. The piece still runs, and turnout is about a third down for 9 days.',
        effects: {
          goodwill: { locals: 6, serious: 4 },
          condition: {
            id: 'bad-press', label: 'Bad write-up',
            note: 'Eight hundred words, mostly about the queue. Turnout is down while it circulates.',
            days: 9, demandFactor: 0.66,
          },
        },
      },
      {
        stance: 'commercial',
        label: 'Buy an ad in the next issue',
        cost: '$6,000 to sit opposite the correction, which shortens it to 6 days and softens it.',
        effects: {
          money: -6000,
          condition: {
            id: 'bad-press', label: 'Bad write-up',
            note: 'Softened by the ad opposite, but still out there.',
            days: 6, demandFactor: 0.74,
          },
        },
      },
      {
        stance: 'defiant',
        label: 'Say nothing',
        cost: 'Free. It runs, it stands, and turnout is 40% down for 13 days.',
        effects: {
          condition: {
            id: 'bad-press', label: 'Bad write-up',
            note: 'Unanswered. It is the first thing anyone has heard about this place.',
            days: 13, demandFactor: 0.6,
          },
        },
      },
    ],
  },

  {
    id: 'keeper-poached',
    speaker: 'keeper',
    prompt: "The club down the road offered me a job this morning. I have not said yes. I have not said no either.",
    when: (c) => c.day >= 20 && c.turf >= 55,
    choices: [
      {
        stance: 'principled',
        label: 'Match it',
        cost: '$420 a day on top of the wage, for 18 days. Worth it if you have no one else who knows this ground.',
        effects: {
          condition: {
            id: 'retention', label: 'Matched offer',
            note: 'Keeping your greenkeeper costs more than it did.',
            days: 18, dailyMoney: 420,
          },
        },
      },
      {
        stance: 'thrifty',
        label: 'Wish him well',
        cost: 'Saves the wage and costs the knowledge. The greens lose about 3.8 points a day for 12 days.',
        effects: {
          goodwill: { locals: -4 },
          condition: {
            id: 'lost-keeper', label: 'Short-handed',
            note: 'Nobody left who knows where the wet spots are.',
            days: 12, turfPerDay: -3.8,
          },
        },
      },
    ],
  },

  {
    id: 'neighbour-suit',
    speaker: 'neighbor',
    prompt: "Four balls through the conservatory this season. My solicitor has written it all down and he would like you to read it.",
    when: (c) => c.groups >= 14,
    choices: [
      {
        stance: 'thorough',
        label: 'Put up netting',
        cost: '$9,500 and it never comes up again.',
        effects: { money: -9500, goodwill: { locals: 4 } },
      },
      {
        stance: 'pragmatic',
        label: 'Settle it privately',
        cost: '$620 a day for 13 days, and a neighbour who is only waiting for the next one.',
        effects: {
          condition: {
            id: 'settlement', label: 'Settlement instalments',
            note: 'Paying the conservatory off a bit at a time.',
            days: 13, dailyMoney: 620,
          },
        },
      },
      {
        stance: 'defiant',
        label: 'Let him sue',
        cost: 'Nothing today. Then $880 a day for 18 days, and it is in the local paper the whole time.',
        effects: {
          prestige: -4,
          condition: {
            id: 'lawsuit', label: 'In court',
            note: 'A neighbour, a solicitor, and a local paper enjoying all of it.',
            days: 18, dailyMoney: 880, demandFactor: 0.9,
          },
        },
      },
    ],
  },

  {
    id: 'tree-down',
    speaker: 'starter',
    prompt: "There is an oak lying across the fairway and about forty feet of it is where the fairway used to be.",
    when: (c) => c.holesOpen >= 3,
    choices: [
      {
        stance: 'commercial',
        label: 'Clear it today',
        cost: '$4,200 for a crew at short notice, and one hole shut for the afternoon.',
        effects: {
          money: -4200,
          condition: {
            id: 'tree-clearing', label: 'Hole shut',
            note: 'A crew and a chainsaw where the fairway was.',
            days: 2, holesClosed: 1,
          },
        },
      },
      {
        stance: 'thrifty',
        label: 'Play around it',
        cost: 'Free. The hole is unplayable for 8 days and everybody who came for the round they were promised notices.',
        effects: {
          condition: {
            id: 'tree-down', label: 'Hole out of play',
            note: 'An oak where the fairway was. Nobody is playing that hole.',
            days: 8, holesClosed: 1,
          },
        },
      },
    ],
  },

  {
    id: 'greens-blight',
    speaker: 'keeper',
    prompt: "There is something in the greens that I have seen once before, and the last time it took a season off a better course than this.",
    when: (c) => c.turf < 70,
    choices: [
      {
        stance: 'thorough',
        label: 'Treat all nine properly',
        cost: '$12,000 of chemistry and labour, and it is gone in a week.',
        effects: {
          money: -12000,
          condition: {
            id: 'blight-treatment', label: 'Under treatment',
            note: 'Chemistry working. Slow going until it takes.',
            days: 7, turfPerDay: -1.2,
          },
        },
      },
      {
        stance: 'pragmatic',
        label: 'Treat the worst three',
        cost: '$4,000, and the rest of it spreads for 16 days at about 3.6 points a day.',
        effects: {
          money: -4000,
          condition: {
            id: 'blight', label: 'Blight spreading',
            note: 'Treated in patches, which is another way of saying untreated.',
            days: 16, turfPerDay: -3.6,
          },
        },
      },
    ],
  },

  {
    id: 'supplier-rise',
    speaker: 'supplierRep',
    prompt: "Fertiliser, sand and fuel are all up. I can hold your old price for a year if you sign for the year.",
    when: (c) => c.day >= 25,
    choices: [
      {
        stance: 'commercial',
        label: 'Sign for the year',
        cost: '$6,200 down, and you drop the yard in town that has supplied this course for thirty years. Locals goodwill -6.',
        effects: { money: -6200, goodwill: { locals: -6 } },
      },
      {
        stance: 'populist',
        label: 'Keep buying local',
        cost: 'Nothing today, then $700 a day for 18 days. The yard in town notices you stayed. Locals goodwill +4.',
        effects: {
          goodwill: { locals: 4 },
          condition: {
            id: 'supply-costs', label: 'Prices up',
            note: 'Buying at the new rate from the yard in town, one week at a time.',
            days: 18, dailyMoney: 700,
          },
        },
      },
    ],
  },

  {
    id: 'sponsor-offer',
    speaker: 'cityRep',
    prompt: "A regional brewery wants its name on the halfway house and its beer on the cart. They are offering to pay for the privilege.",
    when: (c) => c.prestige >= 35 && c.holesOpen >= 5,
    choices: [
      {
        stance: 'commercial',
        label: 'Take the deal',
        cost: 'They pay $620 a day for 18 days. Serious golfers think rather less of the place.',
        effects: {
          goodwill: { serious: -8, locals: 5 },
          condition: {
            id: 'sponsorship', label: 'Brewery sponsorship',
            note: 'Their name on the halfway house, their money in the till.',
            days: 18, dailyMoney: -620,
          },
        },
      },
      {
        stance: 'ambitious',
        label: 'Turn it down',
        cost: 'Costs the money, buys the reputation. Prestige up 5.',
        effects: { prestige: 5, goodwill: { serious: 6, locals: -3 } },
      },
    ],
  },

  {
    id: 'vandalism',
    speaker: 'starter',
    prompt: "Somebody drove something with wheels across the fifth green last night, twice, in a figure of eight.",
    when: (c) => c.day >= 18,
    choices: [
      {
        stance: 'thorough',
        label: 'Re-turf it and hire a night watch',
        cost: '$6,800 now and $380 a day for 12 days, and it does not happen again.',
        effects: {
          money: -6800,
          turf: -4,
          condition: {
            id: 'night-watch', label: 'Night watch',
            note: 'Somebody on the gate after dark.',
            days: 12, dailyMoney: 380,
          },
        },
      },
      {
        stance: 'thrifty',
        label: 'Repair it and hope',
        cost: '$1,500 and a 10-point hit to the turf. Whoever did it knows nothing happened.',
        effects: {
          money: -1500,
          turf: -10,
          condition: {
            id: 'repeat-visits', label: 'They came back',
            note: 'Nothing stopped them the first time.',
            days: 10, turfPerDay: -2.2,
          },
        },
      },
    ],
  },

  {
    id: 'slow-play-piece',
    speaker: 'press',
    prompt: "The local paper is writing about five-hour rounds in the county and somebody has given them your name.",
    when: (c) => c.slow === true,
    choices: [
      {
        stance: 'principled',
        label: 'Invite them to walk a round',
        cost: '$900 to comp the round and the lunch, and honest. If the course is genuinely slow they will write that, and it sticks for 8 days at about a fifth down.',
        effects: {
          money: -900,
          goodwill: { locals: 5 },
          condition: {
            id: 'slow-piece', label: 'Named in the paper',
            note: 'A piece about five-hour rounds, with your name in it.',
            days: 8, demandFactor: 0.78,
          },
        },
      },
      {
        stance: 'commercial',
        label: 'Decline the interview',
        cost: 'Free. They run it anyway, a refusal reads worse than an answer, and turnout is 30% down for 11 days.',
        effects: {
          prestige: -3,
          condition: {
            id: 'slow-piece', label: 'Declined to comment',
            note: 'The three worst words to see next to your own name.',
            days: 11, demandFactor: 0.7,
          },
        },
      },
    ],
  },

  {
    id: 'society-block-booking',
    speaker: 'societyRep',
    prompt: "Forty of us, every other Saturday, for the rest of the season. We would want a rate, and we would want the first two hours of the sheet.",
    when: (c) => c.holesOpen >= 7 && c.prestige >= 25,
    choices: [
      {
        stance: 'commercial',
        label: 'Take the block',
        cost: 'They pay $780 a day for 18 days. Saturday mornings belong to them, and the regulars notice.',
        effects: {
          goodwill: { locals: -9, serious: -4 },
          condition: {
            id: 'society-block', label: 'Society block booking',
            note: 'Forty of them on the sheet, and their money in it.',
            days: 18, dailyMoney: -780,
          },
        },
      },
      {
        stance: 'populist',
        label: 'Offer them midweek instead',
        cost: 'Less money and no resentment. They take it, grudgingly, at $300 a day for 18 days.',
        effects: {
          goodwill: { locals: 4 },
          condition: {
            id: 'society-block', label: 'Society midweek',
            note: 'Midweek, which suits everybody slightly less.',
            days: 18, dailyMoney: -300,
          },
        },
      },
      {
        stance: 'defiant',
        label: 'No blocks',
        cost: 'Costs the $780 a day. The regulars hear about it and like you for it — goodwill +8.',
        effects: { goodwill: { locals: 8 } },
      },
    ],
  },

  {
    id: 'cart-path-collapse',
    speaker: 'keeper',
    prompt: "The path along the back of the sixth has gone into the ditch it was built beside. It was always going to.",
    when: (c) => c.hasCart === true,
    choices: [
      {
        stance: 'thorough',
        label: 'Rebuild it properly',
        cost: '$7,600 and one hole out of play for four days.',
        effects: {
          money: -7600,
          condition: {
            id: 'path-works', label: 'Path rebuild',
            note: 'A hole shut while the path goes back in.',
            days: 4, holesClosed: 1,
          },
        },
      },
      {
        stance: 'thrifty',
        label: 'Rope it off',
        cost: 'Free. Carts go the long way for 13 days and the round gets slower for it.',
        effects: {
          condition: {
            id: 'path-detour', label: 'Carts detoured',
            note: 'The long way round, for everybody, all day.',
            days: 13, demandFactor: 0.84, turfPerDay: -1.4,
          },
        },
      },
    ],
  },

  {
    id: 'junior-programme',
    speaker: 'juniorRep',
    prompt: "We have twenty kids and nowhere to put them. Give us Tuesday afternoons and in ten years half of them are your members.",
    when: (c) => c.holesOpen >= 5,
    choices: [
      {
        stance: 'principled',
        label: 'Tuesdays are yours',
        cost: 'Costs $240 a day in lost sheet for 18 days, and buys the town outright.',
        effects: {
          goodwill: { locals: 12 },
          prestige: 2,
          condition: {
            id: 'junior-tuesdays', label: 'Junior programme',
            note: 'Tuesday afternoons belong to the kids.',
            days: 18, dailyMoney: 240,
          },
        },
      },
      {
        stance: 'commercial',
        label: 'Charge them a rate',
        cost: 'They pay their way, so nothing changes hands daily. Goodwill +3, and nobody is thrilled.',
        effects: { goodwill: { locals: 3 } },
      },
      {
        stance: 'thrifty',
        label: 'Not this season',
        cost: 'Free, and the town remembers being told no.',
        effects: { goodwill: { locals: -7 } },
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
