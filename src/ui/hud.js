/**
 * The top HUD bar: money, day number, and the three ratings.
 *
 * `computeHudData` is the pure half — every figure it returns is read
 * straight off `state` or off a `src/sim/ratings.js` call, never computed
 * here. Course rating in particular mirrors exactly what `src/sim/day.js`
 * does for the same state (rating is 0 with no open holes, otherwise
 * `courseRating(openHoles(state), state.turfQuality)`), so the HUD figure
 * always agrees with what the day's own report will say.
 */
import { PALETTE } from '../render/palette.js';
import { openHoles } from '../sim/state.js';
import { courseRating } from '../sim/ratings.js';

export function computeHudData(state) {
  const holes = openHoles(state);
  const rating = holes.length ? courseRating(holes, state.turfQuality) : 0;
  return {
    money: state.money,
    day: state.day,
    courseRating: Math.round(rating),
    prestige: Math.round(state.prestige),
    turfQuality: Math.round(state.turfQuality),
  };
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .hud-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      background: ${PALETTE.UI_DARK};
      border-bottom: 2px solid ${PALETTE.OUTLINE};
      color: ${PALETTE.WHITE};
      font-family: monospace;
      font-size: 12px;
      box-sizing: border-box;
      z-index: 10;
      pointer-events: none;
    }
    .hud-money {
      color: ${PALETTE.ACCENT};
      font-weight: bold;
      white-space: nowrap;
    }
    .hud-day {
      white-space: nowrap;
    }
    .hud-ratings {
      color: ${PALETTE.UI_LIGHT};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
    }
  `;
  document.head.appendChild(style);
}

/** Mounts the HUD bar into `root` and returns `{ element, update(state) }`. */
export function mountHud(root) {
  injectStyles();

  const bar = document.createElement('div');
  bar.className = 'hud-bar';

  const money = document.createElement('span');
  money.className = 'hud-money';
  const day = document.createElement('span');
  day.className = 'hud-day';
  const ratings = document.createElement('span');
  ratings.className = 'hud-ratings';

  bar.append(money, day, ratings);
  root.appendChild(bar);

  function update(state) {
    const data = computeHudData(state);
    money.textContent = `$${Math.round(data.money).toLocaleString()}`;
    day.textContent = `Day ${data.day}`;
    ratings.textContent = `CR ${data.courseRating} · Prestige ${data.prestige} · Turf ${data.turfQuality}`;
    return data;
  }

  return { element: bar, update };
}
