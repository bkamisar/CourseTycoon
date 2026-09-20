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

/** The tee box: an outlined mat with two tee markers up front. Purely
 * decorative — `lieAt` has no `TEE` lie a real shot can land in (see the
 * comment on drawTeeBox in holeView.js) — so, like `flag`, it is placed
 * unrotated at fixed size regardless of hole scale. That is deliberate:
 * the flag already proved this reads fine both at full hole-editor scale
 * and shrunk onto an overview plot, so the tee follows the same rule
 * rather than inventing a second, scaled convention. */
const tee = [
  '........',
  '.OOOOOO.',
  'OEEEEEEO',
  'OEA..AEO',
  'OEEEEEEO',
  'OEEEEEEO',
  'OOOOOOOO',
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
  tee,
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

/**
 * A 3x5 bitmap alphabet, enough for the hole labels.
 *
 * Canvas fillText anti-aliases, and this game draws at 180x320 and then
 * magnifies by a whole number, so the grey fringe around every glyph is
 * magnified with it and reads as blur. Drawing letters as pixels the same
 * way the sprites do makes them exactly as sharp as everything else.
 */
const GLYPHS = {
  '0': ['###', '# #', '# #', '# #', '###'],
  '1': [' # ', '## ', ' # ', ' # ', '###'],
  '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', '###', '  #', '###'],
  '4': ['# #', '# #', '###', '  #', '  #'],
  '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'],
  '7': ['###', '  #', '  #', '  #', '  #'],
  '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'],
  P: ['###', '# #', '###', '#  ', '#  '],
  D: ['## ', '# #', '# #', '# #', '## '],
  '.': ['   ', '   ', '   ', '   ', ' # '],
  '\u00b7': ['   ', '   ', ' # ', '   ', '   '],
  ' ': ['   ', '   ', '   ', '   ', '   '],
};

export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;
const GLYPH_GAP = 1;

/** Width in pixels that `drawPixelText` will occupy for this string. */
export function pixelTextWidth(text) {
  if (text.length === 0) return 0;
  return text.length * GLYPH_WIDTH + (text.length - 1) * GLYPH_GAP;
}

/** Draws `text` as hard pixels with its top-left at (x, y). */
export function drawPixelText(ctx, text, x, y, colour) {
  const left = Math.round(x);
  const top = Math.round(y);
  ctx.fillStyle = colour;
  let cursor = left;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch];
    if (glyph) {
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] !== ' ') ctx.fillRect(cursor + col, top + row, 1, 1);
        }
      }
    }
    cursor += GLYPH_WIDTH + GLYPH_GAP;
  }
}
