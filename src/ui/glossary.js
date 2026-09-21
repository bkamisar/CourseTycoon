/**
 * The glossary: a sheet explaining every stat the HUD and the reports
 * throw around, in plain words, for a player who has no idea what "CR"
 * means or what scale any of these numbers are even on.
 *
 * Static content, but numbers that already have a home in the simulation
 * are quoted from there rather than retyped — the same anti-drift rule
 * `src/ui/panels.js` already follows for prices and wages.
 */
import { PALETTE } from '../render/palette.js';
import { TARGET_MINUTES_PER_HOLE } from '../sim/schedule.js';
import { UPKEEP_BASE, UPKEEP_PER_BUNKER, UPKEEP_PER_POND } from '../sim/hole.js';

/** One entry per stat: what it's called, what scale it's on, what moves it. */
function entries() {
  return [
    {
      term: 'Course Rating (CR)',
      range: '0–100',
      body:
        'How good the course is: variety across your holes, scenery, how well ' +
        'it suits the crowd actually playing it, and turf condition. Not the ' +
        'same as Happy - Course Rating judges the architecture, Happy judges ' +
        'the day they had on it. A fine course that is backed up rates well ' +
        'and makes nobody happy.',
    },
    {
      term: 'Prestige',
      range: '0–100',
      body:
        'Your resort’s reputation. It decides what you can charge and who ' +
        'shows up to play. It moves slowly on purpose, rising from a good ' +
        'course and happy guests and falling just as gradually — one great ' +
        'day will not rescue a bad course, and one bad day will not sink a good one.',
    },
    {
      term: 'Pace',
      range: 'minutes per round — lower is better',
      body:
        `How long a round actually takes, on average. About ${TARGET_MINUTES_PER_HOLE} ` +
        'minutes a hole is a clean pace; drop the tee interval below what your ' +
        'slowest hole actually plays and groups start backing up behind each other.',
    },
    {
      term: 'Happy (satisfaction)',
      range: '0–100',
      body:
        'How guests felt about their round. Waiting hurts it most, then how ' +
        'they scored against their own handicap, whether the price matched ' +
        'the value, the scenery, and the turf.',
    },
    {
      term: 'Turf',
      range: '0–100',
      body:
        'The condition of the course. Every round played wears it down a ' +
        'little; groundskeepers bring it back. One groundskeeper keeps ' +
        'about three holes in shape.',
    },
    {
      term: 'Upkeep',
      range: '$ per day',
      body:
        `What it costs to keep the course open: $${UPKEEP_BASE} a day per hole, ` +
        `plus $${UPKEEP_PER_BUNKER} for every bunker and $${UPKEEP_PER_POND} for ` +
        'every pond you’ve dug.',
    },
  ];
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .glossary-entry {
      padding: 12px;
      margin-bottom: 10px;
      background: ${PALETTE.OUTLINE};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
    }
    .glossary-term-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 4px;
    }
    .glossary-term {
      color: ${PALETTE.WHITE};
      font-weight: bold;
      font-size: 14px;
    }
    .glossary-range {
      color: ${PALETTE.ACCENT};
      font-size: 11px;
      white-space: nowrap;
    }
    .glossary-body {
      color: ${PALETTE.UI_LIGHT};
      font-size: 12px;
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
}

/** Opens the glossary sheet. Read-only — there is nothing here to change. */
export function openGlossarySheet(sheetHost) {
  injectStyles();
  sheetHost.open({
    id: 'glossary',
    title: 'Glossary',
    render(body) {
      for (const { term, range, body: text } of entries()) {
        const entry = document.createElement('div');
        entry.className = 'glossary-entry';

        const row = document.createElement('div');
        row.className = 'glossary-term-row';
        const termEl = document.createElement('div');
        termEl.className = 'glossary-term';
        termEl.textContent = term;
        const rangeEl = document.createElement('div');
        rangeEl.className = 'glossary-range';
        rangeEl.textContent = range;
        row.append(termEl, rangeEl);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'glossary-body';
        bodyEl.textContent = text;

        entry.append(row, bodyEl);
        body.appendChild(entry);
      }
    },
  });
}
