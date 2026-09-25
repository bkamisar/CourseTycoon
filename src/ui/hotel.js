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
  roomLimit,
} from '../sim/rooms.js';
import { SEGMENTS, SEGMENT_KEYS } from '../sim/segments.js';
import {
  HOTEL_AMENITIES, HOTEL_AMENITY_IDS, hotelUpkeep,
} from '../sim/hotelAmenities.js';
import { amenity } from '../sim/state.js';
import { payBuyout } from '../sim/investors.js';
import { MENU_SLOTS } from '../sim/menu.js';
import { openMenuBoard } from './menuBoard.js';

/** What demolishing anything returns, matching the Act I amenity panel
 * and the room steppers below: a mistake should cost something without
 * being ruinous. */
const DEMOLITION_REFUND = 0.65;

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

    .hotel-settle {
      border: 1px solid ${PALETTE.SAND};
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      font-family: monospace;
      background: ${PALETTE.UI_DARK};
    }
    .hotel-settle-kicker {
      color: ${PALETTE.SAND}; font-size: 10px; letter-spacing: 1px;
    }
    .hotel-settle-title { color: ${PALETTE.WHITE}; font-size: 15px; margin-top: 4px; }
    .hotel-settle-body {
      color: ${PALETTE.UI_LIGHT}; font-size: 12px; line-height: 1.6; margin-top: 6px;
    }
    .hotel-settle-clock { color: ${PALETTE.SAND}; font-size: 12px; margin-top: 6px; }
    .hotel-settle-btn {
      margin-top: 10px; width: 100%; min-height: 44px;
      background: ${PALETTE.ACCENT}; color: ${PALETTE.OUTLINE};
      border: none; border-radius: 8px;
      font-family: monospace; font-size: 14px; cursor: pointer;
    }
    .hotel-settle-btn:disabled {
      background: none; color: ${PALETTE.UI_LIGHT};
      border: 1px solid ${PALETTE.UI_LIGHT}; cursor: default;
    }
    .hotel-heading {
      color: ${PALETTE.WHITE}; font-family: monospace; font-size: 14px;
      margin: 18px 0 2px;
    }
    .hotel-heading-note {
      color: ${PALETTE.UI_LIGHT}; font-family: monospace; font-size: 11px;
      line-height: 1.5; margin-bottom: 8px;
    }
    .hotel-am-head {
      display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
    }
    .hotel-serves {
      color: ${PALETTE.UI_LIGHT}; font-size: 10px; white-space: nowrap;
      border: 1px solid ${PALETTE.UI_LIGHT}; border-radius: 4px; padding: 1px 4px;
    }
    .hotel-appeal { margin-top: 6px; }
    .hotel-appeal-row {
      display: flex; align-items: center; gap: 6px; margin-top: 3px;
      font-size: 10px; color: ${PALETTE.UI_LIGHT};
    }
    .hotel-appeal-name { width: 52px; }
    .hotel-appeal-track {
      flex: 1; height: 7px; background: ${PALETTE.UI_DARK};
      border-radius: 3px; overflow: hidden;
    }
    /* Both of these are spans, so both need blockifying: an inline
     * element ignores width and height, which left every appeal bar
     * rendering as an empty track. */
    .hotel-appeal-fill { display: block; height: 100%; background: ${PALETTE.ACCENT}; }
    .hotel-effect {
      color: ${PALETTE.SAND}; font-size: 11px; line-height: 1.5; margin-top: 6px;
    }
    .hotel-build {
      margin-top: 8px; width: 100%; min-height: 44px;
      background: ${PALETTE.UI_DARK}; color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.UI_LIGHT}; border-radius: 8px;
      font-family: monospace; font-size: 13px; cursor: pointer;
    }
    .hotel-build:disabled { opacity: 0.35; cursor: default; }
    .hotel-built {
      margin-top: 8px; display: flex; align-items: center;
      justify-content: space-between; gap: 8px;
    }
    .hotel-built-tag { color: ${PALETTE.ACCENT}; font-size: 12px; }
    .hotel-menu-btn {
      min-height: 44px; padding: 0 12px;
      background: ${PALETTE.UI_DARK}; color: ${PALETTE.ACCENT};
      border: 1px solid ${PALETTE.ACCENT}; border-radius: 8px;
      font-family: monospace; font-size: 12px; cursor: pointer;
    }
    .hotel-sell {
      min-height: 44px; padding: 0 12px;
      background: none; color: ${PALETTE.UI_LIGHT};
      border: 1px solid ${PALETTE.UI_LIGHT}; border-radius: 8px;
      font-family: monospace; font-size: 12px; cursor: pointer;
    }
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
 * The investors' standing demand, and the button that settles it.
 *
 * Both endings of Act II ran through `payBuyout` and `forceLiquidation`,
 * and neither was called from anywhere. The demand was announced on the
 * day recap and then stood forever with nothing the player could do about
 * it. This is the missing half: the report says it has happened, and this
 * is where it is acted on, reachable on any day rather than only on the
 * morning it was raised.
 *
 * The two kinds read completely differently on purpose. One is a debt
 * being called in; the other is the resort earning the right to own
 * itself.
 */
function settlementCard(state, commit) {
  const demand = state.investors?.buyoutDemand;
  if (!demand) return null;

  const offer = demand.kind === 'offer';
  const card = document.createElement('div');
  card.className = 'hotel-settle';

  const kicker = document.createElement('div');
  kicker.className = 'hotel-settle-kicker';
  kicker.textContent = offer ? 'AN OFFER' : 'THEY WANT OUT';

  const title = document.createElement('div');
  title.className = 'hotel-settle-title';
  title.textContent = offer
    ? `Buy them out for $${demand.amount.toLocaleString()}`
    : `They want $${demand.amount.toLocaleString()} back`;

  const body = document.createElement('div');
  body.className = 'hotel-settle-body';
  body.textContent = offer
    ? 'The hotel has done well enough for long enough that they will sell you their stake. Pay it and the place is yours: no more reviews, no more targets, no more confidence to keep up.'
    : 'Confidence ran out. Pay them off and the hotel is yours anyway. Let the deadline pass and they will sell rooms out from under you to get their money back.';

  const left = demand.dueDay - (state.day ?? 0);
  const clock = document.createElement('div');
  clock.className = 'hotel-settle-clock';
  clock.textContent = left <= 0
    ? 'Due today.'
    : `${left} ${left === 1 ? 'day' : 'days'} left — due on day ${demand.dueDay}.`;

  card.append(kicker, title, body, clock);

  const pay = document.createElement('button');
  pay.type = 'button';
  pay.className = 'hotel-settle-btn';
  const affordable = (state.money ?? 0) >= demand.amount;
  pay.disabled = !affordable;
  pay.textContent = affordable
    ? `Pay $${demand.amount.toLocaleString()}`
    : `$${(demand.amount - (state.money ?? 0)).toLocaleString()} short`;
  pay.addEventListener('click', () => {
    // payBuyout refuses rather than overdrawing, so a state that comes
    // back unchanged means it was not affordable after all. Committing it
    // anyway would leave the screen claiming a sale that did not happen.
    const next = payBuyout(state);
    if (next.investors?.bought) commit(next);
  });
  card.appendChild(pay);
  return card;
}

/** Who an amenity is for, in the fewest words that fit on a badge. */
const SERVES_LABEL = {
  overnight: 'Guests only',
  day: 'Drive-in only',
  both: 'Everyone',
};

/**
 * The mechanical effects, spelled out.
 *
 * Three of the fourteen do real work rather than adding appeal, and those
 * three are the reason the list is worth reading. Every string here is
 * built from the amenity's own numbers, so a change in
 * `hotelAmenities.js` moves this text with it — the sheet cannot end up
 * describing a version of the building that no longer exists.
 */
function effectNotes(spec) {
  const notes = [];
  if (spec.weatherProof) {
    notes.push('Earns on a day the course is shut — the one building a storm cannot close.');
  }
  if (spec.divertsGroups > 0) {
    notes.push(
      `Takes ${Math.round(spec.divertsGroups * 100)}% of groups off the main course, `
      + 'which helps the pace of everyone still on it.',
    );
  }
  if (spec.extraNights > 0) {
    notes.push(`Stays run about ${spec.extraNights} nights longer.`);
  }
  return notes;
}

/** One building: what it costs, who wants it, and what it does. */
function amenityRow(spec, state, commit, sheetHost) {
  const row = document.createElement('div');
  row.className = 'hotel-row';

  const head = document.createElement('div');
  head.className = 'hotel-am-head';
  const title = document.createElement('div');
  title.className = 'hotel-title';
  title.textContent = spec.label;
  const serves = document.createElement('span');
  serves.className = 'hotel-serves';
  serves.textContent = SERVES_LABEL[spec.serves] ?? spec.serves;
  head.append(title, serves);

  const detail = document.createElement('div');
  detail.className = 'hotel-detail';
  detail.textContent = `$${spec.build.toLocaleString()} to build · $${spec.upkeep}/night to run`;

  const blurb = document.createElement('div');
  blurb.className = 'hotel-blurb';
  blurb.textContent = spec.blurb;

  row.append(head, detail, blurb);

  // Who wants it, as bars, the same way the menu board shows a dish.
  const appeal = document.createElement('div');
  appeal.className = 'hotel-appeal';
  for (const key of SEGMENT_KEYS) {
    const bar = document.createElement('div');
    bar.className = 'hotel-appeal-row';
    const name = document.createElement('span');
    name.className = 'hotel-appeal-name';
    name.textContent = SEGMENTS[key].shortLabel;
    const track = document.createElement('span');
    track.className = 'hotel-appeal-track';
    const fill = document.createElement('span');
    fill.className = 'hotel-appeal-fill';
    fill.style.width = `${Math.round((spec.appeal[key] ?? 0) * 100)}%`;
    track.appendChild(fill);
    bar.append(name, track);
    appeal.appendChild(bar);
  }
  row.appendChild(appeal);

  for (const text of effectNotes(spec)) {
    const note = document.createElement('div');
    note.className = 'hotel-effect';
    note.textContent = text;
    row.appendChild(note);
  }

  // Hotel amenities live in the same `resort.amenities` array as Act I's,
  // keyed by the same `type` field. `hotelAmenities.js` resolves the ids
  // it knows and ignores the rest, and the Act I panel does the reverse,
  // so one array serves both without either screen inventing a building.
  const owned = state.resort.amenities.some((a) => a.type === spec.id);

  if (owned) {
    const built = document.createElement('div');
    built.className = 'hotel-built';
    const tag = document.createElement('span');
    tag.className = 'hotel-built-tag';
    tag.textContent = 'Built';

    // A venue that sells food and drink needs its board reachable, or it
    // opens with whatever the defaults chose and stays that way forever.
    // Addressed by the amenity's own id, the way the menu board has
    // always worked, so a second dining room would get its own board.
    let menuButton = null;
    if (MENU_SLOTS[spec.id]) {
      const owned = state.resort.amenities.find((a) => a.type === spec.id);
      const menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'hotel-menu-btn';
      menu.textContent = 'Menu';
      menu.addEventListener('click', () => {
        openMenuBoard(sheetHost, {
          state,
          amenityId: owned?.id,
          onChange: commit,
        });
      });
      menuButton = menu;
    }
    const sell = document.createElement('button');
    sell.type = 'button';
    sell.className = 'hotel-sell';
    const refund = Math.round(spec.build * DEMOLITION_REFUND);
    sell.textContent = `Demolish · +$${refund.toLocaleString()}`;
    // Confirmation kept in a closure rather than on the element, so the
    // button carries no state a re-render could silently reset.
    let confirming = false;
    sell.addEventListener('click', () => {
      if (!confirming) {
        confirming = true;
        sell.textContent = 'Tap again to demolish';
        return;
      }
      const next = structuredClone(state);
      next.resort.amenities = next.resort.amenities.filter((a) => a.type !== spec.id);
      next.money += refund;
      commit(next);
    });
    // Built | Menu | Demolish, so the name of the thing comes first.
    built.append(tag, ...(menuButton ? [menuButton] : []), sell);
    row.appendChild(built);
  } else {
    const build = document.createElement('button');
    build.type = 'button';
    build.className = 'hotel-build';
    const affordable = state.money >= spec.build;
    build.disabled = !affordable;
    build.textContent = affordable
      ? `Build · $${spec.build.toLocaleString()}`
      : `$${(spec.build - state.money).toLocaleString()} short`;
    build.addEventListener('click', () => {
      if (state.money < spec.build) return;
      const next = structuredClone(state);
      next.money -= spec.build;
      next.resort.amenities.push(amenity(spec.id));
      commit(next);
    });
    row.appendChild(build);
  }

  return row;
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

        // First, because a fortnight's deadline outranks a room count.
        const settle = settlementCard(current, (next) => {
          current = next;
          onChange(current);
          rerender();
        });
        if (settle) body.appendChild(settle);

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
            next.money += Math.round(spec.build * DEMOLITION_REFUND);
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
          const limit = roomLimit(current.prestige ?? 0);
          const atLimit = totalRooms(current.resort.rooms) >= limit;
          const affordable = current.money >= spec.build;
          more.disabled = !affordable || atLimit;
          more.addEventListener('click', () => {
            if (current.money < spec.build) return;
            if (totalRooms(current.resort.rooms) >= roomLimit(current.prestige ?? 0)) return;
            const next = structuredClone(current);
            next.money -= spec.build;
            next.resort.rooms[kind] += 1;
            current = next;
            onChange(current);
            rerender();
          });

          controls.append(less, count, more);
          row.appendChild(controls);

          if (atLimit) {
            // Said once per row rather than as a silent dead button. A
            // control that does nothing and does not say why is the same
            // bug as a cost line that lies.
            const capped = document.createElement('div');
            capped.className = 'hotel-shortfall';
            capped.textContent =
              `Planning permission covers ${limit} rooms. Raise the resort's `
              + 'prestige and the council will allow more.';
            row.appendChild(capped);
          } else if (!affordable) {
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
        // Rooms AND buildings, because `day.js` charges the sum of the two.
        // Showing only the rooms here would be this project's favourite
        // bug again: a screen quoting a bill the simulation disagrees
        // with, and the disagreement growing with every amenity built.
        const rooms = nightlyUpkeep(current.resort.rooms);
        const buildings = hotelUpkeep(current.resort.amenities);
        figure.textContent = `$${(rooms + buildings).toLocaleString()} a night`;
        const note = document.createElement('div');
        note.className = 'hotel-bill-note';
        note.textContent = rooms + buildings === 0
          ? 'Nothing built yet, so nothing to pay.'
          : buildings === 0
            ? 'Charged on every room you have built, filled or empty. This is the whole argument against building more than you can fill.'
            : `$${rooms.toLocaleString()} of rooms and $${buildings.toLocaleString()} of buildings, `
              + 'charged whether anybody uses them or not. This is the whole argument against building more than you can fill.';
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

        // --- The buildings -------------------------------------------
        const heading = document.createElement('div');
        heading.className = 'hotel-heading';
        heading.textContent = 'What else is on the property';
        const headingNote = document.createElement('div');
        headingNote.className = 'hotel-heading-note';
        headingNote.textContent =
          'Nothing here pleases everybody, and the bars say who each one is for. '
          + `${SEGMENTS.locals.shortLabel} never book a room, so the buildings they drive out for `
          + 'are the only way the hotel earns from the crowd Act I was spent building.';
        body.append(heading, headingNote);

        for (const id of HOTEL_AMENITY_IDS) {
          body.appendChild(amenityRow(HOTEL_AMENITIES[id], current, (next) => {
            current = next;
            onChange(current);
            rerender();
          }, sheetHost));
        }
      }
      rerender();
    },
  });
}
