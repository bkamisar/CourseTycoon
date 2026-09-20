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
  ROUGH: '#8A9A3B', // longer grass bordering the corridor — must read as
  // clearly distinct from FAIRWAY at a glance, even on a small screen
  ROUGH_SHADOW: '#5E6B28', // shaded / deeper rough
  TREE: '#1B4D2E', // tree clumps and out-of-bounds woods
  TREE_SHADOW: '#133620', // shaded canopy texture inside a tree clump
  SAND: '#E8C170', // bunkers
  SAND_SHADOW: '#A2874E', // the shaded, recessed part of a bunker's bowl
  WATER: '#3A8FD4', // ponds and hazards, surface
  WATER_DEEP: '#1B4F91', // ponds and hazards, deep water
  GREEN_SURFACE: '#A8E68C', // the putting green itself

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
});
