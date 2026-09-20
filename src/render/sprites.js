/**
 * Sprites as pixel grids in source. Each sprite is an array of strings, one
 * character per pixel, read top-to-bottom / left-to-right. `.` draws
 * nothing (transparent) — everything else is looked up in `SPRITE_CHARS`,
 * which maps a single character to a `PALETTE` key. No raw hex anywhere
 * here; colour always comes from `PALETTE` by way of that map.
 *
 * Sizes: 8x8 for objects and building icons, 8x12 for the golfer (a little
 * taller reads better as a standing figure). Kept intentionally tiny —
 * these are drawn at true size on a phone screen, not zoomed, so legibility
 * at 8x8 is the actual design constraint, not a preview convenience.
 */
import { PALETTE } from './palette.js';

/** Shared character -> palette key mapping, used by every sprite below. */
export const SPRITE_CHARS = {
  O: 'OUTLINE',
  W: 'WHITE',
  A: 'ACCENT',
  D: 'UI_DARK',
  L: 'UI_LIGHT',
  T: 'TREE',
  P: 'PATH',
  E: 'TEE',
  G: 'GREEN_SURFACE',
  S: 'SAND',
  B: 'WATER',
  V: 'WATER_DEEP',
  F: 'FAIRWAY',
  H: 'FAIRWAY_SHADOW',
  R: 'ROUGH',
  K: 'ROUGH_SHADOW',
};

// --- Actors -----------------------------------------------------------

/** Golfer, walk frame 1: right leg forward. 8 wide x 12 tall. */
const golferWalk1 = [
  '..AAA...',
  '..OWO...',
  '..OOO...',
  '.DWWWD..',
  '.DWWWD..',
  '..DWD...',
  '..DWD...',
  '.DD.WD..',
  '.DD.WD..',
  'OO...WO.',
  '........',
  '........',
];

/** Golfer, walk frame 2: left leg forward (mirror stance of frame 1). */
const golferWalk2 = [
  '..AAA...',
  '..OWO...',
  '..OOO...',
  '.DWWWD..',
  '.DWWWD..',
  '..DWD...',
  '..DWD...',
  '..DW.DD.',
  '..DW.DD.',
  '.OW...OO',
  '........',
  '........',
];

const flag = [
  '...AAA..',
  '...AAA..',
  '...AAAA.',
  '...AA...',
  '...OO...',
  '...OO...',
  '...OO...',
  '..OOOO..',
];

const tree = [
  '..TTTT..',
  '.TTTTTT.',
  'TTTTTTTT',
  'TTTTTTTT',
  '.TTTTTT.',
  '...EE...',
  '...EE...',
  '...EE...',
];

const ball = [
  '........',
  '..OOO...',
  '.OWWWO..',
  '.OWWWO..',
  '.OWWWO..',
  '..OOO...',
  '........',
  '........',
];

const cart = [
  '.DDDDD..',
  '.DWWWD..',
  'LWWWWWL.',
  'LWWWWWL.',
  'LLLLLLLL',
  'LAAAAAAL',
  'OO....OO',
  '........',
];

// --- Building icons -----------------------------------------------------
// Each 8x8. Every icon has a distinct roof silhouette AND a distinct wall
// colour/marking so pairs stay distinguishable when read as flat colour
// blobs at true size, not just by outline.

const clubhouse = [
  '...A....',
  '...A....',
  'DDDDDDDD',
  'OLLLLLLO',
  'OLWLLWLO',
  'OLLLLLLO',
  'OLDDDDLO',
  'OOOOOOOO',
];

const proShop = [
  '........',
  'AWAWAWAW',
  'OLLLLLLO',
  'OLWWWWLO',
  'OLWAAWLO',
  'OLWWWWLO',
  'OPPPPPPO',
  'OOOOOOOO',
];

const snackShack = [
  '........',
  'EEEEEEEE',
  'OSSSSSSO',
  'OWWWWWWO',
  'OS....SO',
  'OSSSSSSO',
  'OPPPPPPO',
  'OOOOOOOO',
];

const halfwayHouse = [
  '..EEEE..',
  '.EEEEEE.',
  'OEEEEEEO',
  'OEWEEWEO',
  'OEEDDEEO',
  'OEE..EEO',
  'OEEEEEEO',
  'OOOOOOOO',
];

const restaurant = [
  'AAAAAAAA',
  'OOOOOOOO',
  'OPPWWPPO',
  'OPPWWPPO',
  'OPPPPPPO',
  'OPPDDPPO',
  'OPP..PPO',
  'OOOOOOOO',
];

const restrooms = [
  '........',
  'OOOOOOOO',
  'ODDDDDDO',
  'ODWDDWDO',
  'ODDDDDDO',
  'ODLDDLDO',
  'OPPPPPPO',
  'OOOOOOOO',
];

const drivingRange = [
  'O......O',
  'O.WWWW.O',
  'O.WWWW.O',
  'O.WWWW.O',
  'O......O',
  'O..GG..O',
  'R..GG..R',
  'RRRGGRRR',
];

const practiceGreen = [
  '........',
  '....A...',
  '....O...',
  '..GGGG..',
  '.GGGGGG.',
  'GGGGGGGG',
  '.GGGGGG.',
  'RR....RR',
];

const cartBarn = [
  '...AA...',
  '..AAAA..',
  '.AAAAAA.',
  'OOOOOOOO',
  'OPWWWWPO',
  'OPWWWWPO',
  'OPEEDDPO',
  'OOOOOOOO',
];

export const SPRITES = {
  golferWalk1,
  golferWalk2,
  flag,
  tree,
  ball,
  cart,
  clubhouse,
  proShop,
  snackShack,
  halfwayHouse,
  restaurant,
  restrooms,
  drivingRange,
  practiceGreen,
  cartBarn,
};

/**
 * Blits a sprite at integer canvas coordinates. Coordinates are rounded —
 * drawing at fractional positions defeats the pixel grid the whole render
 * is built on, softening edges the way fractional canvas scaling would.
 *
 * `flip` mirrors the sprite horizontally (for a golfer walking left, say)
 * without needing a second set of pixel data.
 */
export function drawSprite(ctx, sprite, x, y, { flip = false } = {}) {
  const ox = Math.round(x);
  const oy = Math.round(y);
  const width = sprite[0].length;

  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === '.') continue;
      const paletteKey = SPRITE_CHARS[ch];
      if (!paletteKey) continue;
      const px = flip ? width - 1 - col : col;
      ctx.fillStyle = PALETTE[paletteKey];
      ctx.fillRect(ox + px, oy + row, 1, 1);
    }
  }
}
