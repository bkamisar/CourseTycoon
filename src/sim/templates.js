/**
 * Act I hole archetypes. Each populates the same shape the eventual
 * freehand editor will produce, so adding that editor needs no rework.
 * Coordinates are yards; y runs tee-to-green.
 */
export const TEMPLATES = {
  shortPar3: {
    name: 'Short par 3',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 155 }],
    corridorWidth: 34,
    greenPreset: 'small',
    features: [
      { type: 'bunker', x: -16, y: 142, size: 9 },
      { type: 'bunker', x: 15, y: 138, size: 8 },
    ],
  },
  waterPar3: {
    name: 'Par 3 over water',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 178 }],
    corridorWidth: 30,
    greenPreset: 'elevated',
    features: [
      { type: 'pond', x: 0, y: 120, size: 34 },
      { type: 'bunker', x: 18, y: 168, size: 8 },
    ],
  },
  straightPar4: {
    name: 'Straight par 4',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 390 }],
    corridorWidth: 44,
    greenPreset: 'large',
    features: [
      { type: 'bunker', x: -24, y: 250, size: 11 },
      { type: 'trees', x: 34, y: 200, size: 20 },
      { type: 'bunker', x: 17, y: 374, size: 9 },
    ],
  },
  doglegPar4: {
    name: 'Dogleg right par 4',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 210 }, { x: 70, y: 395 }],
    corridorWidth: 40,
    greenPreset: 'tiered',
    features: [
      { type: 'trees', x: 40, y: 170, size: 26 },
      { type: 'bunker', x: 52, y: 300, size: 12 },
      { type: 'bunker', x: 88, y: 386, size: 9 },
    ],
  },
  longPar5: {
    name: 'Long par 5',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 260 }, { x: -55, y: 520 }],
    corridorWidth: 46,
    greenPreset: 'large',
    features: [
      { type: 'bunker', x: -22, y: 240, size: 12 },
      { type: 'pond', x: -70, y: 430, size: 30 },
      { type: 'trees', x: 30, y: 330, size: 24 },
    ],
  },
  reachablePar5: {
    name: 'Reachable par 5',
    corridor: [{ x: 0, y: 0 }, { x: 0, y: 480 }],
    corridorWidth: 50,
    greenPreset: 'small',
    features: [
      { type: 'pond', x: 26, y: 440, size: 26 },
      { type: 'bunker', x: -20, y: 300, size: 10 },
    ],
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
