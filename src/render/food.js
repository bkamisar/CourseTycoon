/**
 * Food and drink sprites, 12x12, as pixel grids in source — the same
 * scheme `sprites.js` uses: one character per pixel, `.` transparent,
 * everything else looked up in `FOOD_CHARS` and then in `PALETTE`. No raw
 * hex here, as everywhere else.
 *
 * Bigger than the 8x8 objects in `sprites.js` because those are markers on
 * a map and these are the point of the screen they appear on. The menu
 * board draws them at 2x, so 12x12 is 24 real pixels of phone.
 *
 * They exist at all because the game had spent three slices becoming a
 * reading app — segments, narration and decision events are all words on
 * cards — and food is the most drawable subject in it. A hot dog reads
 * instantly at this size in a way "course rating" never will.
 *
 * The one rule when drawing more: **silhouettes must differ.** Two items
 * the player cannot tell apart at 24px are worse than one item, because
 * the board's whole job is to be scannable. The lobster roll below was
 * redrawn for exactly this reason — as a tan bun with a red filling it was
 * indistinguishable from the hot dog, and it is now a white split-top roll.
 */
import { PALETTE } from './palette.js';

/** Every sprite here is square and this big. */
export const SPRITE_SIZE = 12;

/** Character -> palette key. Shared by every grid below. */
export const FOOD_CHARS = {
  o: 'OUTLINE',
  B: 'SAND',            // bread, bun, pastry, a beer's highlight
  b: 'SAND_SHADOW',     // the shaded underside of bread, a shell ridge
  s: 'FOOD_MEAT',       // sausage, patty, bacon, steak
  h: 'FOOD_MEAT_PALE',  // ham, cooked chicken
  M: 'ACCENT',          // mustard, egg yolk, lemon, chips
  R: 'FOOD_RED',        // tomato, wine, lobster, a wrapper
  L: 'FAIRWAY',         // lettuce, lime, chive, salad
  A: 'FOOD_DRINK',      // beer and anything amber in a glass
  P: 'FOOD_BERRY',      // the Transfusion's grape
  W: 'WHITE',           // foam, ice, chicken, a plate, a split-top roll
  G: 'UI_LIGHT',        // glass, can, shell, bowl
  t: 'TEE',             // a straw
  C: 'PATH',            // coffee, iced tea, dark ale
};

// --- Drinks -----------------------------------------------------------

const domesticCan = [
  '............', '...oooooo...', '...oGGGGo...', '...oGGGGo...',
  '...oRRRRo...', '...oRWWRo...', '...oRWWRo...', '...oRRRRo...',
  '...oGGGGo...', '...oGGGGo...', '...oooooo...', '............',
];

const draught = [
  '............', '..oooooooo..', '..oWWWWWWo..', '..oWWWWWWo..',
  '..oAAAAAAo..', '..oABAAAAo..', '..oABAAAAo..', '..oAAAAAAo..',
  '..oAAAAAAo..', '..oAAAAAAo..', '..oooooooo..', '............',
];

/** A stemmed glass, so it does not read as a second pint. */
const craftAle = [
  '............', '..oooooooo..', '..oWWWWWWo..', '..oCCCCCCo..',
  '..oCCCCCCo..', '..oCCCCCCo..', '...oCCCCo...', '....oCCo....',
  '.....oo.....', '....oooo....', '...oooooo...', '............',
];

/** Tea over lemonade, which is what the drink actually looks like. */
const arnoldPalmer = [
  '......t.....', '...oooooo...', '...oWWWWoMM.', '...oCCCCo...',
  '...oCCCCo...', '...oCCCCo...', '...oAAAAo...', '...oAAAAo...',
  '...oAAAAo...', '...oAAAAo...', '...oooooo...', '............',
];

const bottledWater = [
  '.....oo.....', '....oGGo....', '....oGGo....', '...oGWWGo...',
  '...oGWWGo...', '...oGWWGo...', '...oGWWGo...', '...oGWWGo...',
  '...oGWWGo...', '...oGWWGo...', '....oooo....', '............',
];

/** Small cup, saucer, handle — the saucer is what separates it from the
 * other dark drink at a glance. */
const espresso = [
  '............', '............', '...oooooo...', '...oCCCCo.o.',
  '...oCCCCooo.', '...oCCCCo.o.', '...oCCCCo...', '...oooooo...',
  '..oWWWWWWo..', '..oooooooo..', '............', '............',
];

const wineByGlass = [
  '............', '..oooooooo..', '..oRRRRRRo..', '..oRRRRRRo..',
  '...oRRRRo...', '....oRRo....', '.....oo.....', '.....GG.....',
  '.....GG.....', '....oooo....', '...oooooo...', '............',
];

/** The author's own. Grape and ginger, a lime on the rim, a straw. */
const transfusion = [
  '......t.....', '...oooooo...', '...oWWWWoLL.', '...oPPPPo...',
  '...oPPPPo...', '...oPPPPo...', '...oPPPPo...', '...oPPPPo...',
  '...oPPPPo...', '...oPPPPo...', '...oooooo...', '............',
];

// --- Cold food --------------------------------------------------------

const candyBar = [
  '............', '............', '..oooooooo..', '.oRRRRRRRRo.',
  '.oRWWWWWWRo.', '.oRWRRRRWRo.', '.oRWWWWWWRo.', '.oRRRRRRRRo.',
  '..oooooooo..', '............', '............', '............',
];

/** A clear pouch with the mix visible through it. */
const trailMix = [
  '............', '...oooooo...', '...oGGGGo...', '..oGGGGGGo..',
  '..oGsLsMGo..', '..oGMsGsLo..', '..oGsLMsGo..', '..oGGGGGGo..',
  '..oooooooo..', '............', '............', '............',
];

/** Rolled and seen side-on, so it does not collide with the Caesar
 * wrap's diagonal cut. */
const turkeyWrap = [
  '............', '............', '..oooooooo..', '.oBBBBBBBBo.',
  '.oBhhhhhhBo.', '.oBLLLLLLBo.', '.oBhhhhhhBo.', '.oBBBBBBBBo.',
  '..oooooooo..', '............', '............', '............',
];

/** The author's own. Cut on the diagonal — the most distinctive
 * silhouette on the board, which is why it earns the cut. */
const chickenCaesarWrap = [
  '............', '.......oo...', '......oBBo..', '.....oBWLBo.',
  '....oBWLWBo.', '...oBWLWLBo.', '..oBWLWLWBo.', '.oBWLWLWLBo.',
  '.oBBBBBBBBo.', '..oooooooo..', '............', '............',
];

// --- Hot food ---------------------------------------------------------

const hotDog = [
  '............', '............', '............', '...oooooo...',
  '..oBBBBBBo..', '.oBssssssBo.', '.oBsMMMMsBo.', '.oBssssssBo.',
  '..oBBBBBBo..', '...oooooo...', '............', '............',
];

/** The author's own. Muffin, egg, bacon, stacked. */
const breakfastSandwich = [
  '............', '............', '..oooooooo..', '.oBBBBBBBBo.',
  '.obbbbbbbbo.', '.oMMMMMMMMo.', '.osssssssso.', '.oBBBBBBBBo.',
  '.oBBBBBBBBo.', '..oooooooo..', '............', '............',
];

const chiliBowl = [
  '............', '............', '............', '..oooooooo..',
  '.oRRRRRRRRo.', '.oRsRRsRRRo.', '.oGRRRRRRGo.', '.oGGGGGGGGo.',
  '..oGGGGGGo..', '...oooooo...', '............', '............',
];

const burgerFries = [
  '............', '...oooooo...', '..oBBBBBBo..', '.oBBBBBBBBo.',
  '.oLLLLLLLLo.', '.oRRRRRRRRo.', '.osssssssso.', '.oBBBBBBBBo.',
  '..oooooooo..', '............', '............', '............',
];

const clubSandwich = [
  '............', '.....oo.....', '....oBBo....', '...oBBBBo...',
  '...oLLLLo...', '..oBBBBBBo..', '..oRRRRRRo..', '.oBBBBBBBBo.',
  '.ohhhhhhhho.', '.oBBBBBBBBo.', '..oooooooo..', '............',
];

/** Leaves spilling over the rim, which is the only thing that reads as
 * "salad" rather than "bowl" at this size. */
const seasonalSalad = [
  '............', '............', '..L.L..L.L..', '.LLLLLLLLLL.',
  '.oLLRLLRLLo.', '.oGLLLLLLGo.', '.oGGGGGGGGo.', '..oGGGGGGo..',
  '...oooooo...', '............', '............', '............',
];

/** The hardest thing on the menu to draw at 12x12, and it took four
 * attempts: two flat grey rectangles, then one ridged shell that read as
 * a white blob, then two tall shells that read as salt and pepper
 * shakers. Flat and stacked is what finally works — oysters are wide, not
 * tall, and the ridged rim is what says "shell" rather than "bowl". */
const oysters = [
  '............', '..oooooooo..', '.oGbbbbbbGo.', '.oGWWRWWWGo.',
  '.oGbbbbbbGo.', '..oooooooo..', '..oooooooo..', '.oGbbbbbbGo.',
  '.oGWWWWRWGo.', '.oGbbbbbbGo.', '..oooooooo..', '............',
];

/** A white split-top roll, not a tan bun. As a tan bun with red filling
 * this was indistinguishable from the hot dog at 24px. */
const lobsterRoll = [
  '............', '............', '...oooooo...', '..oWWWWWWo..',
  '.oWRRRRRRWo.', '.oWRLRRLRWo.', '.oWRRRRRRWo.', '.oBWWWWWWBo.',
  '..oBBBBBBo..', '...oooooo...', '............', '............',
];

/** Steak on the left, chips on the right — the only two-object sprite
 * here, because "frites" is half the name and the first version had none,
 * which left a $42 item reading as a brown rectangle. The darker stripes
 * are grill marks; without them the steak is a flat slab at any size. */
const steakFrites = [
  '............', '............', '.........M.M', '.ooooooooMMM',
  '.ossssssoMMM', '.osCsCssoMMM', '.ossssssoMMM', '.osCsCssoMMM',
  '.ossssssoMMM', '.oooooooo...', '............', '............',
];

/**
 * Every item in the catalogue, by the same id `src/sim/menu.js` uses.
 *
 * `tests/food.test.js` checks this both ways — every item has art, and no
 * art exists for an item that is not on the menu. Both directions matter:
 * a missing sprite is a blank square on the board, and this exact failure
 * has shipped here before (`SPRITES.tee` was defined, never registered,
 * every test passed, and the render loop died on page load).
 */
// --- The brew pub's twelve --------------------------------------------
//
// Nine beers beside each other is the hardest test of the silhouette rule
// at the top of this file, because a beer is a glass of amber liquid and
// so is a beer. Colour cannot carry it alone, so every one of these is a
// different GLASS: a narrow flute, a handled mug, a tapered pint, a
// conical shaker, a squat goblet, a waisted vase, a bulged nonic, a small
// snifter, and a paddle. Read the shapes with the colour turned off and
// they still tell you which is which.

/** Tall, narrow, pale gold. The thinnest thing on the board. */
const pilsner = [
  '............', '....oooo....', '....oWWo....', '....oMMo....',
  '....oMMo....', '....oMMo....', '...oMMMMo...', '...oMMMMo...',
  '...oMMMMo...', '...oooooo...', '....oooo....', '............',
];

/** The only glass here with a handle. */
const caskBitter = [
  '............', '..oooooo....', '..oWWWWo....', '..oAAAAoooo.',
  '..oAAAAo..o.', '..oAAAAo..o.', '..oAAAAoooo.', '..oAAAAo....',
  '..oAAAAo....', '..oooooo....', '............', '............',
];

/** Tapered pint, near black, two rows of head. */
const stout = [
  '............', '..oooooooo..', '..oWWWWWWo..', '..oWWWWWWo..',
  '..oCCCCCCo..', '..oCCCCCCo..', '...oCCCCo...', '...oCCCCo...',
  '...oCCCCo...', '...oooooo...', '............', '............',
];

/** Conical shaker — wide at the bottom, which nothing else is. */
const hazyIpa = [
  '............', '...oooooo...', '...oWWWWo...', '...oMMMMo...',
  '..oMMMMMMo..', '..oMMMMMMo..', '..oMMMMMMo..', '..oMMMMMMo..',
  '..oMMMMMMo..', '..oooooooo..', '............', '............',
];

/** Squat goblet, and the only pink drink that is not the wine. */
const sourAle = [
  '............', '............', '..oooooooo..', '..oRRRRRRo..',
  '..oRRRRRRo..', '...oRRRRo...', '....oRRo....', '.....oo.....',
  '.....oo.....', '....oooo....', '...oooooo...', '............',
];

/** Waisted vase with a tall head. */
const hefeweizen = [
  '............', '...oooooo...', '...oWWWWo...', '..oWWWWWWo..',
  '..oMMMMMMo..', '...oMMMMo...', '...oMMMMo...', '..oMMMMMMo..',
  '..oMMMMMMo..', '..oooooooo..', '............', '............',
];

/** A nonic, bulged near the top. */
const brownAle = [
  '............', '..oooooooo..', '..oWWWWWWo..', '..obbbbbbo..',
  '.obbbbbbbbo.', '.obbbbbbbbo.', '..obbbbbbo..', '..obbbbbbo..',
  '..obbbbbbo..', '..oooooooo..', '............', '............',
];

/** Small snifter. The shortest glass here. */
const porter = [
  '............', '............', '............', '...oooooo...',
  '..oCCCCCCo..', '..oCCCCCCo..', '..oCCCCCCo..', '...oCCCCo...',
  '.....oo.....', '....oooo....', '...oooooo...', '............',
];

/** Three glasses on a paddle. Nothing else on the board is three of
 * anything, so it reads instantly at 24 pixels. */
const beerFlight = [
  '............', '............', '.ooo.ooo.ooo', '.oMo.oAo.oCo',
  '.oMo.oAo.oCo', '.oMo.oAo.oCo', '.ooo.ooo.ooo', '............',
  'BBBBBBBBBBBB', 'BbbbbbbbbbbB', 'BBBBBBBBBBBB', '............',
];

export const FOOD_SPRITES = {
  domesticCan, draught, craftAle, arnoldPalmer, bottledWater, transfusion,
  espresso, wineByGlass,
  pilsner, caskBitter, stout, hazyIpa, sourAle,
  hefeweizen, brownAle, porter, beerFlight, candyBar, trailMix, turkeyWrap, chickenCaesarWrap,
  hotDog, breakfastSandwich, chiliBowl, burgerFries, clubSandwich,
  seasonalSalad, oysters, lobsterRoll, steakFrites,
};

/**
 * Draws an item into its own canvas at `scale` pixels per sprite pixel,
 * for embedding in the DOM menu board.
 *
 * `imageSmoothingEnabled = false` is not optional. A smoothed 12x12 blown
 * up to 24 reads as a smudge rather than as pixel art, and this game has
 * already lost artwork twice to smoothing — once to a radial gradient that
 * magnified into blur, once to anti-aliased `fillText` used for hole
 * labels.
 */
export function foodSpriteCanvas(id, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE * scale;
  canvas.height = SPRITE_SIZE * scale;
  canvas.style.width = `${SPRITE_SIZE * scale}px`;
  canvas.style.height = `${SPRITE_SIZE * scale}px`;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';

  const grid = FOOD_SPRITES[id];
  if (!grid) return canvas;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < SPRITE_SIZE; row++) {
    for (let col = 0; col < SPRITE_SIZE; col++) {
      const ch = grid[row][col];
      if (ch === '.') continue;
      const key = FOOD_CHARS[ch];
      if (!key) continue;
      ctx.fillStyle = PALETTE[key];
      ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }
  return canvas;
}
