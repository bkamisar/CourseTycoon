import { effectAxes } from './events.js';
import { PINS } from './championshipWeek.js';
import { RUNGS } from './tournaments.js';
import { PRACTICE_DAYS_BEFORE } from './practiceRound.js';

/**
 * The championship's own decision events (spec 2026-10-04 §4).
 *
 * The shape of `EVENTS` (events.js) -- id, speaker, prompt, `when`, choices
 * with label, cost, stance and effects -- so the existing decision card
 * shows them and `applyEventChoice` applies them. Two pools: seven for the
 * run-up and nine for the week itself, marked by `phase`. When they fire is
 * the rhythm's business (spec §4 "The rhythm"); this file is only what they
 * say and do.
 *
 * Effects are three every event has -- prestige, turf, one segment's
 * goodwill -- plus four only a championship has a use for:
 *
 *   moneyDays              money, in days of the booked rung's prep bill
 *                          (below). Positive is paid to the resort.
 *   setup                  points on or off the course's setup, now.
 *   nextRound.handicap     handicap points on the field for the next round
 *                          only, on the pins' own scale (harder is +).
 *   nextRound.pace         a multiplier on every hole of the next round.
 *
 * `nextRound` is for week events only: a run-up evening is days from any
 * round. No `condition` and no `fallout` here, deliberately: a run-up is
 * three weeks long and a week is two to four days, and a month-long
 * condition or a reckoning a fortnight later would outlive the thing it was
 * about, landing on a resort that has gone back to being a resort.
 *
 * MONEY IS IN PREP DAYS. A flat $3,000 was a real sum at the County and
 * nothing at the National, where the bank and every other figure on the
 * card is four times bigger. So money is `moneyDays` x the booked rung's
 * `prepPerDay` (County $1,600, Regional $3,200, National $5,400), and a
 * cost line says `{money}` (this choice's sum) or `{days:N}` (N days' worth,
 * for "turns down their {days:3}"). `resolveChoice` fills both in, and it is
 * the one function the card (`pendingEventFor` in day.js) and the
 * simulation (`applyEventChoice`) both call, so the figure the player reads
 * is the figure the bank moves by.
 *
 * Setup moves at most 8 and mostly 2-5. A six-keeper crew climbs 4.8 a day
 * (SETUP_PER_KEEPER 0.8), so these are a day or so of the crew's work. In
 * the week a course knocked below its target climbs back from the next
 * morning and one pushed above it eases back 3.5 a day (`nextSetup`), so a
 * week event's setup is mostly that night's and the next round's.
 *
 * The next round's handicap is always half or a whole pin setting (0.375
 * or 0.75), so the card says it in the unit the player sets every morning,
 * exactly. For scale: the pins' full 2.25 span moved the field 1.92
 * strokes a round over 200 seed pairs (tests/field.test.js).
 *
 * PACE, MEASURED (2026-10-04, `playField`, 18 holes, 20 seeds, pace target
 * 288 minutes). An event's pace stretches every hole before the tee sheet
 * is scheduled, so on a tight interval the field backs up behind it and
 * the round grows by MORE than the card's figure; on a wide one, by
 * exactly it. Hence the card says "every hole plays N% slower", which is
 * what is applied, not "the round runs N% slower", which it is not.
 *
 *   round lengthened by, and rounds over 288 of 20, setup 70 (Regional):
 *   interval, sky     +2%          +3%          +5%          +6%       +8%
 *   14, fair          3.0%  0      4.5%  0      7.5%  8      9.0% 17   12.0% 20
 *   14, drizzle       3.0%  8      4.4% 20      7.4% 20      8.9% 20   11.8% 20
 *   18, blowing       3.3%  0      4.9%  0      8.2%  8      9.9% 17   13.2% 20
 *   22, fair          2.0%  0      3.0%  0      5.0%  0      6.0%  0    8.0%  0
 *   22, heavy rain    2.0%  0      3.0%  0      5.0%  2      6.0% 17    8.1% 20
 *
 *   (The percentages are against the same sky with no event.) At setup 86
 *   (National) everything is slower: at 22 in heavy rain +3% fails 2/20,
 *   +4% 9/20, +5% 20/20; at 14 in fair weather +4% fails 13/20. Up to +8%
 *   never failed a fair-weather round at 18 or 22; wind or drizzle at 18,
 *   and heavy rain at 22, are where it bites. (Heavy rain at 18 fails
 *   every round at setup 70 with no event at all.)
 *
 * So whether a pace choice risks the contract's pace bonus (County
 * $26,200, Regional $66,400, National $142,400 -- `contractFor`, judged on
 * every round) depends on two things the player can see the evening it is
 * asked: their tee interval (on the sheet) and tomorrow's forecast (on the
 * report). That is what makes these judgement calls rather than traps, and
 * they were re-pitched (2026-10-04, after review) to keep them that way:
 *
 * - Free choices that only cost pace cost little of it (2-4%): they are the
 *   "do nothing" answers, and at 22 in the dry they genuinely cost nothing,
 *   while at 14, or in rain, they are the reason to pay.
 * - The one choice that sells pace (television's later tee times, Regional
 *   and National only) pays 5 prep days for 5% -- $16,000 against a $66,400
 *   bonus, $27,000 against $142,400: about a fifth of what it risks. At 22
 *   in the dry it is free money; in heavy rain at the National it is very
 *   nearly a certain $142,400 lost for $27,000. The forecast decides.
 * - First drafts had 6% and 8% for free and 6% for $6,000 flat; at a
 *   14-minute interval in fair weather those failed 17/20 and 20/20 rounds,
 *   which is a trap with a cost line on it.
 *
 * Turf: the contract pays its turf bonus (County $35,370, Regional $89,640,
 * National $192,240) on the turf the week ends on, against 78. Week turf
 * hits are kept to 2-4 points, and the one free choice that trades turf for
 * something the player may want (letting the greens bake in a heatwave)
 * also pays in prestige, so it is a bet on how much margin the greens have
 * -- which the HUD shows -- rather than a hidden tax.
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
        cost: '{money} for a hire machine and a fitter, and the crew does not lose a day.',
        effects: { moneyDays: -2 },
      },
      {
        stance: 'pragmatic',
        label: 'Cut them with the fairway mower',
        cost: '{money} in new blades. It tears the greens a little: turf -4, setup -3.',
        effects: { moneyDays: -0.5, turf: -4, setup: -3 },
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
        cost: 'They pay {money}. The officials think less of a finishing hole with a bus parked on it: prestige -3.',
        effects: { moneyDays: 3, prestige: -3 },
      },
      {
        stance: 'pragmatic',
        label: 'Offer them the walk to the 1st',
        cost: 'They pay {money} for the smaller spot, and nobody minds.',
        effects: { moneyDays: 1 },
      },
      {
        stance: 'ambitious',
        label: 'Keep the 18th clean',
        cost: 'Turns down their {days:3}. Nothing leaves the bank, and the last hole looks like one: prestige +2, serious goodwill +4.',
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
        cost: '{money} in green fees not collected, and a full sheet on greens being firmed: setup -4. Locals goodwill +10.',
        effects: { moneyDays: -1, setup: -4, goodwill: { locals: 10 } },
      },
      {
        stance: 'pragmatic',
        label: 'A members’ evening, nine holes',
        cost: '{money} in fees waived for a short evening: setup -1, locals goodwill +4.',
        effects: { moneyDays: -0.5, setup: -1, goodwill: { locals: 4 } },
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
        cost: '{money} in crew overtime: setup +4 now, and prestige +3.',
        effects: { moneyDays: -1.5, setup: 4, prestige: 3 },
      },
      {
        stance: 'commercial',
        label: 'Sell them a gantry behind the 16th',
        cost: 'They pay {money} for the spot, and the crew works round the scaffolding: setup -2.',
        effects: { moneyDays: 2, setup: -2 },
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
        cost: '{money} for a pump and a bowser, and the greens drink what they want: turf +4.',
        effects: { moneyDays: -1.5, turf: 4 },
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
        cost: '{money} to the water board, during a hosepipe ban: turf +1, locals goodwill -4.',
        effects: { moneyDays: -0.75, turf: 1, goodwill: { locals: -4 } },
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
        cost: '{money} in feed and an extra cut a week: setup +5, prestige +2.',
        effects: { moneyDays: -1.5, setup: 5, prestige: 2 },
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
        cost: '{money} for buses all week, and the lane stays a lane. Locals goodwill +6.',
        effects: { moneyDays: -2, goodwill: { locals: 6 } },
      },
      {
        stance: 'pragmatic',
        label: 'Plant a hedge and promise a quiet week',
        cost: '{money} for a hedge that will be a hedge in about four years. Locals goodwill +2.',
        effects: { moneyDays: -0.5, goodwill: { locals: 2 } },
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
        cost: '{money} for a night crew. The green is ready by morning, if tired: turf -2.',
        effects: { moneyDays: -1.5, turf: -2 },
      },
      {
        stance: 'pragmatic',
        label: 'Cut the hole on the dry side',
        cost: 'Free. The dry side is the easy side: the next round plays half a pin setting easier.',
        effects: { nextRound: { handicap: -0.375 } },
      },
      {
        // Keeps the round as hard as it was set, for nothing but time: the
        // answer for a week heading under its target on a wide tee sheet.
        stance: 'defiant',
        label: 'Play it as it lies',
        cost: 'Free, and the round plays as set while the officials rule on casual water: every hole plays 4% slower, and a tight tee sheet backs up behind it.',
        effects: { nextRound: { pace: 1.04 } },
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
        cost: 'Free, and prestige +2 for standing by the course. The field takes it up with every referee: every hole plays 3% slower.',
        effects: { prestige: 2, nextRound: { pace: 1.03 } },
      },
      {
        stance: 'principled',
        label: 'Let the officials rule on it',
        cost: '{money} for a rules panel and a late night. The next round plays as set: prestige +1.',
        effects: { moneyDays: -0.5, prestige: 1 },
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
        // Five prep days for 5%: about a fifth of the pace bonus it puts at
        // risk. See PACE, MEASURED above for when that risk is real.
        stance: 'commercial',
        label: 'Push the tee times back',
        cost: 'They pay {money}. The cameras hold on every putt: every hole plays 5% slower, and a tight tee sheet backs up behind it.',
        effects: { moneyDays: 5, nextRound: { pace: 1.05 } },
      },
      {
        stance: 'pragmatic',
        label: 'Move the last six groups only',
        cost: 'They pay {money}, and every hole plays 2% slower.',
        effects: { moneyDays: 2, nextRound: { pace: 1.02 } },
      },
      {
        stance: 'principled',
        label: 'Tee times stay where the officials put them',
        cost: 'Turns down their {days:5}. Nothing leaves the bank, and the officials notice: prestige +2.',
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
        cost: '{money} in overtime to keep them alive: turf +3, setup -2.',
        effects: { moneyDays: -1, turf: 3, setup: -2 },
      },
      {
        stance: 'ambitious',
        label: 'Let them bake',
        cost: 'Free, and the greens everyone talks about: prestige +2, setup +4, and the next round plays half a pin setting harder. They pay for it: turf -4.',
        effects: { prestige: 2, setup: 4, turf: -4, nextRound: { handicap: 0.375 } },
      },
      {
        stance: 'pragmatic',
        label: 'A light watering at dawn',
        cost: '{money} for an early crew, and the greens hold as they are.',
        effects: { moneyDays: -0.25 },
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
        cost: '{money} for posts and eight more marshals. What is done is done: turf -2.',
        effects: { moneyDays: -1.5, turf: -2 },
      },
      {
        stance: 'pragmatic',
        label: 'Move the line back ten yards',
        cost: 'Free, but the crowd now stands in the rough: turf -4, and every hole plays 2% slower while they shuffle along it.',
        effects: { turf: -4, nextRound: { pace: 1.02 } },
      },
      {
        stance: 'commercial',
        label: 'Make the 17th ticket-only',
        cost: 'Ticket holders pay you {money}, and the rest are turned away: turf -2, locals goodwill -5.',
        effects: { moneyDays: 1, turf: -2, goodwill: { locals: -5 } },
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
        cost: '{money} back to the gallery, and nobody leaves angry: locals goodwill +5, destination goodwill +3.',
        effects: { moneyDays: -2, goodwill: { locals: 5, destination: 3 } },
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
        cost: '{money} for a board and a crew by morning: prestige +1.',
        effects: { moneyDays: -2.5, prestige: 1 },
      },
      {
        stance: 'pragmatic',
        label: 'Runners with chalkboards',
        cost: '{money} for twenty runners, and every green waits on them: every hole plays 3% slower.',
        effects: { moneyDays: -0.5, nextRound: { pace: 1.03 } },
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
        cost: '{money} for paint, a surveyor and a late finish, and the 14th plays as it was built.',
        effects: { moneyDays: -0.5 },
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
        cost: 'Free: prestige +1, and the 14th becomes the hole everyone talks about. The next round plays half a pin setting harder, and every hole plays 2% slower.',
        effects: { prestige: 1, nextRound: { handicap: 0.375, pace: 1.02 } },
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
        cost: '{money} for a marquee and a crew through the night. The sponsor is delighted: prestige +2.',
        effects: { moneyDays: -2.5, prestige: 2 },
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
        cost: 'The sponsor pays you {money} for the ground, and every group squeezes past the tent to the 1st tee: every hole plays 2% slower.',
        effects: { moneyDays: 1.5, nextRound: { pace: 1.02 } },
      },
    ],
  },
];

// --- Resolving a choice against the booked rung ---------------------------

/**
 * The rung whose prep bill a championship choice is priced in. A choice is
 * only ever offered with a championship booked; the County's bill is the
 * fallback so a choice answered without one (a save edited by hand, a
 * test) prices at the smallest figure rather than throwing.
 */
function prepPerDayFor(rungId) {
  return (RUNGS[rungId] ?? RUNGS.countyOpen).prepPerDay;
}

/** Whole dollars, as a card prints them. */
function dollars(n) {
  return `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

/**
 * A choice as the card shows it and the simulation applies it, at a rung.
 *
 * `moneyDays` becomes `money` (days x the rung's `prepPerDay`, rounded to a
 * dollar), and the cost's `{money}` and `{days:N}` are filled in with the
 * same arithmetic. The card (`pendingEventFor` in day.js) and
 * `applyEventChoice` both call this, so they cannot disagree about a sum.
 * An ordinary event's choice has neither and comes back unchanged.
 */
export function resolveChoice(choice, rungId) {
  const perDay = prepPerDayFor(rungId);
  const { moneyDays, ...rest } = choice.effects ?? {};
  const effects = moneyDays === undefined
    ? { ...rest }
    : { ...rest, money: Math.round(moneyDays * perDay) };
  const cost = choice.cost
    .replace(/\{money\}/g, dollars(effects.money ?? 0))
    .replace(/\{days:([\d.]+)\}/g, (_, n) => dollars(Number(n) * perDay));
  return { ...choice, cost, effects };
}

// --- Comparing choices, and saying them -----------------------------------

/**
 * A choice's effects as one vector, for comparing choices in the same event
 * (the dominated-choice test), from its resolved effects. `effectAxes` for
 * the four every event has, plus the championship's three:
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
 * "a whole pin setting harder". Each choice uses half or whole steps; a sum
 * of two (the sheet's pending line) can be anything, spelled as a number.
 */
export function pinSettingPhrase(handicap) {
  const steps = Math.abs(handicap) / PIN_STEP;
  const way = handicap > 0 ? 'harder' : 'easier';
  if (steps === 0.5) return `half a pin setting ${way}`;
  if (steps === 1) return `a whole pin setting ${way}`;
  return `${Number(steps.toFixed(2))} pin settings ${way}`;
}

/**
 * How a card says a next-round pace: "every hole plays 4% slower". Every
 * HOLE, because that is what is applied; the round grows by more on a
 * tight tee sheet (see PACE, MEASURED above).
 */
export function pacePhrase(pace) {
  const percent = Math.round(Math.abs(pace - 1) * 100);
  return `every hole plays ${percent}% ${pace > 1 ? 'slower' : 'quicker'}`;
}

/**
 * What tonight's events have done to the next round, in one line for the
 * championship sheet, or null when nothing is pending. Built from the same
 * phrases as the cards, so the sheet cannot word it differently from the
 * choice that caused it.
 */
export function pendingEffectNote({ eventHandicap = 0, eventPace = 1 } = {}) {
  const parts = [];
  if (eventHandicap) parts.push(`it plays ${pinSettingPhrase(eventHandicap)}`);
  if (eventPace !== 1) parts.push(pacePhrase(eventPace));
  if (parts.length === 0) return null;
  // Said without a when: the sheet shows it the evening the card was
  // answered and again the next morning, and "last night" was wrong for
  // the first of those.
  return `Called for this round: ${parts.join(', and ')}.`;
}

// --- The rhythm (spec §4 "The rhythm") ------------------------------------

/**
 * The seed a booking's event plan is drawn from: the save's seed and the
 * first round's day, which no two bookings share (a barred rung retried is
 * a new first round). Its own seed rather than the day's rng, so drawing
 * the plan moves no other number in the day it is drawn on (the same
 * reasoning as `practiceSeed`, practiceRound.js). The multipliers are
 * swapped from `practiceSeed`'s and the offset differs, so the two never
 * land on one seed for a booking's practice evening (tested).
 */
export function eventPlanSeed(stateSeed, firstRoundDay) {
  return ((stateSeed ?? 1) * 104729 + firstRoundDay * 7919 + 31) >>> 0;
}

/**
 * Which evenings of a booking get a championship card.
 *
 * The run-up: one evening drawn evenly from the booked day to two days
 * before round 1, less the practice evening (it has its own card), and a
 * 50% chance of a second on a different evening. So one or two in three
 * weeks, the rest of the run-up left to ordinary events.
 *
 * The week: the eve of round 1 and each round's evening but the last's --
 * every evening with a round still to come, which is what a week event is
 * about (its `nextRound` is tomorrow's). Each kept at 50%, and if none is,
 * one of them is chosen, so every week has at least one. The last round's
 * evening is never one: the verdict is in and the booking gone by then.
 *
 * Evenings before `bookedDay` are not offered, so a booking made late (or
 * a save from before plans, picked up mid-week) only draws from the
 * evenings it still has. Returns `{ runUp: [day...], week: [day...] }`,
 * each in day order.
 */
export function drawEventPlan(rng, { bookedDay, firstRoundDay, rounds }) {
  const practiceEvening = firstRoundDay - PRACTICE_DAYS_BEFORE;
  const runUpEvenings = [];
  for (let d = bookedDay; d <= firstRoundDay - 2; d++) {
    if (d !== practiceEvening) runUpEvenings.push(d);
  }
  const runUp = [];
  if (runUpEvenings.length > 0) {
    const first = runUpEvenings[rng.int(runUpEvenings.length)];
    runUp.push(first);
    if (rng.chance(0.5) && runUpEvenings.length > 1) {
      const rest = runUpEvenings.filter((d) => d !== first);
      runUp.push(rest[rng.int(rest.length)]);
    }
  }

  const weekEvenings = [];
  for (let d = Math.max(bookedDay, firstRoundDay - 1); d <= firstRoundDay + rounds - 2; d++) {
    weekEvenings.push(d);
  }
  const week = weekEvenings.filter(() => rng.chance(0.5));
  if (week.length === 0 && weekEvenings.length > 0) {
    week.push(weekEvenings[rng.int(weekEvenings.length)]);
  }

  return { runUp: runUp.sort((a, b) => a - b), week };
}

/** 'runUp', 'week', or null: whether an evening has a card in the plan. */
export function plannedPhase(plan, day) {
  if (plan?.runUp?.includes(day)) return 'runUp';
  if (plan?.week?.includes(day)) return 'week';
  return null;
}

/**
 * Tonight's championship event, mirroring `pickEvent` (events.js): the
 * evening's phase's pool (`context.championship.phase`: the eve of round 1
 * on is the week), eligible by `when`, unseen first, and only once every
 * eligible one has been shown is one repeated. Null with nothing booked.
 *
 * The phase comes from the context, not the plan, and the two agree by
 * construction: a plan's run-up evenings all fall before the eve of round
 * 1 and its week evenings on or after it. That is what keeps a week
 * event's `nextRound` from being offered three weeks before a round.
 */
export function pickChampionshipEvent(context, rng, seen = []) {
  const phase = context?.championship?.phase;
  if (!phase) return null;
  const eligible = CHAMPIONSHIP_EVENTS.filter((event) => {
    if (event.phase !== phase) return false;
    try {
      return event.when(context);
    } catch {
      return false;
    }
  });
  if (eligible.length === 0) return null;
  const recent = new Set(seen);
  const unseen = eligible.filter((event) => !recent.has(event.id));
  const pool = unseen.length > 0 ? unseen : eligible;
  return pool[rng.int(pool.length)];
}

/**
 * The save's championship memory (`state.championshipEventsSeen`) after
 * showing `id`.
 *
 * Kept for the whole ladder, not per booking, so a Regional does not open
 * with the County's mower. Once every event in a phase's pool has been
 * shown, that phase starts over with only the one just shown remembered,
 * so the cycle begins again without it coming straight back. Unlike
 * `rememberEvent` there is no fixed length: the pools are seven and nine,
 * and the cycle is what bounds it.
 */
export function rememberChampionshipEvent(seen = [], id) {
  const event = CHAMPIONSHIP_EVENTS.find((e) => e.id === id);
  if (!event || seen.includes(id)) return seen;
  const next = [...seen, id];
  const pool = CHAMPIONSHIP_EVENTS.filter((e) => e.phase === event.phase).map((e) => e.id);
  if (pool.every((poolId) => next.includes(poolId))) {
    return [...next.filter((x) => !pool.includes(x)), id];
  }
  return next;
}
