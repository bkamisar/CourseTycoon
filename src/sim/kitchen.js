/**
 * How much food the resort can actually get out, and what happens when it
 * cannot keep up.
 *
 * This is the cost of breadth. A wide menu pleases every crowd a little
 * (see menu.js) and would otherwise be a free hedge against guessing the
 * clientele wrong; here it carries a wage bill instead. A narrow menu
 * aimed at the crowd the course actually draws runs on nobody.
 *
 * It is also what finally makes `kitchenStaff` mean something. The role
 * has existed in economy.js as a $180/day wage that no part of the game
 * read.
 */
import { menuPrep } from './menu.js';
import { clamp } from './hole.js';

/** What a resort manages with no cooks at all: a microwave and a cooler. */
export const BASE_CAPACITY = 3;

/** Prep capacity each kitchen hire adds. */
export const PER_COOK = 4;

/** Slowest the kitchen is allowed to get. A resort that serves nobody
 * reads as broken rather than as difficult. */
export const SERVICE_FLOOR = 0.45;

export function kitchenCapacity(staff = []) {
  const cooks = staff.filter((m) => m.role === 'kitchenStaff').length;
  return BASE_CAPACITY + cooks * PER_COOK;
}

export function kitchenLoad(amenities = []) {
  return amenities.reduce((s, a) => s + menuPrep(a.menu), 0);
}

/**
 * How much of what guests want to order actually reaches them. Scales both
 * revenue and the cost of goods - a kitchen that cannot cook it does not
 * buy it either - and drives the satisfaction penalty in day.js.
 */
export function serviceFactor(load, capacity) {
  if (load <= 0) return 1;
  if (load <= capacity) return 1;
  return clamp(capacity / load, SERVICE_FLOOR, 1);
}
