/**
 * The rooms screen: what you have built, what it costs you every night,
 * and what you charge for it.
 *
 * The nightly upkeep is the most important number here and is deliberately
 * the loudest. A room bills whether anybody sleeps in it or not — that is
 * the rule Act II rests on, and it is the only thing that makes "build
 * more rooms" a decision rather than a ratchet. Measured: sixty rooms run
 * full and net $2,940 a night; two hundred and forty run at 31% and lose
 * $3,038. Nothing on this screen matters as much as the player watching
 * that bill grow as they tap.
 *
 * Every figure is read live from `src/sim/rooms.js`. The suite rate is
 * **shown and not set** — it is a multiple of the same slider, because one
 * price decision is a decision and two is a chore.
 */
import { PALETTE } from '../render/palette.js';
import {
  ROOM_TYPES, ROOM_KINDS, roomCounts, totalRooms, nightlyUpkeep, nightlyRate,
} from '../sim/rooms.js';
import { SEGMENTS } from '../sim/segments.js';

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .hotel-row {
      background: ${PALETTE.OUTLINE};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 8px;
      font-family: monospace;
    }
    .hotel-title { color: ${PALETTE.WHITE}; font-size: 14px; }
    .hotel-detail { color: ${PALETTE.ACCENT}; font-size: 12px; margin-top: 2px; }
    .hotel-blurb {
      color: ${PALETTE.UI_LIGHT}; font-size: 11px; line-height: 1.5; margin-top: 4px;
    }
    .hotel-controls {
      display: flex; align-items: center; gap: 10px; margin-top: 8px;
    }
    .hotel-step {
      width: 44px; height: 44px; min-width: 44px;
      background: ${PALETTE.UI_DARK}; color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.UI_LIGHT}; border-radius: 8px;
      font-family: monospace; font-size: 18px; cursor: pointer;
    }
    .hotel-step:disabled { opacity: 0.35; cursor: default; }
    .hotel-count { color: ${PALETTE.WHITE}; font-size: 16px; min-width: 44px; text-align: center; }
    .hotel-shortfall { color: ${PALETTE.SAND}; font-size: 11px; margin-top: 4px; }
    .hotel-bill {
      margin-top: 12px; padding: 10px;
      background: ${PALETTE.UI_DARK};
      border-left: 3px solid ${PALETTE.SAND};
      border-radius: 0 6px 6px 0;
      font-family: monospace;
    }
    .hotel-bill-figure { color: ${PALETTE.SAND}; font-size: 17px; }
    .hotel-bill-note { color: ${PALETTE.UI_LIGHT}; font-size: 11px; line-height: 1.5; margin-top: 3px; }
    .hotel-occ { color: ${PALETTE.UI_LIGHT}; font-size: 12px; margin-top: 8px; line-height: 1.6; }
    .hotel-occ strong { color: ${PALETTE.WHITE}; font-weight: normal; }
    .hotel-rate-row { margin-top: 14px; font-family: monospace; }
    .hotel-rate-label {
      display: flex; justify-content: space-between; align-items: baseline;
      color: ${PALETTE.UI_LIGHT}; font-size: 12px;
    }
    .hotel-rate-value { color: ${PALETTE.ACCENT}; font-size: 15px; }
    .hotel-slider { width: 100%; height: 44px; }
    .hotel-suite-rate { color: ${PALETTE.UI_LIGHT}; font-size: 11px; margin-top: 2px; }
  `;
  document.head.appendChild(style);
}

/** Who filled the rooms last night, in words rather than a table. */
function occupancyLine(report) {
  if (!report?.hotel || report.hotel.capacity === 0) {
    return 'No rooms yet. Golfers go home at six.';
  }
  const { sold, capacity, turnedAway } = report.hotel;
  const pct = Math.round((sold / capacity) * 100);
  const turned = turnedAway > 0
    ? ` ${turnedAway} more wanted a bed and could not get one.`
    : '';
  return `Last night: ${sold} of ${capacity} rooms filled (${pct}%).${turned}`;
}

/**
 * Opens the rooms sheet. `onChange(nextState)` fires on every build and
 * every change of rate, the same contract the other sheets use.
 */
export function openHotelSheet(sheetHost, { state, onChange }) {
  injectStyles();
  let current = state;

  sheetHost.open({
    id: 'hotel',
    title: 'The hotel',
    render(body) {
      function rerender() {
        body.replaceChildren();
        const counts = roomCounts(current.resort.rooms);
        const rate = current.resort.pricing.roomRate ?? 0;

        for (const kind of ROOM_KINDS) {
          const spec = ROOM_TYPES[kind];
          const row = document.createElement('div');
          row.className = 'hotel-row';

          const title = document.createElement('div');
          title.className = 'hotel-title';
          title.textContent = spec.label;
          const detail = document.createElement('div');
          detail.className = 'hotel-detail';
          detail.textContent =
            `$${spec.build.toLocaleString()} to build · $${spec.upkeep}/night each · `
            + `charges $${nightlyRate(kind, rate)}`;
          const blurb = document.createElement('div');
          blurb.className = 'hotel-blurb';
          blurb.textContent = spec.blurb;
          row.append(title, detail, blurb);

          const controls = document.createElement('div');
          controls.className = 'hotel-controls';

          const less = document.createElement('button');
          less.type = 'button';
          less.className = 'hotel-step';
          less.textContent = '−';
          less.disabled = counts[kind] === 0;
          less.addEventListener('click', () => {
            const next = structuredClone(current);
            next.resort.rooms[kind] -= 1;
            // Selling a room back returns what demolishing anything else
            // returns, for the same reason: a mistake should cost
            // something without being ruinous.
            next.money += Math.round(spec.build * 0.65);
            current = next;
            onChange(current);
            rerender();
          });

          const count = document.createElement('span');
          count.className = 'hotel-count';
          count.textContent = String(counts[kind]);

          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'hotel-step';
          more.textContent = '+';
          const affordable = current.money >= spec.build;
          more.disabled = !affordable;
          more.addEventListener('click', () => {
            if (current.money < spec.build) return;
            const next = structuredClone(current);
            next.money -= spec.build;
            next.resort.rooms[kind] += 1;
            current = next;
            onChange(current);
            rerender();
          });

          controls.append(less, count, more);
          row.appendChild(controls);

          if (!affordable) {
            const short = document.createElement('div');
            short.className = 'hotel-shortfall';
            short.textContent = `$${(spec.build - current.money).toLocaleString()} short`;
            row.appendChild(short);
          }
          body.appendChild(row);
        }

        // --- The nightly rate ------------------------------------------
        const rateRow = document.createElement('div');
        rateRow.className = 'hotel-rate-row';
        const rateLabel = document.createElement('div');
        rateLabel.className = 'hotel-rate-label';
        const rateText = document.createElement('span');
        rateText.textContent = 'Nightly rate';
        const rateValue = document.createElement('span');
        rateValue.className = 'hotel-rate-value';
        rateValue.textContent = `$${rate}`;
        rateLabel.append(rateText, rateValue);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'hotel-slider';
        slider.min = '0';
        slider.max = '400';
        slider.step = '5';
        slider.value = String(rate);

        const suiteNote = document.createElement('div');
        suiteNote.className = 'hotel-suite-rate';
        const showSuite = () => {
          suiteNote.textContent =
            `A suite charges $${nightlyRate('suite', Number(slider.value))} — `
            + `${ROOM_TYPES.suite.rateMultiple}x the same rate.`;
        };
        showSuite();

        slider.addEventListener('input', () => {
          rateValue.textContent = `$${slider.value}`;
          showSuite();
        });
        slider.addEventListener('change', () => {
          const next = structuredClone(current);
          next.resort.pricing.roomRate = Number(slider.value);
          current = next;
          onChange(current);
          // Re-render, because each room's row quotes what it charges and
          // those lines go stale the moment the rate moves. Without this
          // the sheet showed "charges $0" above a note reading "a suite
          // charges $312" — the screen disagreeing with itself, which is
          // the bug this project produces more than any other.
          rerender();
        });
        rateRow.append(rateLabel, slider, suiteNote);
        body.appendChild(rateRow);

        // --- The bill, which is the point of the screen ----------------
        const bill = document.createElement('div');
        bill.className = 'hotel-bill';
        const figure = document.createElement('div');
        figure.className = 'hotel-bill-figure';
        figure.textContent = `$${nightlyUpkeep(current.resort.rooms).toLocaleString()} a night`;
        const note = document.createElement('div');
        note.className = 'hotel-bill-note';
        note.textContent = totalRooms(current.resort.rooms) === 0
          ? 'Nothing built yet, so nothing to pay.'
          : 'Charged on every room you have built, filled or empty. This is the whole argument against building more than you can fill.';
        bill.append(figure, note);

        const occ = document.createElement('div');
        occ.className = 'hotel-occ';
        occ.textContent = occupancyLine(current.history?.at(-1));
        bill.appendChild(occ);

        const who = document.createElement('div');
        who.className = 'hotel-occ';
        who.textContent =
          `${SEGMENTS.locals.shortLabel} never book a room — they live here. `
          + 'Rooms fill with destination guests, and with serious golfers who want the first tee time.';
        bill.appendChild(who);

        body.appendChild(bill);
      }
      rerender();
    },
  });
}
