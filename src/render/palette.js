/**
 * The fixed 8-bit palette. Defined once, used everywhere.
 *
 * Names describe ROLE, not colour. If the palette gets retuned later,
 * `FAIRWAY` should still mean "the colour fairway is drawn in" — a name
 * like `DARK_GREEN` would become a lie the moment that happens.
 *
 * No raw hex values anywhere else in the codebase. Every colour drawn to
 * the canvas comes from this object.
 */
export const PALETTE = Object.freeze({
  // Playing corridor
  FAIRWAY: '#5AC54F', // mown fairway, the base playing surface
  FAIRWAY_SHADOW: '#2E8B3D', // fairway mowing stripes / shaded edge
  FAIRWAY_MOWN: '#4DB848', // the alternate mowing band: the same grass, cut the other way
  ROUGH: '#7C9E3E', // longer grass bordering the corridor — must read as
  // clearly distinct from FAIRWAY at a glance, even on a small screen
  ROUGH_SHADOW: '#587A2C', // shaded / deeper rough
  TREE: '#1B4D2E', // tree clumps and out-of-bounds woods
  TREE_SHADOW: '#133620', // shaded canopy texture inside a tree clump
  TREE_LIGHT: '#3A8A4C', // the sunlit side of a canopy
  TREE_HIGHLIGHT: '#62B45A', // the one or two leaves on a standing tree that catch the sun full on
  SAND: '#E8C170', // bunkers
  SAND_SHADOW: '#A2874E', // the shaded, recessed part of a bunker's bowl
  SAND_LIGHT: '#F6E2A8', // the raked, sunlit floor of a bunker
  WATER: '#3A8FD4', // ponds and hazards, surface
  WATER_DEEP: '#1B4F91', // ponds and hazards, deep water
  WATER_LIGHT: '#9AD4F5', // shoreline foam, glints on a pond, falling rain
  GREEN_SURFACE: '#A8E68C', // the putting green itself
  GREEN_MOWN: '#98DC7A', // the green's alternate mowing check

  // Light. Never painted as a colour in its own right: the whole course is
  // multiplied by one of these (render/light.js), which is why they are pale.
  LIGHT_DAWN: '#BFD3FF', // first thing: cool, a little blue
  LIGHT_DUSK: '#FFB273', // the last hours: low gold sun
  LIGHT_OVERCAST: '#9FB0C4', // under rain cloud: flat and grey

  // Built surfaces
  PATH: '#8B5A2B', // cart paths and walkways
  TEE: '#6B4423', // tee boxes

  // Neutrals
  WHITE: '#F5F5F0', // flags, ball, bright UI text
  OUTLINE: '#14141A', // pixel outlines, near-black shadows

  // UI chrome
  UI_DARK: '#2A2A32', // sheet backgrounds, HUD bar, letterbox-adjacent chrome
  UI_LIGHT: '#C8C8D0', // borders, secondary UI text, dividers

  // Highlight
  ACCENT: '#FFC93C', // money, highlights, calls to action

  // Food and drink. Grass, sand and water do not make a hot dog, so the
  // menu art needs a few colours of its own — but only a few. Bread
  // borrows SAND (a bun really is the colour of a bunker), lettuce and
  // lime borrow FAIRWAY, foam and ice borrow WHITE, glass and shell
  // borrow UI_LIGHT. Minting a FOOD_BREAD that duplicates SAND is how a
  // palette starts drifting into two names for one colour.
  FOOD_MEAT: '#B5543A',      // sausage, patty, bacon, steak
  FOOD_MEAT_PALE: '#E08878', // ham, cooked chicken
  FOOD_RED: '#C0392B',       // tomato, wine, lobster, a wrapper
  FOOD_DRINK: '#E8A020',     // beer and anything amber in a glass
  FOOD_BERRY: '#8E44AD',     // the Transfusion's grape
});
