/**
 * The top HUD bar: money, day number, and four ratings — satisfaction
 * included.
 *
 * `computeHudData` is the pure half — every figure it returns is read
 * straight off `state` or off a `src/sim/ratings.js` call, never computed
 * here. Course rating in particular mirrors exactly what `src/sim/day.js`
 * does for the same state (rating is 0 with no open holes, otherwise
 * `courseRating(openHoles(state), state.turfQuality)`), so the HUD figure
 * always agrees with what the day's own report will say.
 *
 * Satisfaction is the one figure here that isn't derived from `state`
 * directly — it's read off the most recent day's own report,
 * `state.history[state.history.length - 1].averageSatisfaction`, because
 * that's the only place "satisfaction" is actually computed (in
 * `src/sim/day.js`, from a day's simulated rounds). Day one has no report
 * yet, so `satisfaction` is `null` rather than a misleading zero — the DOM
 * half below shows a dash for that case instead of pretending nobody is
 * enjoying themselves.
 */
import { PALETTE } from '../render/palette.js';
import { openHoles } from '../sim/state.js';
import { courseRating } from '../sim/ratings.js';

export function computeHudData(state) {
  const holes = openHoles(state);
  const rating = holes.length ? courseRating(holes, state.turfQuality) : 0;
  const lastReport = state.history.length ? state.history[state.history.length - 1] : null;
  return {
    money: state.money,
    day: state.day,
    courseRating: Math.round(rating),
    prestige: Math.round(state.prestige),
    turfQuality: Math.round(state.turfQuality),
    satisfaction: lastReport ? Math.round(lastReport.averageSatisfaction) : null,
  };
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* No position:fixed here — this bar is mounted into a shared
       ".top-chrome" wrapper (see main.js) that is itself fixed at the
       top of the viewport, alongside the amenity strip below it. Both
       stack in normal flow inside that one wrapper, so the amenity strip
       always sits directly under whatever height this bar actually
       renders at, instead of assuming one. */
    .hud-bar {
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
    const satText = data.satisfaction === null ? '—' : data.satisfaction;
    // "Happy" rather than "Sat": the author read the abbreviation and had to
    // ask what it meant, which is the whole test a HUD label has to pass.
    ratings.textContent = `Happy ${satText} · CR ${data.courseRating} · Prestige ${data.prestige} · Turf ${data.turfQuality}`;
    return data;
  }

  return { element: bar, update };
}
