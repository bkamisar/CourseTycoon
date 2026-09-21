import { makeHole } from './hole.js';
import { emptyGoodwill } from './goodwill.js';
import { MENU_SLOTS, itemsFor, ITEMS } from './menu.js';

const SAVE_VERSION = 1;

/** The three holes Pinehollow already has, so day one has income to watch. */
const STARTING_HOLES = ['shortPar3', 'straightPar4', 'doglegPar4'];

export function newGame(seed) {
  const holes = [];
  for (let i = 0; i < 9; i++) {
    if (i < STARTING_HOLES.length) {
      holes.push({ ...makeHole(STARTING_HOLES[i], i + 1), open: true });
    } else {
      // An empty plot: no corridor until the player builds it.
      holes.push({ id: i + 1, open: false, template: null, corridor: [],
        corridorWidth: 0, greenPreset: null, features: [], teePos: null });
    }
  }

  return {
    version: SAVE_VERSION,
    seed,
    day: 1,
    act: 1,
    money: 25000,
    prestige: 12,
    turfQuality: 70,
    resort: {
      zones: [{ id: 'near', travelMinutes: 0 }],       // Act III adds 'far'
      courses: [{ id: 1, name: 'Pinehollow', zone: 'near', holes }],
      amenities: [amenity('clubhouse')],
      staff: [{ role: 'groundskeeper' }],
      rooms: { count: 0, quality: 0 },                 // Act II
      shuttles: [],                                    // Act III
      pricing: { greenFee: 22, teeInterval: 16, foodMultiplier: 1, roomRate: 0 },
    },
    properties: [{ id: 1, name: 'Pinehollow' }],       // Act IV
    history: [],
    satisfactionHistory: [],
    // Which narration lines have been shown lately, so the world does not
    // repeat itself while it still has something new to say.
    narrationSeen: [],
    // Per-segment goodwill (goodwill.js) — a decision event's consequence,
    // separate from and layered on top of whether the course itself suits
    // a crowd. Fades on its own; see day.js's decay each morning.
    goodwill: emptyGoodwill(),
    // Weather is a pure function of this and the day number, which is
    // what lets a forecast be the same thing as the weather rather than a
    // prediction that can drift from it. See weather.js.
    weatherSeed: seed,
    // Which decision events have been offered lately, so the same one does
    // not come up twice while the library still has something unseen.
    eventsSeen: [],
  };
}

/**
 * The board a food amenity opens with.
 *
 * Deliberately a decent, obvious menu rather than an empty one: a newly
 * built halfway house that sells nothing looks broken, and the player
 * should discover the menu screen by improving something, not by
 * repairing it. Picked by appeal to locals, because locals are who a new
 * resort draws before it has a reputation.
 */
/**
 * Builds one amenity.
 *
 * The `id` is what lets a later act have two of something. Every reader
 * that needs a *specific* amenity — the menu board, the Amenities row —
 * addresses it by this id rather than by type, so Act III can add a
 * second course with its own snack shack without rewriting any of them.
 * Readers that only ask "do I have any restrooms at all" keep using type,
 * because that question is still correct with several.
 *
 * Narrow implementation on a wide data model, the same way `zones`,
 * `courses` and `properties` are single-entry arrays today.
 */
let amenitySequence = 0;
export function amenity(type) {
  amenitySequence += 1;
  return { id: `${type}-${amenitySequence}`, type, menu: defaultMenuFor(type) };
}

export function defaultMenuFor(type) {
  const slots = MENU_SLOTS[type];
  if (!slots) return [];
  return itemsFor(type)
    .slice()
    .sort((a, b) => ITEMS[b].appeal.locals - ITEMS[a].appeal.locals)
    .slice(0, slots);
}

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('save is not valid JSON');
  }
  if (!parsed || parsed.version !== SAVE_VERSION || !parsed.resort) {
    throw new Error('save is missing required fields or is from another version');
  }
  // Saves from before goodwill and decision events existed have neither
  // field. Default them safely rather than let every later reader guard
  // against a missing key.
  if (!parsed.goodwill) parsed.goodwill = emptyGoodwill();
  if (!parsed.eventsSeen) parsed.eventsSeen = [];
  // Saves from before menus existed have amenities with no board. Give
  // every one of them the default rather than leaving the field missing —
  // menuPrep and the menu board both read it, and an absent menu would
  // silently serve nothing.
  // Saves from before menus existed have amenities with no board, and
  // saves from before multiples were anticipated have no id. Back-fill
  // both: menuPrep and the menu board read the menu, and the board now
  // addresses amenities by id, so an amenity without one is uneditable.
  (parsed.resort?.amenities ?? []).forEach((a, index) => {
    if (!Array.isArray(a.menu)) a.menu = defaultMenuFor(a.type);
    if (!a.id) a.id = `${a.type}-legacy${index}`;
  });
  // Saves made before weather existed get one, derived from something
  // stable about the resort so the same save always has the same climate.
  if (typeof parsed.weatherSeed !== 'number') {
    parsed.weatherSeed = (parsed.seed ?? parsed.day ?? 1) * 31 + 7;
  }
  return parsed;
}

/**
 * Every hole currently open for play.
 *
 * A hole needs a corridor to be playable at all. Holes 4-9 of a new game
 * are stubs — `corridor: []`, `teePos: null` — waiting to be built, and
 * flipping one to `open` without building it makes the whole day NaN:
 * every stroke, every minute, every dollar. The editor never does that
 * (it only ever assigns a hole built by `makeHole`), so this is not a
 * path a player can reach — but it has been reached three times by test
 * code and by tooling, each time producing a day that looked plausible
 * until the money came out as NaN.
 *
 * Requiring geometry rather than just the flag makes the unplayable state
 * unrepresentable instead of merely unlikely.
 */
export function openHoles(state) {
  return state.resort.courses[0].holes.filter(
    (h) => h.open && h.corridor && h.corridor.length > 1 && h.teePos
  );
}
