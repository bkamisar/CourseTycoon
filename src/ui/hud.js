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
import { SEGMENTS, SEGMENT_KEYS } from '../sim/segments.js';

export function computeHudData(state) {
  const holes = openHoles(state);
  const lastReport = state.history.length ? state.history[state.history.length - 1] : null;
  const rating = holes.length
    ? courseRating(holes, state.turfQuality, lastReport?.crowd ?? null)
    : 0;
  return {
    money: state.money,
    day: state.day,
    courseRating: Math.round(rating),
    prestige: Math.round(state.prestige),
    turfQuality: Math.round(state.turfQuality),
    satisfaction: lastReport ? Math.round(lastReport.averageSatisfaction) : null,
    crowd: crowdBars(lastReport),
  };
}

/**
 * The three crowds as shares of yesterday's golfers, for the HUD bars.
 *
 * These live in the top bar rather than only in the evening report so that
 * the thing the whole game turns on - that no course pleases everybody - is
 * present while the player is building, not discovered at bedtime. Dig a
 * pond and watch the locals bar sag.
 *
 * Null before the first day has been played: a resort that has never opened
 * has no crowd, and inventing an even split would be a lie.
 */
export function crowdBars(report) {
  if (!report?.crowd) return null;
  let total = 0;
  for (const key of SEGMENT_KEYS) total += report.crowd[key]?.count ?? 0;
  if (total === 0) return null;
  return SEGMENT_KEYS.map((key) => ({
    key,
    label: SEGMENTS[key].label,
    count: report.crowd[key]?.count ?? 0,
    share: (report.crowd[key]?.count ?? 0) / total,
  }));
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
    .hud-wrap {
      display: flex;
      flex-direction: column;
      pointer-events: none;
    }
    .hud-crowd {
      display: flex;
      gap: 6px;
      padding: 2px 8px 4px;
      background: ${PALETTE.UI_DARK};
    }
    .hud-crowd[hidden] { display: none; }
    .hud-crowd-cell {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .hud-crowd-label {
      color: ${PALETTE.UI_LIGHT};
      font-family: monospace;
      font-size: 9px;
      white-space: nowrap;
    }
    .hud-crowd-track {
      flex: 1;
      height: 4px;
      min-width: 12px;
      background: ${PALETTE.OUTLINE};
    }
    .hud-crowd-fill {
      height: 100%;
      width: 0%;
      transition: width 200ms linear;
    }
    .hud-crowd-fill--locals { background: ${PALETTE.FAIRWAY}; }
    .hud-crowd-fill--serious { background: ${PALETTE.SAND}; }
    .hud-crowd-fill--destination { background: ${PALETTE.WATER}; }
    .hud-crowd-pct {
      color: ${PALETTE.WHITE};
      font-family: monospace;
      font-size: 9px;
      min-width: 22px;
      text-align: right;
    }
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

  // The three crowds, as bars, always on screen. The whole game turns on the
  // fact that no course pleases everybody, and until now that only showed up
  // in the evening report - so the player met the consequence hours after the
  // decision. Here it moves while they build.
  const crowdRow = document.createElement('div');
  crowdRow.className = 'hud-crowd';
  const bars = {};
  for (const key of SEGMENT_KEYS) {
    const cell = document.createElement('div');
    cell.className = 'hud-crowd-cell';
    const label = document.createElement('span');
    label.className = 'hud-crowd-label';
    label.textContent = SEGMENTS[key].shortLabel ?? SEGMENTS[key].label;
    const track = document.createElement('div');
    track.className = 'hud-crowd-track';
    const fill = document.createElement('div');
    fill.className = `hud-crowd-fill hud-crowd-fill--${key}`;
    track.appendChild(fill);
    const pct = document.createElement('span');
    pct.className = 'hud-crowd-pct';
    cell.append(label, track, pct);
    crowdRow.appendChild(cell);
    bars[key] = { fill, pct };
  }

  const wrap = document.createElement('div');
  wrap.className = 'hud-wrap';
  wrap.append(bar, crowdRow);
  root.appendChild(wrap);

  function update(state) {
    const data = computeHudData(state);
    money.textContent = `$${Math.round(data.money).toLocaleString()}`;
    day.textContent = `Day ${data.day}`;
    const satText = data.satisfaction === null ? '—' : data.satisfaction;
    // "Happy" rather than "Sat": the author read the abbreviation and had to
    // ask what it meant, which is the whole test a HUD label has to pass.
    ratings.textContent = `Happy ${satText} · CR ${data.courseRating} · Prestige ${data.prestige} · Turf ${data.turfQuality}`;

    // Before the first day there is no crowd, and inventing an even split
    // would be a lie, so the row hides rather than showing three empty bars.
    crowdRow.hidden = data.crowd === null;
    if (data.crowd) {
      for (const entry of data.crowd) {
        bars[entry.key].fill.style.width = `${Math.round(entry.share * 100)}%`;
        bars[entry.key].pct.textContent = `${Math.round(entry.share * 100)}%`;
      }
    }
    return data;
  }

  return { element: wrap, update };
}
