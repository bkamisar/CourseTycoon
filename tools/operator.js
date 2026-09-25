/**
 * A competent operator: someone who actually plays the game.
 *
 * The balance harness has always measured a *passive* operator — one who
 * never builds, never prices, never hires. That was the right floor while
 * the only thing to get wrong was the green fee, and it has quietly
 * stopped measuring the game: it never builds a food amenity, so menus
 * are invisible to it; never hires a cook or a shop hand, so the whole
 * staffing layer is invisible; never buys anything, so every price
 * changed today is invisible. It reports on a world that no longer
 * exists, and it has reported the same six numbers through four slices of
 * work that should have moved them.
 *
 * So this is the other end: a plausible, *stated* strategy, with its
 * decisions written down rather than tuned until the output looks nice.
 * It is not optimal and is not meant to be. It is meant to be the sort of
 * thing a real player does, so that "can a reasonable player reach Act
 * II, and how long does it take" has an answer that is checked rather
 * than assumed.
 *
 * The policy, in order of priority each morning:
 *
 *   1. Keep the turf alive. Enough groundskeepers to cover the wear the
 *      course is actually taking, which depends on how busy it is.
 *   1b. Keep the course moving. Marshals while rounds run long — this was
 *      missing from the first version of this operator, and its absence
 *      produced a confident, wrong report that Act I had exactly one
 *      winning line. It has two. The operator simply could not play the
 *      second, because the second is built on marshals.
 *   2. Staff what is already built, before building more. An amenity with
 *      nobody in it only half works, and an unstaffed kitchen is the
 *      single most expensive mistake available.
 *   3. Finish the course. Nine holes is the gate's first condition and
 *      every other number improves with more golf to sell.
 *   4. Buy amenities in payback order, cheapest first, and only with a
 *      comfortable cash buffer left over.
 *   5. Answer decision events pragmatically.
 *
 * Deliberately NOT modelled: menu tuning per crowd, rebuilding holes for
 * variety, adjusting price as prestige grows. A player who does those
 * things should beat this operator, which is the point — this is a floor
 * for a thinking player, not a ceiling.
 */
import { amenity } from '../src/sim/state.js';
import { runDay, applyEventChoice } from '../src/sim/day.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { AMENITIES, BUILD_COSTS } from '../src/sim/economy.js';
import { GATE_THRESHOLDS } from '../src/sim/acts.js';
import { EVENTS } from '../src/sim/events.js';
import { menuPrep } from '../src/sim/menu.js';
import { kitchenCapacity, kitchenLoad } from '../src/sim/kitchen.js';
import { shopCapacity } from '../src/sim/shop.js';
import { TARGET_MINUTES_PER_HOLE } from '../src/sim/schedule.js';
import {
  HOTEL_AMENITIES, hotelUpkeep,
} from '../src/sim/hotelAmenities.js';
import { totalRooms, ROOM_TYPES, roomLimit } from '../src/sim/rooms.js';
import { payBuyout } from '../src/sim/investors.js';

/**
 * Cash kept in hand at all times. Without a buffer the operator spends
 * itself to the floor on day one and then cannot make payroll, which
 * measures impatience rather than the economy.
 */
const BUFFER = 12000;

/** Marshals have diminishing returns and this operator is not trying to
 * find the optimum, only to play sensibly. */
const MAX_MARSHALS = 3;

/**
 * Amenities in the order a sensible player would buy them: the near
 * necessities first, then earners, then the expensive transformative one.
 * The halfway house and restaurant are last because both are measurably
 * poor on a nine (see spec §8.2) — an operator that bought them early
 * would be measuring a known mistake.
 */
const SHOPPING_LIST = [
  'restrooms', 'proShop', 'snackShack', 'beverageCart',
  'cartBarn', 'practiceGreen', 'drivingRange', 'halfwayHouse', 'restaurant',
];

/**
 * What this operator deliberately does not do.
 *
 * Stated rather than implied, because the danger is never the gaps — it
 * is forgetting they are there and reading a limitation of the model as a
 * fact about the game. That has now happened seven times on this project,
 * most recently here: an operator that could not hire a marshal reported
 * that Act I had one winning line, when it has four.
 *
 * Anything on this list means: do not conclude anything about it from
 * this harness. Go and measure it deliberately instead.
 */
export const LEVERS_NOT_PULLED = [
  'Tuning a menu to the crowd the course actually draws. Default boards '
  + 'only, so nothing here says anything about whether menu choice matters.',
  'Rebuilding holes for variety or difficulty. The course is built once '
  + 'from templates in order, so course rating and difficulty fit are '
  + 'whatever that happens to produce.',
  'Changing price or tee interval as the resort grows. Both are fixed for '
  + 'a whole run, where a real player would adjust as prestige rises.',
  'Removing an amenity that turns out not to help. It only ever buys.',
  'Choosing events by anything but a fixed stance preference.',
  'Act II: setting a menu at the dining room, the brew pub or the bar. '
  + 'All three open on their defaults, so nothing here says whether those '
  + 'boards are worth tuning.',
  'Act II: moving the nightly rate as the hotel fills or empties. It is '
  + 'fixed for a whole run, where a real player would raise it the first '
  + 'week they sell out.',
  'Act II: selling rooms back when they stop filling. It only ever '
  + 'builds, so overbuilding is measured as a cost it cannot escape '
  + 'rather than a mistake it can correct.',
  'Act II: declining the buyout to keep playing. It settles the moment it '
  + 'can afford to, so nothing here measures a resort that chooses to '
  + 'stay under investment.',
];

const countRole = (state, role) => state.resort.staff.filter((m) => m.role === role).length;
const openCount = (state) => state.resort.courses[0].holes
  .filter((h) => h.open && h.corridor && h.corridor.length > 1).length;

/** One morning's decisions, applied in priority order. Mutates `state`. */
function spendTheMorning(state, { greenFee, teeInterval }) {
  state.resort.pricing.greenFee = greenFee;
  state.resort.pricing.teeInterval = teeInterval;

  // 1. Turf first. A course that falls apart takes every other number
  //    down with it, and groundskeepers are the cheapest insurance.
  //
  //    Staffed against TRAFFIC, not just hole count. The rule used to be
  //    one keeper per three open holes, which was right when play barely
  //    wore the course and wrong the moment it did: wear is now
  //    `holes * 1.4 + groups * 0.45`, so a busy nine needs materially
  //    more care than a quiet one and the old rule had no way to notice.
  //    A balance sweep with it in place reported every strategy bankrupt
  //    or stalled with mean final turf of 0.1 -- which is a fact about
  //    this function, not about the game. The operator could not pull a
  //    lever the game had started to require, exactly as it once could
  //    not hire marshals.
  const holes = openCount(state);
  const groups = state.history.at(-1)?.groupsPlayed ?? 0;
  const wearRate = holes * 1.4 + groups * 0.45;
  const needed = Math.max(1, Math.ceil(wearRate / 6.8));
  if (countRole(state, 'groundskeeper') < needed && state.money > BUFFER) {
    state.resort.staff.push({ role: 'groundskeeper' });
    return;
  }

  // 1b. Keep it moving. Waiting is what hurts guests most, and marshals
  //     are the cheapest thing that touches it — worthless on a quiet
  //     course and worth thousands a day on a busy one. Hired against how
  //     slowly the course is actually running, not a fixed ratio, so this
  //     is silent until there is congestion to relieve.
  const lastRound = state.history.at(-1)?.averageRoundMinutes ?? 0;
  const target = holes * TARGET_MINUTES_PER_HOLE;
  if (lastRound > target * 1.25
    && countRole(state, 'marshal') < MAX_MARSHALS
    && state.money > BUFFER) {
    state.resort.staff.push({ role: 'marshal' });
    return;
  }

  // 2. Staff what exists before buying more of it.
  const load = kitchenLoad(state.resort.amenities);
  if (load > kitchenCapacity(state.resort.staff) && state.money > BUFFER) {
    state.resort.staff.push({ role: 'kitchenStaff' });
    return;
  }
  const golfers = (state.history.at(-1)?.groupsPlayed ?? 0) * 4;
  const hasShop = state.resort.amenities.some((a) => a.type === 'proShop');
  if (hasShop && golfers > shopCapacity(state.resort.staff) && state.money > BUFFER) {
    state.resort.staff.push({ role: 'shopStaff' });
    return;
  }

  // 3. Finish the course — the FRONT nine, and no further.
  //
  // This used to build every stub `newGame` lays out, which is eighteen.
  // The Act I gate asks for nine, and the back nine is an Act II unlock
  // that no player could even reach until today; building it doubles
  // upkeep and doubles the traffic wearing the course, for nothing. It
  // showed up as soon as holes got cheaper: the operator simply
  // over-built faster and the busy strategies went from surviving to
  // bankrupt in five or six seeds out of eight. A tool that spends money
  // no player would spend is not measuring the game.
  const stubs = state.resort.courses[0].holes;
  const buildLimit = (state.act ?? 1) >= 2 ? stubs.length : GATE_THRESHOLDS.holesOpen;
  const nextStub = stubs.findIndex((h, i) => i < buildLimit && (!h.corridor || h.corridor.length < 2));
  if (nextStub >= 0 && state.money > BUILD_COSTS.hole + BUFFER) {
    state.money -= BUILD_COSTS.hole;
    stubs[nextStub] = {
      ...makeHole(TEMPLATE_NAMES[nextStub % TEMPLATE_NAMES.length], stubs[nextStub].id),
      open: true,
    };
    return;
  }

  // 4. Then buy, one thing a day, with the buffer intact.
  for (const type of SHOPPING_LIST) {
    if (state.resort.amenities.some((a) => a.type === type)) continue;
    if (state.money > AMENITIES[type].build + BUFFER) {
      state.money -= AMENITIES[type].build;
      state.resort.amenities.push(amenity(type));
      return;
    }
  }
}

/**
 * Plays a prepared resort under this policy until the Act I gate opens or
 * `days` runs out.
 *
 * `greenFee` and `teeInterval` are arguments rather than constants
 * because the whole question about Act I is whether more than one setting
 * works — a game with a single viable price is a game with one answer.
 */
export function play(startState, { greenFee, teeInterval, days = 150, seed = 1 }) {
  let state = startState;
  let gateDay = null;
  let bankrupt = false;
  let answered = 0;
  let last = null;

  for (let day = 0; day < days && gateDay === null; day++) {
    spendTheMorning(state, { greenFee, teeInterval });
    const result = runDay(state, seed * 7919 + day);
    state = result.state;
    last = result.report;

    // 5. Answer events. Pragmatic: the middle option where there is one,
    //    otherwise whatever costs least. A real player picks by taste;
    //    this at least picks consistently.
    const pending = result.report.pendingEvent;
    if (pending) {
      const event = EVENTS.find((e) => e.id === pending.id);
      const middle = event.choices.findIndex((c) => c.stance === 'pragmatic');
      const index = middle >= 0 ? middle
        : event.choices.reduce(
          (best, c, i, all) => ((c.effects?.money ?? 0) > (all[best].effects?.money ?? 0) ? i : best), 0
        );
      state = applyEventChoice(state, pending.id, index);
      answered += 1;
    }

    if (state.money < 0) bankrupt = true;
    if (result.report.gate.passed) gateDay = day + 1;
  }

  return {
    // The resort itself, so a caller can carry it on into Act II rather
    // than having to replay the whole of Act I to get one.
    state,
    gateDay,
    bankrupt,
    days: state.day - 1,
    money: state.money,
    prestige: state.prestige,
    turf: state.turfQuality,
    satisfaction: last?.averageSatisfaction ?? 0,
    round: last?.averageRoundMinutes ?? 0,
    holes: openCount(state),
    amenities: state.resort.amenities.length - 1,
    staff: state.resort.staff.length,
    answered,
    outstanding: last?.gate.outstanding ?? [],
  };
}

// =====================================================================
// ACT II
// =====================================================================

/**
 * A competent hotelier, on the same terms as the operator above.
 *
 * Act II had never been measured at all. Its mechanics were each verified
 * to fire, which is a different claim from the act being any good — and
 * Act I looked fine on spot checks the morning it shipped with every
 * strategy bankrupt and mean final turf of 0.1. The operator is the only
 * thing on this project that has ever caught a real balance problem, and
 * until now it stopped at the gate.
 *
 * The policy, each morning, after the Act I one has had its turn:
 *
 *   1. Settle with the investors the moment it is affordable. Both
 *      endings run through that one button and a resort that can pay and
 *      does not is not being competently run.
 *   2. Build rooms while the ones already built are filling. Occupancy
 *      is the signal a real player has; "build to a number I worked out
 *      in advance" is not a decision anybody makes.
 *   3. Buy the hotel's buildings in priority order, cheapest useful
 *      first, one a day, with the buffer intact.
 */


/**
 * What the hotel buys, in order.
 *
 * Trade first, because a building that takes money pays for the next one.
 * Then the two that raise what a room is worth, then the pace and stay
 * mechanics, then pure draw. A player would argue with this order, which
 * is fine — it is a floor, not a recommendation.
 */
export const HOTEL_SHOPPING_LIST = [
  'indoorRange', 'functionRoom', 'conferenceSuite',
  'spa', 'fineDining',
  'caddieProgramme', 'kidsClub',
  'brewPub', 'cocktailBar', 'pool',
];

/** Rooms are added while the hotel is this full and no fuller. */
const EXPAND_ABOVE = 0.85;

/** And never past this, so a runaway cannot be mistaken for a strategy. */
const MAX_ROOMS = 90;

/** One hotel morning. Mutates `state`. Returns true if it spent its turn. */
function spendTheHotelMorning(state, { roomRate, suiteShare }) {
  state.resort.pricing.roomRate = roomRate;

  // 1. Pay the investors off when it is affordable. Both endings run
  //    through this, and a resort that can settle and does not is not
  //    being run competently.
  const demand = state.investors?.buyoutDemand;
  if (demand && state.money >= demand.amount + BUFFER) {
    const paid = payBuyout(state);
    if (paid.investors?.bought) {
      Object.assign(state, paid);
      return true;
    }
  }

  // 2. Rooms, while the ones already built are filling.
  const rooms = state.resort.rooms ?? {};
  const built = totalRooms(rooms);
  const lastRate = state.history.at(-1)?.hotel?.rate ?? 1;
  const permitted = roomLimit(state.prestige ?? 0);
  const full = built === 0 || lastRate >= EXPAND_ABOVE;
  if (full && built < Math.min(MAX_ROOMS, permitted)) {
    const wantSuite = (rooms.suite ?? 0) < Math.round(built * suiteShare);
    const kind = wantSuite ? 'suite' : 'standard';
    const price = ROOM_TYPES[kind].build;
    if (state.money > price + BUFFER) {
      state.money -= price;
      state.resort.rooms = { ...rooms, [kind]: (rooms[kind] ?? 0) + 1 };
      return true;
    }
  }

  // 3. The buildings, one a day.
  for (const type of HOTEL_SHOPPING_LIST) {
    if (state.resort.amenities.some((a) => a.type === type)) continue;
    const spec = HOTEL_AMENITIES[type];
    if (state.money > spec.build + BUFFER) {
      state.money -= spec.build;
      state.resort.amenities.push(amenity(type));
      return true;
    }
  }
  return false;
}

/**
 * Plays a resort that has already reached Act II, until the investors are
 * settled one way or the other or `days` runs out.
 *
 * Returns what the act is actually for: whether either ending is
 * reachable, how long it took, and what the hotel was doing when it got
 * there.
 */
export function playActTwo(startState, {
  greenFee, teeInterval, roomRate, suiteShare = 0.3, days = 200, seed = 1,
}) {
  let state = startState;
  let last = null;
  let bankrupt = false;
  let settledDay = null;
  let ending = null;
  let reviews = 0;
  let passed = 0;
  let lowConfidence = 100;
  let peakRooms = 0;

  for (let day = 0; day < days; day++) {
    spendTheMorning(state, { greenFee, teeInterval });
    spendTheHotelMorning(state, { roomRate, suiteShare });

    const result = runDay(state, seed * 7919 + day + 5000);
    state = result.state;
    last = result.report;

    const pending = result.report.pendingEvent;
    if (pending) {
      const event = EVENTS.find((e) => e.id === pending.id);
      const middle = event.choices.findIndex((c) => c.stance === 'pragmatic');
      const index = middle >= 0 ? middle
        : event.choices.reduce(
          (best, c, i, all) => ((c.effects?.money ?? 0) > (all[best].effects?.money ?? 0) ? i : best), 0
        );
      state = applyEventChoice(state, pending.id, index);
    }

    const inv = result.report.investors;
    if (inv?.reviewed) {
      reviews += 1;
      if (inv.reviewed.outcome === 'beat' || inv.reviewed.outcome === 'met') passed += 1;
    }
    if (typeof inv?.confidence === 'number') lowConfidence = Math.min(lowConfidence, inv.confidence);
    peakRooms = Math.max(peakRooms, totalRooms(state.resort.rooms));
    if (state.money < 0) bankrupt = true;

    if (state.investors?.bought && settledDay === null) {
      settledDay = day + 1;
      ending = state.investors.liquidated ? 'liquidated' : 'boughtOut';
      break;
    }
  }

  return {
    settledDay,
    ending,
    bankrupt,
    reviews,
    passed,
    lowConfidence: Math.round(lowConfidence),
    rooms: totalRooms(state.resort.rooms),
    peakRooms,
    occupancy: last?.hotel?.capacity ? last.hotel.sold / last.hotel.capacity : 0,
    money: Math.round(state.money),
    prestige: Math.round(state.prestige),
    hotelBuildings: state.resort.amenities.filter((a) => HOTEL_AMENITIES[a.type]).length,
    hotelUpkeep: hotelUpkeep(state.resort.amenities),
  };
}
