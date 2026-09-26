import { SEGMENTS, SEGMENT_KEYS } from './segments.js';
import { TARGET_MINUTES_PER_HOLE } from './schedule.js';
import { ITEMS } from './menu.js';

/**
 * What the world says about the resort.
 *
 * Positioning in this game is emergent: the player never declares a market,
 * so the course they build silently decides who turns up. That is the right
 * design and it has one weakness - an emergent system the player cannot read
 * feels arbitrary rather than earned. These lines are the answer. They are
 * how the resort tells its owner what it has become, in a voice, rather than
 * through a statistics panel.
 *
 * Two things keep them from going stale, and the second matters more than
 * the first. There are many lines, and they are conditional, so the pool for
 * any given situation is a handful rather than all of them. And selection
 * never repeats a line until its situation's pool is exhausted - random
 * picking clusters repeats, and a repeat is the thing a player notices
 * immediately.
 *
 * The cast does the rest. The same fact from the marshal, a regular, a
 * stranger and a magazine reads as four lines rather than one.
 */

/** Gus is the recurring voice; the rest rotate through. */
export const SPEAKERS = {
  gus: 'Gus, the marshal',
  regular: 'A regular',
  visitor: 'A visitor',
  keeper: 'The greenkeeper',
  starter: 'The starter',
  press: 'Fairway Monthly',
  gazette: 'The Pinehollow Gazette',
  shop: 'Behind the counter',
  dee: 'Dee, on the cart',
};

/**
 * The facts the lines are allowed to ask about, derived once per evening.
 *
 * `previousReport` may be undefined on day one; everything that depends on
 * it must cope with that rather than assume a yesterday exists.
 */
export function narrationContext({ report, previousReport, state }) {
  const crowd = report.crowd ?? {};
  const counts = {};
  let total = 0;
  for (const key of SEGMENT_KEYS) {
    counts[key] = crowd[key]?.count ?? 0;
    total += counts[key];
  }

  let dominant = SEGMENT_KEYS[0];
  for (const key of SEGMENT_KEYS) if (counts[key] > counts[dominant]) dominant = key;
  const dominantShare = total > 0 ? counts[dominant] / total : 0;

  // Which way the crowd is moving. Shares, not counts, so a busy day does
  // not read as a change in who is coming.
  let rising = null;
  let falling = null;
  if (previousReport?.crowd) {
    let prevTotal = 0;
    for (const key of SEGMENT_KEYS) prevTotal += previousReport.crowd[key]?.count ?? 0;
    if (prevTotal > 0 && total > 0) {
      let bestUp = 0.06;
      let bestDown = -0.06;
      for (const key of SEGMENT_KEYS) {
        const delta = counts[key] / total - (previousReport.crowd[key]?.count ?? 0) / prevTotal;
        if (delta > bestUp) { bestUp = delta; rising = key; }
        if (delta < bestDown) { bestDown = delta; falling = key; }
      }
    }
  }

  // Is the course pitched at the people actually playing it?
  const difficulty = report.courseDifficulty ?? 0;
  const ideal = SEGMENTS[dominant].idealDifficulty;
  const missBy = difficulty - ideal;

  const holesOpen = state.resort.courses[0].holes.filter((h) => h.open).length;
  const targetMinutes = holesOpen * TARGET_MINUTES_PER_HOLE;

  return {
    counts,
    total,
    dominant,
    dominantShare,
    rising,
    falling,
    difficulty,
    tooHard: missBy > 14,
    tooEasy: missBy < -14,
    satisfaction: report.averageSatisfaction ?? 50,
    turf: report.turfQuality ?? 50,
    rating: report.courseRating ?? 0,
    prestige: report.prestige ?? 0,
    groups: report.groupsPlayed ?? 0,
    quiet: (report.groupsPlayed ?? 0) <= 6,
    busy: (report.groupsPlayed ?? 0) >= 28,
    slow: (report.averageRoundMinutes ?? 0) > targetMinutes * 1.25,
    holesOpen,
    nearGate: Boolean(report.gate?.nearGate),
    day: report.day ?? 1,
    /*
     * What actually stands on the property, so a voice cannot describe
     * something that is not there.
     *
     * Dee had this from the start -- a voice from an amenity the player
     * has not built is the world telling them about something that does
     * not exist -- but she was the only one. The pro shop had ten lines
     * ("Sold a coffee. That was the day.") and nothing checked whether
     * there was a pro shop.
     *
     * And a gate on the SPEAKER is not enough on its own. Dee's line
     * about three fellas asking whether she does food fired whenever a
     * cart existed, including when the cart already had a hot dog on it,
     * so she was asking the owner for something sitting in her own
     * cooler. Reported from play as not being able to work out what was
     * being asked for -- which is the tell, because nothing was.
     */
    hasCart: state.resort.amenities.some((a) => a.type === 'beverageCart'),
    hasShop: state.resort.amenities.some((a) => a.type === 'proShop'),
    // Anywhere on the property with something to eat actually on its
    // board. A kitchen with nothing in it feeds nobody.
    sellsFood: state.resort.amenities.some(
      (a) => (a.menu ?? []).some((id) => ITEMS[id]?.kind === 'food')
    ),
  };
}

const dom = (key) => (c) => c.total > 0 && c.dominant === key && c.dominantShare >= 0.45;

/**
 * Every line the world can say. `when` decides whether it is true today;
 * anything whose `when` passes is eligible, and selection picks among them.
 *
 * Written to be read aloud. A line that explains a mechanic is a worse line
 * than one that lets the player work the mechanic out.
 */
export const LINES = [
  // --- Dee, on the beverage cart ---------------------------------------
  // She sees more of the course in a day than anyone, which is what makes
  // her worth having as a voice: she is the only member of the cast who
  // watches the whole field rather than one spot on it. Every line here is
  // gated on the cart existing.
  { id: 'dee-1', speaker: 'dee', text: "Ran the loop four times. Ice held. Just.", when: (c) => c.hasCart },
  { id: 'dee-2', speaker: 'dee', text: "Nobody buys anything on the first two holes. Everybody buys on the sixth.", when: (c) => c.hasCart },
  { id: 'dee-3', speaker: 'dee', text: "Group on the fourth waved me off. Group behind them bought six.", when: (c) => c.hasCart },
  { id: 'dee-4', speaker: 'dee', text: "You can tell how the round's going by what they order.", when: (c) => c.hasCart },
  { id: 'dee-5', speaker: 'dee', text: "Three fellas asked if I do food. Told them to take it up with you.", when: (c) => c.hasCart && !c.sellsFood },
  { id: 'dee-6', speaker: 'dee', text: "Backed up on the seventh, so I sat there and sold out.", when: (c) => c.hasCart && c.slow },
  { id: 'dee-7', speaker: 'dee', text: "Quiet out there. I did more waving than selling.", when: (c) => c.hasCart && c.quiet },
  { id: 'dee-8', speaker: 'dee', text: "Couldn't get round fast enough today. Everyone wanted something.", when: (c) => c.hasCart && c.busy },
  { id: 'dee-9', speaker: 'dee', text: "They're playing it careful out there. Careful golf is thirsty golf.", when: (c) => c.hasCart && c.tooHard },
  { id: 'dee-10', speaker: 'dee', text: "Half of them were done before they'd finished a drink.", when: (c) => c.hasCart && c.tooEasy },

  // --- A locals' course ------------------------------------------------
  { id: 'loc-1', speaker: 'gus', text: "Same faces as yesterday. That's not a complaint.", when: dom('locals') },
  { id: 'loc-2', speaker: 'regular', text: "Round before work, round after. You've made that easy.", when: dom('locals') },
  { id: 'loc-3', speaker: 'starter', text: "Half the sheet booked by people I know by first name.", when: dom('locals') },
  { id: 'loc-4', speaker: 'gus', text: "Fella out there played here twice today. Twice.", when: dom('locals') },
  { id: 'loc-5', speaker: 'regular', text: "It's not fancy. It's ours.", when: dom('locals') },
  { id: 'loc-6', speaker: 'shop', text: "Sold four gloves and a sleeve of balls. Nobody browses. They know what they want.", when: (c) => c.hasShop && dom('locals')(c) },

  // --- A serious golfer's course ---------------------------------------
  { id: 'ser-1', speaker: 'visitor', text: "Drove two hours for this. Worth it.", when: dom('serious') },
  { id: 'ser-2', speaker: 'gus', text: "Quiet group on the 3rd. Proper quiet. They were concentrating.", when: dom('serious') },
  { id: 'ser-3', speaker: 'starter', text: "Three single-figure handicaps before nine this morning.", when: dom('serious') },
  { id: 'ser-4', speaker: 'visitor', text: "Asked me what the course record was. I had to go and look.", when: dom('serious') },
  { id: 'ser-5', speaker: 'shop', text: "Nobody wants a cap. They all want to know the yardages.", when: (c) => c.hasShop && dom('serious')(c) },
  { id: 'ser-6', speaker: 'gus', text: "Overheard someone call it a proper test. He didn't mean it kindly, but he'll be back.", when: dom('serious') },

  // --- A destination course --------------------------------------------
  { id: 'des-1', speaker: 'visitor', text: "Took more photographs than shots. Nearly.", when: dom('destination') },
  { id: 'des-2', speaker: 'gus', text: "Group on the 5th stopped to look at the view. Held everyone up. Couldn't be cross about it.", when: dom('destination') },
  { id: 'des-3', speaker: 'starter', text: "Two foursomes asked if we do this as a package.", when: dom('destination') },
  { id: 'des-4', speaker: 'shop', text: "They buy the souvenir, not the equipment.", when: (c) => c.hasShop && dom('destination')(c) },
  { id: 'des-5', speaker: 'visitor', text: "Not sure I played well. Had a lovely afternoon though.", when: dom('destination') },

  // --- The crowd is changing -------------------------------------------
  { id: 'shift-ser', speaker: 'gus', text: "Different sort out there lately. Better players. Less chatting.", when: (c) => c.rising === 'serious' },
  { id: 'shift-ser-2', speaker: 'starter', text: "Getting more people I don't recognise, and they're all asking about the back tees.", when: (c) => c.rising === 'serious' },
  { id: 'shift-loc', speaker: 'gus', text: "More familiar faces this week. Word's got round that it's playable.", when: (c) => c.rising === 'locals' },
  { id: 'shift-loc-2', speaker: 'regular', text: "Brought my brother-in-law. He's not a golfer. He had a nice time.", when: (c) => c.rising === 'locals' },
  { id: 'shift-des', speaker: 'starter', text: "Had someone ask where the nearest hotel was. Second time this week.", when: (c) => c.rising === 'destination' },
  { id: 'shift-des-2', speaker: 'shop', text: "More cameras than usual out there.", when: (c) => c.hasShop && (c.rising === 'destination') },
  { id: 'fade-loc', speaker: 'regular', text: "Used to see more of the old crowd. Suppose it's changed.", when: (c) => c.falling === 'locals' },
  { id: 'fade-ser', speaker: 'gus', text: "The good players have gone quiet on us.", when: (c) => c.falling === 'serious' },

  // --- The course does not suit who is playing it -----------------------
  { id: 'hard-1', speaker: 'gus', text: "Watched a fourball lose six balls between them. They were not laughing by the end.", when: (c) => c.tooHard },
  { id: 'hard-2', speaker: 'regular', text: "I like a challenge. I don't like that.", when: (c) => c.tooHard },
  { id: 'hard-3', speaker: 'starter', text: "Had two groups ask if there were forward tees. There aren't.", when: (c) => c.tooHard },
  { id: 'hard-4', speaker: 'gus', text: "Someone picked up on the 4th and walked in. Just walked in.", when: (c) => c.tooHard },
  { id: 'hard-5', speaker: 'shop', text: "Selling a remarkable number of golf balls. Make of that what you will.", when: (c) => c.hasShop && (c.tooHard) },
  { id: 'easy-1', speaker: 'visitor', text: "Shot the best round of my life. Not sure it counts.", when: (c) => c.tooEasy },
  { id: 'easy-2', speaker: 'gus', text: "Nobody's been in the trees all day. Feels wrong.", when: (c) => c.tooEasy },
  { id: 'easy-3', speaker: 'visitor', text: "Pleasant enough. Wouldn't make a trip for it.", when: (c) => c.tooEasy },
  { id: 'easy-4', speaker: 'starter', text: "Chap asked whether we had anything harder. We don't.", when: (c) => c.tooEasy },

  // --- Turf -------------------------------------------------------------
  { id: 'turf-great-1', speaker: 'visitor', text: "Greens are quicker than I expected. In a good way.", when: (c) => c.turf >= 85 },
  { id: 'turf-great-2', speaker: 'keeper', text: "Fairways are holding. Bunkers raked before first light.", when: (c) => c.turf >= 85 },
  { id: 'turf-great-3', speaker: 'gus', text: "Somebody asked who looks after the greens. I told them it was me. Felt good.", when: (c) => c.turf >= 85 },
  { id: 'turf-great-4', speaker: 'press', text: "Conditioning here would not embarrass a club charging three times as much.", when: (c) => c.turf >= 90 },
  { id: 'turf-poor-1', speaker: 'keeper', text: "I can cut it or I can rake it. Not both. Not with this crew.", when: (c) => c.turf <= 40 },
  { id: 'turf-poor-2', speaker: 'regular', text: "Greens are getting shaggy. You can see the grain from the fairway.", when: (c) => c.turf <= 40 },
  { id: 'turf-poor-3', speaker: 'visitor', text: "Bunkers haven't been touched in days. Played out of a footprint on the 2nd.", when: (c) => c.turf <= 35 },
  { id: 'turf-poor-4', speaker: 'gus', text: "Had to apologise for the greens twice today. I don't like apologising for the greens.", when: (c) => c.turf <= 30 },

  // --- How busy it was --------------------------------------------------
  { id: 'quiet-1', speaker: 'starter', text: "Sheet's thin. Had the first tee to myself most of the morning.", when: (c) => c.quiet },
  { id: 'quiet-2', speaker: 'gus', text: "Walked the whole course and saw four people. Peaceful. Not profitable.", when: (c) => c.quiet },
  { id: 'quiet-3', speaker: 'shop', text: "Sold a coffee. That was the day.", when: (c) => c.hasShop && (c.quiet) },
  { id: 'busy-1', speaker: 'starter', text: "Every slot gone by ten. Turned people away.", when: (c) => c.busy },
  { id: 'busy-2', speaker: 'gus', text: "Car park's full and there are two cars on the verge.", when: (c) => c.busy },
  { id: 'busy-3', speaker: 'shop', text: "Ran out of scorecards. Actually ran out.", when: (c) => c.hasShop && (c.busy) },

  // --- Pace -------------------------------------------------------------
  { id: 'slow-1', speaker: 'gus', text: "Spent my whole day telling people to keep up. They can't. There's nowhere to go.", when: (c) => c.slow },
  { id: 'slow-2', speaker: 'regular', text: "Five hours. For nine holes. I've things to be doing.", when: (c) => c.slow },
  { id: 'slow-3', speaker: 'starter', text: "Backed up onto the first tee before I'd finished my tea.", when: (c) => c.slow },
  { id: 'slow-4', speaker: 'visitor', text: "Stood on three tees waiting. You lose the rhythm of it.", when: (c) => c.slow },

  // --- Mood -------------------------------------------------------------
  { id: 'happy-1', speaker: 'gus', text: "Nobody complained to me all day. That's never happened.", when: (c) => c.satisfaction >= 72 },
  { id: 'happy-2', speaker: 'starter', text: "Three groups rebooked before they'd left the car park.", when: (c) => c.satisfaction >= 72 },
  { id: 'happy-3', speaker: 'regular', text: "Told two people at work about this place. Hope you can handle it.", when: (c) => c.satisfaction >= 78 },
  { id: 'sad-1', speaker: 'gus', text: "Bit of an atmosphere out there today. Not a happy one.", when: (c) => c.satisfaction <= 32 },
  { id: 'sad-2', speaker: 'starter', text: "Had someone ask for their money back. I said I'd pass it on. I'm passing it on.", when: (c) => c.satisfaction <= 28 },
  { id: 'sad-3', speaker: 'regular', text: "I'll keep coming. I'm not sure the others will.", when: (c) => c.satisfaction <= 32 },

  // --- Press ------------------------------------------------------------
  { id: 'press-top', speaker: 'press', text: "A short course that plays far longer than its card. Worth the detour.", when: (c) => c.rating >= 85 },
  { id: 'press-good', speaker: 'press', text: "Thoughtfully routed, honestly priced, and in better nick than it has any right to be.", when: (c) => c.rating >= 70 && c.rating < 85 },
  { id: 'press-mid', speaker: 'gazette', text: "Pinehollow continues to do a steady trade. Locals speak well of the place.", when: (c) => c.rating >= 45 && c.rating < 70 },
  { id: 'press-poor', speaker: 'gazette', text: "Pinehollow remains, in the words of one visitor, a work in progress.", when: (c) => c.rating < 45 },
  { id: 'press-variety', speaker: 'press', text: "No two holes here ask the same question. That is rarer than it sounds.", when: (c) => c.rating >= 78 },
  { id: 'press-samey', speaker: 'gazette', text: "One reader writes that the holes rather blur into one another.", when: (c) => c.rating < 55 },

  // --- Prestige ---------------------------------------------------------
  { id: 'prest-1', speaker: 'shop', text: "Someone rang asking if we take society bookings. We've arrived.", when: (c) => c.hasShop && (c.prestige >= 65) },
  { id: 'prest-2', speaker: 'starter', text: "Had a caller ask how far in advance they need to book. That's new.", when: (c) => c.prestige >= 55 },
  { id: 'prest-low', speaker: 'gus', text: "Man asked me for directions to the golf course. He was standing on it.", when: (c) => c.prestige <= 25 },

  // --- Act II foreshadowing --------------------------------------------
  { id: 'gate-1', speaker: 'visitor', text: "I'd play again tomorrow, but the nearest motel is forty minutes out.", when: (c) => c.nearGate },
  { id: 'gate-2', speaker: 'starter', text: "Third person this week has asked whether we have rooms.", when: (c) => c.nearGate },
  { id: 'gate-3', speaker: 'gus', text: "Couple drove up from the coast, played, and drove straight back. Seemed a shame.", when: (c) => c.nearGate },
  { id: 'gate-4', speaker: 'shop', text: "They keep asking where to stay. I keep saying the pub in the village. They keep looking disappointed.", when: (c) => c.hasShop && (c.nearGate) },

  // --- Always available, so a day is never silent ------------------------
  { id: 'any-1', speaker: 'gus', text: "Nothing to report. Some days that's the report.", when: () => true },
  { id: 'any-2', speaker: 'keeper', text: "Mowed, raked, watered. Same tomorrow.", when: () => true },
  { id: 'any-3', speaker: 'starter', text: "Wind got up around four. Nobody minded much.", when: () => true },
  { id: 'any-4', speaker: 'gus', text: "Found a wedge on the 3rd. It'll be claimed by Thursday. They always are.", when: () => true },
  { id: 'any-5', speaker: 'shop', text: "Quiet at the counter. Busy on the course. I'll take it.", when: (c) => c.hasShop },
  { id: 'any-6', speaker: 'keeper', text: "Moles are back on the 2nd. I'm dealing with it.", when: () => true },
];

/** How many recently-shown lines to remember before recycling is allowed. */
export const NARRATION_MEMORY = 24;

/**
 * Picks the evening's line.
 *
 * Eligible lines that have not been shown recently come first; only when a
 * situation's whole pool has been used does it start recycling. Random
 * picking clusters repeats, and a repeat is exactly what a player notices.
 */
export function pickNarration(context, rng, recentIds = []) {
  const eligible = LINES.filter((line) => {
    try {
      return line.when(context);
    } catch {
      return false;
    }
  });
  if (eligible.length === 0) return null;

  const recent = new Set(recentIds);
  const unseen = eligible.filter((line) => !recent.has(line.id));
  const pool = unseen.length > 0 ? unseen : eligible;

  const line = pool[rng.int(pool.length)];
  return { id: line.id, speaker: SPEAKERS[line.speaker], text: line.text };
}

/** The recent-line memory, trimmed, after showing `id`. */
export function rememberNarration(recentIds = [], id) {
  if (!id) return recentIds;
  return [...recentIds, id].slice(-NARRATION_MEMORY);
}
