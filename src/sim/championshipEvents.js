import { effectAxes } from './events.js';
import { PINS } from './championshipWeek.js';

/**
 * The championship's own decision events (spec 2026-10-04 §4).
 *
 * Exactly the shape of `EVENTS` (events.js) -- id, speaker, prompt, `when`,
 * choices with label, cost, stance and effects -- so the existing decision
 * card shows them and `applyEventChoice` applies them. Two pools: seven for
 * the run-up and nine for the week itself, marked by `phase`. When they
 * fire is the rhythm's business (spec §4 "The rhythm"); this file is only
 * what they say and do.
 *
 * Effects are the four every event has -- money, prestige, turf, one
 * segment's goodwill -- and three that only a championship has a use for:
 *
 *   setup                  points on or off the course's setup, now.
 *   nextRound.handicap     handicap points on the field for the next round
 *                          only, on the pins' own scale (harder is +).
 *   nextRound.pace         a multiplier on the next round's time.
 *
 * `nextRound` is for week events only: a run-up evening is days from any
 * round. No `condition` and no `fallout` here, deliberately: a run-up is
 * three weeks long and a week is two to four days, and a month-long
 * condition or a reckoning a fortnight later would outlive the thing it was
 * about, landing on a resort that has gone back to being a resort.
 *
 * Magnitudes, and why:
 *
 * - Money is a few thousand dollars, on the scale of one or two days of a
 *   rung's prep bill (`prepPerDay`: County $1,600, Regional $3,200,
 *   National $5,400). An event does not know the rung's bill, so the
 *   figures are pitched to read as a real sum at the County and still as a
 *   decision at the National, where the bank is bigger but so is every
 *   other number on the card.
 * - Setup moves at most 8 and mostly 2-5. A six-keeper crew climbs 4.8 a
 *   day (SETUP_PER_KEEPER 0.8), so these are a day or so of the crew's
 *   work: a choice that costs setup in the run-up costs days of the climb
 *   and the prep bill that comes with them. In the week, a course knocked
 *   below its target climbs back from the next morning and one pushed
 *   above it eases back 3.5 a day (`nextSetup`), so a week event's setup
 *   is mostly that night's and the next round's.
 * - The next round's handicap is always half or a whole pin setting
 *   (0.375 or 0.75), so the card can say it in the unit the player sets
 *   every morning, exactly, rather than as a stroke estimate that would be
 *   wrong on half the seeds. For scale: the pins' full 2.25 span moved the
 *   field 1.92 strokes a round over 200 seed pairs (tests/field.test.js),
 *   so half a setting is about a third of a stroke per player per round.
 * - Pace runs 2-8% slower. A Regional round is about 290 minutes against a
 *   288 target, so 3% is nine minutes -- enough to tip a round over the
 *   officials' line on a wet day, not enough to fail a dry one alone.
 *
 * Written nameless: the field is weather with a scorecard (field.js), and
 * "the player half the gallery came to see" is as close as it gets.
 */

/** Days wet enough to put water where it should not be. */
const SOAKING = new Set(['rain', 'storm']);
const WET = new Set(['drizzle', 'rain', 'storm']);

export const CHAMPIONSHIP_EVENTS = [
  // --- The run-up --------------------------------------------------------

  {
    id: 'champ-greens-mower',
    phase: 'runUp',
    speaker: 'keeper',
    prompt: 'The greens mower has seized with the course half firmed. Fast greens are cut greens, and until it is fixed nobody is cutting them.',
    when: () => true,
    choices: [
      {
        stance: 'thorough',
        label: 'Hire one in today',
        cost: '$3,200 for a hire machine and a fitter, and the crew does not lose a day.',
        effects: { money: -3200 },
      },
      {
        stance: 'pragmatic',
        label: 'Cut them with the fairway mower',
        cost: '$600 in new blades. It tears the greens a little: turf -4, setup -3.',
        effects: { money: -600, turf: -4, setup: -3 },
      },
      {
        stance: 'thrifty',
        label: 'Wait for the part',
        cost: 'Free, and four days without a proper cut: setup -7, which the crew then has to climb back.',
        effects: { setup: -7 },
      },
    ],
  },

  {
    id: 'champ-sponsor-signage',
    phase: 'runUp',
    speaker: 'sponsor',
    prompt: 'The sponsor would like a hoarding on the 18th tee, facing the clubhouse, roughly the size of a bus.',
    when: () => true,
    choices: [
      {
        stance: 'commercial',
        label: 'Put it up',
        cost: 'They pay $5,000. The officials think less of a finishing hole with a bus parked on it: prestige -3.',
        effects: { money: 5000, prestige: -3 },
      },
      {
        stance: 'pragmatic',
        label: 'Offer them the walk to the 1st',
        cost: 'They pay $1,800 for the smaller spot, and nobody minds.',
        effects: { money: 1800 },
      },
      {
        stance: 'ambitious',
        label: 'Keep the 18th clean',
        cost: 'Turns down their $5,000. Nothing leaves the bank, and the last hole looks like one: prestige +2, serious goodwill +4.',
        effects: { prestige: 2, goodwill: { serious: 4 } },
      },
    ],
  },

  {
    id: 'champ-members-day',
    phase: 'runUp',
    speaker: 'members',
    prompt: 'The members would like one last Saturday of their own before the course is set up for the championship. They point out, correctly, that it is their club.',
    when: () => true,
    choices: [
      {
        stance: 'populist',
        label: 'Give them the day, on the house',
        cost: '$1,900 in green fees not collected, and a full sheet on greens being firmed: setup -4. Locals goodwill +10.',
        effects: { money: -1900, setup: -4, goodwill: { locals: 10 } },
      },
      {
        stance: 'pragmatic',
        label: 'A members’ evening, nine holes',
        cost: '$700 in fees waived for a short evening: setup -1, locals goodwill +4.',
        effects: { money: -700, setup: -1, goodwill: { locals: 4 } },
      },
      {
        stance: 'defiant',
        label: 'Not this close to the week',
        cost: 'Free, and nobody walks on the greens who does not have to. Locals goodwill -8.',
        effects: { goodwill: { locals: -8 } },
      },
    ],
  },

  {
    id: 'champ-tv-scout',
    phase: 'runUp',
    speaker: 'broadcaster',
    prompt: 'A television scout walked all eighteen this morning with a clipboard and a cameraman. The clipboard said nothing. The cameraman said the 16th looks soft on screen.',
    // A National has its television already; this is a smaller rung being
    // looked at for the first time.
    when: (c) => c.championship?.rung !== 'national',
    choices: [
      {
        stance: 'ambitious',
        label: 'Firm it up for the cameras',
        cost: '$2,800 in crew overtime: setup +4 now, and prestige +3 when the scout’s report goes in.',
        effects: { money: -2800, setup: 4, prestige: 3 },
      },
      {
        stance: 'commercial',
        label: 'Sell them a gantry behind the 16th',
        cost: 'They pay $3,500 for the spot, and the crew works round the scaffolding: setup -2.',
        effects: { money: 3500, setup: -2 },
      },
      {
        stance: 'thrifty',
        label: 'Let the course speak for itself',
        cost: 'Free. The scout leaves with the clipboard: prestige -1.',
        effects: { prestige: -1 },
      },
    ],
  },

  {
    id: 'champ-drought',
    phase: 'runUp',
    speaker: 'keeper',
    prompt: 'A dry spell, and the irrigation has been running all night to keep the greens alive. The pump was not built for it, and the pump has started to say so.',
    when: (c) => !WET.has(c.weather),
    choices: [
      {
        stance: 'thorough',
        label: 'Hire a second pump',
        cost: '$2,600 for a pump and a bowser, and the greens drink what they want: turf +4.',
        effects: { money: -2600, turf: 4 },
      },
      {
        stance: 'thrifty',
        label: 'Water the greens and let the fairways go',
        cost: 'Free. Firm fairways are no bad thing this close to a championship: setup +3. The rough browns: turf -5.',
        effects: { setup: 3, turf: -5 },
      },
      {
        stance: 'pragmatic',
        label: 'Buy water from the town',
        cost: '$1,200 to the water board, during a hosepipe ban: turf +1, locals goodwill -4.',
        effects: { money: -1200, turf: 1, goodwill: { locals: -4 } },
      },
    ],
  },

  {
    id: 'champ-thicker-rough',
    phase: 'runUp',
    speaker: 'officials',
    prompt: 'The officials have walked the course and would like the rough thicker — ankle-deep by the first morning — and would like that in writing.',
    when: () => true,
    choices: [
      {
        stance: 'thorough',
        label: 'Grow it and feed it',
        cost: '$2,200 in feed and an extra cut a week: setup +5, prestige +2.',
        effects: { money: -2200, setup: 5, prestige: 2 },
      },
      {
        stance: 'pragmatic',
        label: 'Grow it and leave it',
        cost: 'Free: setup +3. Rough left to itself creeps into the fairways: turf -4.',
        effects: { setup: 3, turf: -4 },
      },
      {
        stance: 'defiant',
        label: 'The rough is fine as it is',
        cost: 'Free. Nothing changes on the course, and the officials make a note: prestige -3.',
        effects: { prestige: -3 },
      },
    ],
  },

  {
    id: 'champ-car-park',
    phase: 'runUp',
    speaker: 'lane',
    prompt: 'The houses on the lane have seen the plans for the championship car park and have written, jointly, to say that they have seen the plans for the championship car park.',
    when: () => true,
    choices: [
      {
        stance: 'thorough',
        label: 'Run buses from the station',
        cost: '$3,000 for buses all week, and the lane stays a lane. Locals goodwill +6.',
        effects: { money: -3000, goodwill: { locals: 6 } },
      },
      {
        stance: 'pragmatic',
        label: 'Plant a hedge and promise a quiet week',
        cost: '$900 for a hedge that will be a hedge in about four years. Locals goodwill +2.',
        effects: { money: -900, goodwill: { locals: 2 } },
      },
      {
        stance: 'defiant',
        label: 'Park them in the field anyway',
        cost: 'Free, and the lane writes to the Gazette: prestige -2, locals goodwill -7.',
        effects: { prestige: -2, goodwill: { locals: -7 } },
      },
    ],
  },

  // --- The week ------------------------------------------------------------
  //
  // Each fires on an evening before a round (the eve of round 1, or a
  // round day that is not the last), so "the next round" is tomorrow's.

  {
    id: 'champ-flooded-green',
    phase: 'week',
    speaker: 'keeper',
    prompt: 'Today’s rain has left standing water on the 11th green, and tomorrow’s first group is due on it at half past eight.',
    when: (c) => SOAKING.has(c.weather),
    choices: [
      {
        stance: 'thorough',
        label: 'Squeegee it through the night',
        cost: '$2,400 for a night crew. The green is ready by morning, if tired: turf -3.',
        effects: { money: -2400, turf: -3 },
      },
      {
        stance: 'pragmatic',
        label: 'Cut the hole on the dry side',
        cost: 'Free. The dry side is the easy side: the next round plays half a pin setting easier.',
        effects: { nextRound: { handicap: -0.375 } },
      },
      {
        stance: 'defiant',
        label: 'Play it as it lies',
        cost: 'Free, and every group waits while the officials argue about casual water: the next round runs 8% slower.',
        effects: { nextRound: { pace: 1.08 } },
      },
    ],
  },

  {
    id: 'champ-pin-complaint',
    phase: 'week',
    speaker: 'officials',
    prompt: 'A player has complained about the hole on the 7th — loudly, and near a microphone. The officials would like to know whether it is moving.',
    when: () => true,
    choices: [
      {
        stance: 'pragmatic',
        label: 'Move it somewhere kinder',
        cost: 'Free. The next round plays half a pin setting easier, and the press calls it a climbdown: prestige -2.',
        effects: { prestige: -2, nextRound: { handicap: -0.375 } },
      },
      {
        stance: 'defiant',
        label: 'It stays where it is',
        cost: 'Free, and prestige +2 for standing by the course. The field takes it up with every referee: the next round runs 5% slower.',
        effects: { prestige: 2, nextRound: { pace: 1.05 } },
      },
      {
        stance: 'principled',
        label: 'Let the officials rule on it',
        cost: '$800 for a rules panel and a late night. The next round plays as set: prestige +1.',
        effects: { money: -800, prestige: 1 },
      },
    ],
  },

  {
    id: 'champ-tv-tee-times',
    phase: 'week',
    speaker: 'broadcaster',
    prompt: 'Television would like tomorrow’s last groups off two hours later, so the finish lands in the evening slot. They are offering to make it worth your while.',
    // A County Open has a local paper, not a broadcaster.
    when: (c) => c.championship?.rung !== 'countyOpen',
    choices: [
      {
        stance: 'commercial',
        label: 'Push the tee times back',
        cost: 'They pay $6,000. The cameras hold on every putt: the next round runs 6% slower.',
        effects: { money: 6000, nextRound: { pace: 1.06 } },
      },
      {
        stance: 'pragmatic',
        label: 'Move the last six groups only',
        cost: 'They pay $2,500, and the next round runs 2% slower.',
        effects: { money: 2500, nextRound: { pace: 1.02 } },
      },
      {
        stance: 'principled',
        label: 'Tee times stay where the officials put them',
        cost: 'Turns down their $6,000. Nothing leaves the bank, and the officials notice: prestige +2.',
        effects: { prestige: 2 },
      },
    ],
  },

  {
    id: 'champ-heatwave',
    phase: 'week',
    speaker: 'keeper',
    prompt: 'The sun has been on the greens all day and they are going from firm to glass. Tomorrow they will be quicker than anything this field has putted on.',
    when: (c) => c.weather === 'clear',
    choices: [
      {
        stance: 'thorough',
        label: 'Syringe them through the night',
        cost: '$1,800 in overtime to keep them alive: turf +3, setup -2.',
        effects: { money: -1800, turf: 3, setup: -2 },
      },
      {
        stance: 'ambitious',
        label: 'Let them bake',
        cost: 'Free. Setup +4 and the next round plays half a pin setting harder, and the greens pay for it: turf -6.',
        effects: { setup: 4, turf: -6, nextRound: { handicap: 0.375 } },
      },
      {
        stance: 'pragmatic',
        label: 'A light watering at dawn',
        cost: '$500 for an early crew, and the greens hold as they are.',
        effects: { money: -500 },
      },
    ],
  },

  {
    id: 'champ-rope-line',
    phase: 'week',
    speaker: 'gus',
    prompt: 'The gallery on the 17th leaned on the rope line until it stopped being a line. There are footprints across the approach and a marshal with a sprained wrist.',
    when: () => true,
    choices: [
      {
        stance: 'thorough',
        label: 'Stake it properly and double the marshals',
        cost: '$2,200 for posts and eight more marshals. What is done is done: turf -2.',
        effects: { money: -2200, turf: -2 },
      },
      {
        stance: 'pragmatic',
        label: 'Move the line back ten yards',
        cost: 'Free, but the crowd now stands in the rough: turf -5, and the next round runs 3% slower while they shuffle along it.',
        effects: { turf: -5, nextRound: { pace: 1.03 } },
      },
      {
        stance: 'commercial',
        label: 'Make the 17th ticket-only',
        cost: 'Ticket holders pay you $1,500, and the rest are turned away: turf -2, locals goodwill -5.',
        effects: { money: 1500, turf: -2, goodwill: { locals: -5 } },
      },
    ],
  },

  {
    id: 'champ-withdrawal',
    phase: 'week',
    speaker: 'press',
    prompt: 'The player half the gallery came to see has withdrawn with a bad back. Fairway Monthly would like to know what the course is going to do about the gallery.',
    when: () => true,
    choices: [
      {
        stance: 'principled',
        label: 'Refund the day tickets',
        cost: '$3,000 back to the gallery, and nobody leaves angry: locals goodwill +5, destination goodwill +3.',
        effects: { money: -3000, goodwill: { locals: 5, destination: 3 } },
      },
      {
        stance: 'populist',
        label: 'Give the crowd some birdies',
        cost: 'Free. The next round plays half a pin setting easier, which is what the crowd came for: locals goodwill +3, but prestige -2.',
        effects: { prestige: -2, goodwill: { locals: 3 }, nextRound: { handicap: -0.375 } },
      },
      {
        stance: 'thrifty',
        label: 'Say nothing',
        cost: 'Free, and the stands are half empty tomorrow: prestige -1, destination goodwill -6.',
        effects: { prestige: -1, goodwill: { destination: -6 } },
      },
    ],
  },

  {
    id: 'champ-scoreboard',
    phase: 'week',
    speaker: 'starter',
    prompt: 'The main scoreboard by the 18th has gone dark, and the gallery has started keeping score on the backs of programmes.',
    when: () => true,
    choices: [
      {
        stance: 'thorough',
        label: 'Bring in a replacement overnight',
        cost: '$4,500 for a board and a crew by morning: prestige +1.',
        effects: { money: -4500, prestige: 1 },
      },
      {
        stance: 'pragmatic',
        label: 'Runners with chalkboards',
        cost: '$600 for twenty runners, and every green waits on them: the next round runs 4% slower.',
        effects: { money: -600, nextRound: { pace: 1.04 } },
      },
      {
        stance: 'thrifty',
        label: 'Do without',
        cost: 'Free. Nobody knows who is leading, and the press enjoys that: prestige -3, destination goodwill -4.',
        effects: { prestige: -3, goodwill: { destination: -4 } },
      },
    ],
  },

  {
    id: 'champ-drop-zone',
    phase: 'week',
    speaker: 'officials',
    prompt: 'A rules official has walked the 14th and does not like the drop zone by the water. Where it is, the field gets a drop most of them would pay for.',
    when: () => true,
    choices: [
      {
        stance: 'thorough',
        label: 'Re-mark it tonight',
        cost: '$900 for paint, a surveyor and a late finish, and the 14th plays as it was built.',
        effects: { money: -900 },
      },
      {
        stance: 'pragmatic',
        label: 'Leave it where it is',
        cost: 'Free. The next round plays half a pin setting easier for it.',
        effects: { nextRound: { handicap: -0.375 } },
      },
      {
        stance: 'ambitious',
        label: 'Take the drop zone away',
        cost: 'Free: prestige +1, and the 14th becomes the hole everyone talks about. The next round plays half a pin setting harder and runs 3% slower.',
        effects: { prestige: 1, nextRound: { handicap: 0.375, pace: 1.03 } },
      },
    ],
  },

  {
    id: 'champ-sponsor-tent',
    phase: 'week',
    speaker: 'sponsor',
    prompt: 'Today’s rain came straight through the roof of the hospitality tent, and two hundred guests are due in it for lunch tomorrow.',
    when: (c) => SOAKING.has(c.weather),
    choices: [
      {
        stance: 'thorough',
        label: 'A new marquee by morning',
        cost: '$4,000 for a marquee and a crew through the night. The sponsor is delighted: prestige +2.',
        effects: { money: -4000, prestige: 2 },
      },
      {
        stance: 'pragmatic',
        label: 'Lunch in the clubhouse',
        cost: 'Free, and the members lose their clubhouse for a day and say so: locals goodwill -6.',
        effects: { goodwill: { locals: -6 } },
      },
      {
        stance: 'commercial',
        label: 'Pitch it on the practice ground',
        cost: 'The sponsor pays you $1,000 for the ground, and every group squeezes past the tent to the 1st tee: the next round runs 3% slower.',
        effects: { money: 1000, nextRound: { pace: 1.03 } },
      },
    ],
  },
];

/**
 * A choice's effects as one vector, for comparing choices in the same event
 * (the dominated-choice test). `effectAxes` for the four every event has,
 * plus the championship's three:
 *
 * - `setup` is ORDERED, more is better: the run-up is a climb, and a
 *   week's course is held at its target, so points lost are days of work.
 * - `nextRound.pace` is ORDERED, quicker is better (stored negated, so
 *   larger is better like every other axis): officials judge the pace.
 * - `nextRound.handicap` is NOT: a harder round helps a week heading under
 *   its target and hurts one heading over, so two choices that move it
 *   differently are never comparable on it.
 */
export function championshipAxes(effects = {}) {
  return {
    ...effectAxes(effects),
    setup: effects.setup ?? 0,
    'nextRound.pace': -((effects.nextRound?.pace ?? 1) - 1),
    'nextRound.handicap': effects.nextRound?.handicap ?? 0,
  };
}

/** Larger is better on each of these. */
export const ORDERED_AXES = Object.freeze([
  'money', 'prestige', 'turf', 'disruption',
  'goodwill.locals', 'goodwill.serious', 'goodwill.destination',
  'setup', 'nextRound.pace',
]);

/** Neither direction is better on these. */
export const UNORDERED_AXES = Object.freeze(['nextRound.handicap']);

/** One step between neighbouring pin settings, in handicap points. */
const PIN_STEP = PINS.tough.handicap - PINS.fair.handicap;

/**
 * How a card says a next-round handicap: "half a pin setting easier",
 * "a whole pin setting harder". The library only uses half and whole
 * steps; anything else is spelled as a number of settings.
 */
export function pinSettingPhrase(handicap) {
  const steps = Math.abs(handicap) / PIN_STEP;
  const way = handicap > 0 ? 'harder' : 'easier';
  if (steps === 0.5) return `half a pin setting ${way}`;
  if (steps === 1) return `a whole pin setting ${way}`;
  return `${steps} pin settings ${way}`;
}

/** How a card says a next-round pace: "8% slower", "5% quicker". */
export function pacePhrase(pace) {
  const percent = Math.round(Math.abs(pace - 1) * 100);
  return `${percent}% ${pace > 1 ? 'slower' : 'quicker'}`;
}
