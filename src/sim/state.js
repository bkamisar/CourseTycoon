import { makeHole } from './hole.js';

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
  return parsed;
}

/** Every hole currently open for play. */
export function openHoles(state) {
  return state.resort.courses[0].holes.filter((h) => h.open);
}
