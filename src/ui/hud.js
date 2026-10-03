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
import { withinBand } from '../sim/tournaments.js';
import { openHoles } from '../sim/state.js';
import { championshipStatus } from '../sim/championshipWeek.js';
import { toParText } from './toPar.js';
import { courseRating } from '../sim/ratings.js';
import { SEGMENTS, SEGMENT_KEYS } from '../sim/segments.js';

/**
 * What the HUD needs to know about a booked championship, or null.
 *
 * `inBand` rides along because a countdown that does not say whether the
 * course is set right is a clock rather than information -- the run-up is
 * three weeks long and the one thing a player needs to glance at is
 * whether the crew are heading for a number that will score.
 *
 * The judge is now the winning total on a course hard enough for the rung,
 * so the run-up readout carries the course's difficulty against the floor
 * beside the setup (which is guidance now), and once the week is under way
 * it switches to the round, the leader's pace and the target -- the thing
 * being judged. Every figure comes from `championshipStatus`, which
 * measures the course the way the judge does, so this line cannot say
 * "ready" about a course the verdict will fail.
 *
 * Null for an unknown rung rather than throwing. This is drawn every
 * frame, and a save from a future version should not be the thing that
 * takes the game down.
 */
function tournamentReadout(state) {
  const status = championshipStatus(state);
  if (!status) return null;
  const { rung, week } = status;
  const setup = Math.round(state.resort.setup ?? 0);
  return {
    label: rung.label,
    short: rung.short ?? rung.label,
    daysLeft: Math.max(0, week.day - state.day),
    setup,
    inBand: withinBand(setup, rung.band),
    band: rung.band,
    // Floored, not rounded: 64.6 against a floor of 65 must not print as
    // "65" beside a warning colour.
    difficulty: Math.floor(status.difficulty),
    minDifficulty: status.minDifficulty,
    difficultyMet: status.difficultyMet,
    inWeek: status.inWeek,
    round: status.round,
    rounds: status.rounds,
    leaderToPar: status.leaderToPar,
    projectedTotal: status.projectedTotal,
    target: status.target,
  };
}

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
    // Act III. Null when nothing is booked, so the HUD simply does not
    // draw it and Acts I and II carry none of Act III's furniture.
    tournament: tournamentReadout(state),
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
    /* Its own full-width row, like the crowd bars below: on a phone the
       readout shared the bar with money, day and four ratings and was
       squeezed out of sight. One line, clipped with an ellipsis rather than
       wrapped, so the bar never grows taller mid-week. */
    .hud-tournament {
      padding: 2px 10px;
      background: ${PALETTE.UI_DARK};
      color: ${PALETTE.FAIRWAY};
      font-family: monospace;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .hud-tournament[hidden] { display: none; }
    .hud-tournament--off { color: ${PALETTE.SAND}; }
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
  const tournament = document.createElement('span');
  tournament.className = 'hud-tournament';
  tournament.hidden = true;

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
  wrap.append(bar, tournament, crowdRow);
  root.appendChild(wrap);

  function update(state) {
    const data = computeHudData(state);
    money.textContent = `$${Math.round(data.money).toLocaleString()}`;
    day.textContent = `Day ${data.day}`;
    const satText = data.satisfaction === null ? '—' : data.satisfaction;
    // "Happy" rather than "Sat": the author read the abbreviation and had to
    // ask what it meant, which is the whole test a HUD label has to pass.
    ratings.textContent = `Happy ${satText} · CR ${data.courseRating} · Prestige ${data.prestige} · Turf ${data.turfQuality}`;

    // The championship, with what it is judged on beside it -- the number
    // alone does not tell the player whether it is the right number.
    if (data.tournament) {
      const t = data.tournament;
      if (t.inWeek) {
        // The pace segment waits for a first round: before it there is no
        // leader, and "leads —" is noise on a line with room for little.
        const pace = t.leaderToPar === null ? ''
          : ` · leads ${toParText(t.leaderToPar)} · on pace ${toParText(t.projectedTotal)}`;
        tournament.textContent = `R${t.round}/${t.rounds}${pace}`
          + ` (target ${toParText(t.target.low)}…${toParText(t.target.high)})`;
        // `difficultyMet` here is the judge's own: live on the first
        // morning, then the figure it settled. Once that says the course
        // was too easy the week pays the base fee whatever the scores do,
        // and the row says so rather than staying green.
        tournament.classList.toggle('hud-tournament--off', !t.difficultyMet);
      } else {
        const when = t.daysLeft === 0 ? 'today' : `${t.daysLeft}d`;
        tournament.textContent = `${t.short} ${when} · setup ${t.setup} (${t.band.low}–${t.band.high})`
          + ` · course ${t.difficulty}/${t.minDifficulty}`;
        tournament.classList.toggle('hud-tournament--off', !t.inBand || !t.difficultyMet);
      }
      tournament.hidden = false;
    } else {
      tournament.hidden = true;
    }

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
