/**
 * The evening report: a full scrollable screen of real DOM text (not
 * canvas-drawn, so it is selectable and scales with the player's own text
 * settings), shown after a day plays out.
 *
 * `computeReportData` is the pure half -- every figure it returns is read
 * straight off `report` (itself entirely produced by `src/sim/day.js`) or
 * derived from it with plain arithmetic (a delta between two numbers, an
 * ordinal for a hole index). It never re-derives a game outcome; the UI
 * showing a different profit than the simulation computed is exactly the
 * kind of drift this file must not introduce.
 *
 * `mountReport` is the DOM half, exercised by hand in the browser (see the
 * Task 9 report) rather than under `node --test`, the same split
 * `src/ui/hud.js` already uses.
 */
import { PALETTE } from '../render/palette.js';
import { ordinal } from '../sim/satisfaction.js';
import { openHoles } from '../sim/state.js';
import { TARGET_MINUTES_PER_HOLE } from '../sim/schedule.js';

const RATING_SPECS = [
  { key: 'courseRating', label: 'Course Rating' },
  { key: 'prestige', label: 'Prestige' },
  { key: 'turfQuality', label: 'Turf Quality' },
];

/**
 * Extracts everything the report screen shows from `state` (the state
 * `runDay` returned -- its `history` already ends with `report`) and
 * `report` (that same day's report). Yesterday's report, when there is
 * one, is `state.history[state.history.length - 2]`: `history`'s last
 * entry is today's, pushed by `runDay` before it returned.
 */
/**
 * What the pace line should actually say.
 *
 * Round time is playing time PLUS waiting, so a course of long, punishing
 * holes blows past the target with nobody queueing at all. The report used
 * to call that "groups are backing up" while the very next line said
 * nobody waited on anybody - a flat contradiction, and worse, it pointed
 * the player at the wrong lever.
 *
 * The two problems have opposite fixes. Backing up means the tee interval
 * is too tight, and the interval slider fixes it. Slow holes with no queue
 * mean the course itself is punishing, and softening holes or buying carts
 * fixes that. So the verdict has to know which one it is looking at.
 */
export function paceVerdict({ avgMinutes, targetMinutes, hadWaits }) {
  if (avgMinutes <= targetMinutes) {
    return { kind: 'onPace', verdict: 'Right on pace.' };
  }
  if (hadWaits) {
    return {
      kind: 'backedUp',
      verdict: 'Groups are backing up. Try a wider tee interval.',
    };
  }
  return {
    kind: 'slowHoles',
    verdict: 'Nobody queued - these holes just play slowly.',
  };
}

export function computeReportData(state, report) {
  const history = state.history;
  const previous = history.length >= 2 ? history[history.length - 2] : null;

  const ratings = RATING_SPECS.map(({ key, label }) => ({
    key,
    label,
    value: Math.round(report[key]),
    delta: previous ? report[key] - previous[key] : null,
  }));

  const bottleneckHoleName =
    report.bottleneckHoleIndex === null || report.bottleneckHoleIndex === undefined
      ? null
      : ordinal(report.bottleneckHoleIndex + 1);

  // A bare minutes figure means nothing to a new player. 16 minutes a hole
  // (TARGET_MINUTES_PER_HOLE, see schedule.js) is the clean-round pace from
  // the balance pass, so the target for THIS course is that times however
  // many holes are actually open today.
  const targetRoundMinutes = openHoles(state).length * TARGET_MINUTES_PER_HOLE;

  return {
    day: report.day,
    profit: report.profit,
    revenue: report.revenue,
    costs: report.costs,
    ratings,
    averageRoundMinutes: report.averageRoundMinutes,
    targetRoundMinutes,
    bottleneckHoleName,
    overrunGroups: report.overrunGroups,
    groupsPlayed: report.groupsPlayed,
    averageSatisfaction: report.averageSatisfaction,
    complaints: report.complaints,
    gate: {
      passed: report.gate.passed,
      nearGate: report.gate.nearGate,
      outstanding: report.gate.outstanding,
      items: report.gate.conditions.map((c) => ({ label: c.label, met: c.met })),
    },
  };
}

// --- DOM ---------------------------------------------------------------

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .report-screen {
      position: fixed;
      inset: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      background: ${PALETTE.OUTLINE};
      color: ${PALETTE.WHITE};
      font-family: monospace;
      box-sizing: border-box;
      padding: 22px 18px 40px;
      z-index: 25;
    }
    .report-day {
      color: ${PALETTE.UI_LIGHT};
      font-size: 13px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin: 0 0 4px;
    }
    .report-profit-label {
      color: ${PALETTE.UI_LIGHT};
      font-size: 12px;
      margin: 0;
    }
    .report-profit {
      color: ${PALETTE.ACCENT};
      font-size: 34px;
      font-weight: bold;
      margin: 0 0 14px;
      line-height: 1.1;
    }
    .report-breakdown {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 10px;
      font-size: 13px;
      margin-bottom: 22px;
      background: ${PALETTE.UI_DARK};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
      padding: 10px 12px;
    }
    .report-breakdown-heading {
      grid-column: 1 / -1;
      color: ${PALETTE.UI_LIGHT};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 6px;
    }
    .report-breakdown-heading:first-child { margin-top: 0; }
    .report-breakdown-row { color: ${PALETTE.UI_LIGHT}; }
    .report-breakdown-value { text-align: right; color: ${PALETTE.WHITE}; }
    .report-breakdown-total { color: ${PALETTE.WHITE}; font-weight: bold; }
    .report-breakdown-total.report-breakdown-value { color: ${PALETTE.ACCENT}; }

    .report-section-title {
      color: ${PALETTE.UI_LIGHT};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 8px;
    }

    .report-ratings {
      display: flex;
      gap: 8px;
      margin-bottom: 22px;
    }
    .report-rating {
      flex: 1;
      background: ${PALETTE.UI_DARK};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
      padding: 8px;
      text-align: center;
    }
    .report-rating-label { color: ${PALETTE.UI_LIGHT}; font-size: 10px; margin-bottom: 4px; }
    .report-rating-value { color: ${PALETTE.WHITE}; font-size: 18px; font-weight: bold; }
    .report-rating-delta { font-size: 11px; margin-top: 2px; }
    .report-rating-delta--up { color: ${PALETTE.FAIRWAY}; }
    .report-rating-delta--down { color: ${PALETTE.SAND}; }
    .report-rating-delta--flat { color: ${PALETTE.UI_LIGHT}; }

    .report-pace {
      background: ${PALETTE.UI_DARK};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      margin-bottom: 22px;
      line-height: 1.5;
    }
    .report-pace strong { color: ${PALETTE.WHITE}; }

    .report-complaints {
      margin-bottom: 22px;
    }
    .report-complaint {
      background: ${PALETTE.UI_DARK};
      border-left: 3px solid ${PALETTE.SAND};
      border-radius: 4px;
      padding: 12px 14px;
      margin-bottom: 10px;
      font-size: 14px;
      font-style: italic;
      line-height: 1.5;
      color: ${PALETTE.WHITE};
    }
    .report-complaint::before { content: '\\201C'; color: ${PALETTE.UI_LIGHT}; margin-right: 2px; }
    .report-complaint::after { content: '\\201D'; color: ${PALETTE.UI_LIGHT}; margin-left: 2px; }
    .report-no-complaints {
      color: ${PALETTE.UI_LIGHT};
      font-size: 13px;
      font-style: italic;
    }

    .report-gate {
      background: ${PALETTE.UI_DARK};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 26px;
    }
    .report-gate-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      padding: 5px 0;
    }
    .report-gate-check {
      flex: none;
      width: 16px;
      text-align: center;
      font-weight: bold;
    }
    .report-gate-check--met { color: ${PALETTE.FAIRWAY}; }
    .report-gate-check--unmet { color: ${PALETTE.UI_LIGHT}; }
    .report-gate-item--met { color: ${PALETTE.UI_LIGHT}; text-decoration: line-through; }
    .report-gate-item--unmet { color: ${PALETTE.WHITE}; }

    .report-continue {
      display: block;
      width: 100%;
      min-height: 48px;
      background: ${PALETTE.FAIRWAY};
      color: ${PALETTE.OUTLINE};
      border: none;
      border-radius: 8px;
      font-family: monospace;
      font-weight: bold;
      font-size: 15px;
    }
  `;
  document.head.appendChild(style);
}

function money(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`;
}

function breakdownRow(container, label, value, { total = false } = {}) {
  const row = document.createElement('div');
  row.className = total ? 'report-breakdown-row report-breakdown-total' : 'report-breakdown-row';
  row.textContent = label;
  const val = document.createElement('div');
  val.className = total ? 'report-breakdown-value report-breakdown-total' : 'report-breakdown-value';
  val.textContent = money(value);
  container.append(row, val);
}

function deltaText(delta) {
  if (delta === null) return 'New';
  if (Math.abs(delta) < 0.5) return '– 0';
  const rounded = Math.round(delta);
  return rounded > 0 ? `▲ ${rounded}` : `▼ ${Math.abs(rounded)}`;
}

function deltaClass(delta) {
  if (delta === null || Math.abs(delta) < 0.5) return 'report-rating-delta--flat';
  return delta > 0 ? 'report-rating-delta--up' : 'report-rating-delta--down';
}

/**
 * Mounts (or re-mounts, replacing any previous content) the report screen
 * into `root`. `onContinue`, if given, is wired to the bottom button.
 */
export function mountReport(root, { state, report, onContinue } = {}) {
  injectStyles();
  const data = computeReportData(state, report ?? state.history[state.history.length - 1]);

  root.replaceChildren();
  const screen = document.createElement('div');
  screen.className = 'report-screen';

  // --- Headline: profit ------------------------------------------------
  const dayLabel = document.createElement('p');
  dayLabel.className = 'report-day';
  dayLabel.textContent = `Day ${data.day} Report`;
  const profitLabel = document.createElement('p');
  profitLabel.className = 'report-profit-label';
  profitLabel.textContent = 'Profit';
  const profit = document.createElement('p');
  profit.className = 'report-profit';
  profit.textContent = money(data.profit);
  screen.append(dayLabel, profitLabel, profit);

  // --- Revenue / cost breakdown -----------------------------------------
  const breakdown = document.createElement('div');
  breakdown.className = 'report-breakdown';

  const revHeading = document.createElement('div');
  revHeading.className = 'report-breakdown-heading';
  revHeading.textContent = 'Revenue';
  breakdown.appendChild(revHeading);
  breakdownRow(breakdown, 'Green fees', data.revenue.greenFees);
  breakdownRow(breakdown, 'Merchandise', data.revenue.merchandise);
  breakdownRow(breakdown, 'Food', data.revenue.food);
  breakdownRow(breakdown, 'Total revenue', data.revenue.total, { total: true });

  const costHeading = document.createElement('div');
  costHeading.className = 'report-breakdown-heading';
  costHeading.textContent = 'Costs';
  breakdown.appendChild(costHeading);
  breakdownRow(breakdown, 'Hole upkeep', data.costs.holeUpkeep);
  breakdownRow(breakdown, 'Payroll', data.costs.payroll);
  breakdownRow(breakdown, 'Amenity upkeep', data.costs.amenityUpkeep);
  breakdownRow(breakdown, 'Total costs', data.costs.total, { total: true });

  screen.appendChild(breakdown);

  // --- Ratings, with movement since yesterday ----------------------------
  const ratingsTitle = document.createElement('p');
  ratingsTitle.className = 'report-section-title';
  ratingsTitle.textContent = 'Ratings';
  screen.appendChild(ratingsTitle);

  const ratingsRow = document.createElement('div');
  ratingsRow.className = 'report-ratings';
  for (const rating of data.ratings) {
    const card = document.createElement('div');
    card.className = 'report-rating';
    const label = document.createElement('div');
    label.className = 'report-rating-label';
    label.textContent = rating.label;
    const value = document.createElement('div');
    value.className = 'report-rating-value';
    value.textContent = String(rating.value);
    const delta = document.createElement('div');
    delta.className = `report-rating-delta ${deltaClass(rating.delta)}`;
    delta.textContent = deltaText(rating.delta);
    card.append(label, value, delta);
    ratingsRow.appendChild(card);
  }
  screen.appendChild(ratingsRow);

  // --- Pace of play --------------------------------------------------
  const paceTitle = document.createElement('p');
  paceTitle.className = 'report-section-title';
  paceTitle.textContent = 'Pace of Play';
  screen.appendChild(paceTitle);

  const pace = document.createElement('div');
  pace.className = 'report-pace';
  const roundLine = document.createElement('div');
  const avgMinutes = Math.round(data.averageRoundMinutes);
  const target = Math.round(data.targetRoundMinutes);
  const strongMinutes = document.createElement('strong');
  strongMinutes.textContent = `${avgMinutes} min`;
  const { verdict } = paceVerdict({
    avgMinutes,
    targetMinutes: target,
    hadWaits: Boolean(data.bottleneckHoleName),
  });
  roundLine.append(strongMinutes, ` — target ${target}. ${verdict}`);
  pace.appendChild(roundLine);

  if (data.bottleneckHoleName) {
    const bottleneckLine = document.createElement('div');
    const strongHole = document.createElement('strong');
    strongHole.textContent = `The ${data.bottleneckHoleName}`;
    bottleneckLine.append(strongHole, ' held up the field the most today.');
    pace.appendChild(bottleneckLine);
  } else {
    const noneLine = document.createElement('div');
    noneLine.textContent = 'Nobody waited on anybody today.';
    pace.appendChild(noneLine);
  }
  screen.appendChild(pace);

  // --- Complaints, in the guests' own words -------------------------------
  const complaintsTitle = document.createElement('p');
  complaintsTitle.className = 'report-section-title';
  complaintsTitle.textContent = 'What Guests Said';
  screen.appendChild(complaintsTitle);

  const complaintsWrap = document.createElement('div');
  complaintsWrap.className = 'report-complaints';
  if (data.complaints.length === 0) {
    const none = document.createElement('div');
    none.className = 'report-no-complaints';
    none.textContent = 'Not a single complaint today.';
    complaintsWrap.appendChild(none);
  } else {
    for (const complaint of data.complaints) {
      const bubble = document.createElement('div');
      bubble.className = 'report-complaint';
      bubble.textContent = complaint;
      complaintsWrap.appendChild(bubble);
    }
  }
  screen.appendChild(complaintsWrap);

  // --- Gate progress -----------------------------------------------------
  const gateTitle = document.createElement('p');
  gateTitle.className = 'report-section-title';
  gateTitle.textContent = data.gate.passed ? 'Act I -- Complete' : 'Working Toward Act II';
  screen.appendChild(gateTitle);

  const gate = document.createElement('div');
  gate.className = 'report-gate';
  for (const item of data.gate.items) {
    const row = document.createElement('div');
    row.className = `report-gate-item ${item.met ? 'report-gate-item--met' : 'report-gate-item--unmet'}`;
    const check = document.createElement('span');
    check.className = `report-gate-check ${item.met ? 'report-gate-check--met' : 'report-gate-check--unmet'}`;
    check.textContent = item.met ? '✓' : '○';
    const label = document.createElement('span');
    label.textContent = item.label;
    row.append(check, label);
    gate.appendChild(row);
  }
  screen.appendChild(gate);

  // --- Continue ------------------------------------------------------
  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'report-continue';
  continueBtn.textContent = 'Continue';
  continueBtn.addEventListener('click', () => onContinue?.());
  screen.appendChild(continueBtn);

  root.appendChild(screen);
  return { element: screen, data };
}
