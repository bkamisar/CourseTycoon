import { makeHole } from './hole.js';
import { emptyGoodwill } from './goodwill.js';

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
      amenities: [{ type: 'clubhouse' }],
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
    // Which decision events have been offered lately, so the same one does
    // not come up twice while the library still has something unseen.
    eventsSeen: [],
  };
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
  return parsed;
}

/** Every hole currently open for play. */
export function openHoles(state) {
  return state.resort.courses[0].holes.filter((h) => h.open);
}
