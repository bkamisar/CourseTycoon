/**
 * Amenities, staff and pricing sheets. Every price, wage and capacity number in
 * these three sheets is read from `src/sim/economy.js` or `src/sim/
 * schedule.js` at render time — nothing here is a second copy of a number
 * that also lives in the simulation. Re-listing a price is how it silently
 * drifts the first time balance.js retunes it; reading it live is how it
 * can't.
 *
 * The one thing each sheet does compute is a plain transaction on numbers
 * it already read from the sim (money minus a build cost, a staff count
 * plus or minus one) — not a game outcome like demand or a rating, just
 * bookkeeping on figures the sim already produced.
 */
import { PALETTE } from '../render/palette.js';
import { AMENITIES, WAGES, perceivedValue } from '../sim/economy.js';
import { maxGroupsForDay } from '../sim/schedule.js';
import { marshalPaceFactor } from '../sim/day.js';
import { openHoles } from '../sim/state.js';
import { courseRating } from '../sim/ratings.js';
import { expectedMinutes } from '../sim/round.js';
import { ordinal } from '../sim/satisfaction.js';

/** Plain-words blurb per amenity. Flavour text only — never a number. */
const AMENITY_BLURB = {
  clubhouse: 'The resort’s front desk and hub. Always open.',
  proShop: 'Sells merchandise to guests after their round.',
  snackShack: 'Quick food and drinks out on the course.',
  halfwayHouse: 'A stop partway round for food and a breather.',
  restaurant: 'Sit-down dining after the round.',
  restrooms: 'Guests notice sharply when there aren’t enough.',
  drivingRange: 'Lets guests warm up before teeing off.',
  practiceGreen: 'Practice putting before the round starts.',
  cartBarn: 'Stores carts and offers them to guests.',
};

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .panel-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px;
      margin-bottom: 10px;
      background: ${PALETTE.OUTLINE};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
    }
    .panel-row-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .panel-row-title {
      color: ${PALETTE.WHITE};
      font-weight: bold;
    }
    .panel-row-detail {
      color: ${PALETTE.UI_LIGHT};
      font-size: 12px;
    }
    .panel-row-blurb {
      color: ${PALETTE.UI_LIGHT};
      font-size: 11px;
      font-style: italic;
    }
    .panel-shortfall {
      color: ${PALETTE.ACCENT};
      font-size: 11px;
    }
    .panel-btn {
      min-width: 44px;
      min-height: 44px;
      background: ${PALETTE.FAIRWAY};
      color: ${PALETTE.OUTLINE};
      border: none;
      border-radius: 6px;
      font-family: monospace;
      font-weight: bold;
      font-size: 13px;
      flex: none;
    }
    .panel-btn:disabled {
      background: ${PALETTE.UI_LIGHT};
      opacity: 0.6;
    }
    .panel-btn--danger {
      background: ${PALETTE.SAND};
    }
    .panel-stepper {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: none;
    }
    .panel-stepper-count {
      min-width: 22px;
      text-align: center;
      color: ${PALETTE.WHITE};
      font-weight: bold;
      font-size: 15px;
    }
    .panel-note {
      color: ${PALETTE.UI_LIGHT};
      font-size: 12px;
      margin: 4px 0 14px;
      line-height: 1.4;
    }
    .panel-total {
      color: ${PALETTE.ACCENT};
      font-weight: bold;
      margin: 10px 0 4px;
    }
    .panel-slider-block {
      margin-bottom: 20px;
    }
    .panel-slider-label {
      display: flex;
      justify-content: space-between;
      color: ${PALETTE.WHITE};
      font-size: 13px;
      margin-bottom: 4px;
    }
    .panel-slider-label strong {
      color: ${PALETTE.ACCENT};
    }
    .panel-slider {
      width: 100%;
      height: 32px;
    }
    .panel-consequence {
      color: ${PALETTE.UI_LIGHT};
      font-size: 12px;
      margin-top: 4px;
      line-height: 1.4;
    }
    .panel-consequence strong {
      color: ${PALETTE.WHITE};
    }
  `;
  document.head.appendChild(style);
}

/** "proShop" -> "Pro Shop". Exported so anywhere else that names an
 * amenity type to the player (the overview's amenity strip, in
 * particular) uses the exact same label this sheet does. */
export function titleCase(type) {
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------
// Build sheet
// ---------------------------------------------------------------------

/**
 * Opens the build sheet. `onChange(nextState)` fires every time an amenity
 * is bought, with a new state object (the one passed in is never mutated).
 */
export function openBuildSheet(sheetHost, { state, onChange }) {
  injectStyles();
  let current = state;

  sheetHost.open({
    id: 'build',
    title: 'Amenities',
    render(body) {
      function rerender() {
        body.replaceChildren();
        for (const type of Object.keys(AMENITIES)) {
          const spec = AMENITIES[type];
          const owned = current.resort.amenities.some((a) => a.type === type);

          const row = document.createElement('div');
          row.className = 'panel-row';

          const info = document.createElement('div');
          info.className = 'panel-row-info';
          const title = document.createElement('div');
          title.className = 'panel-row-title';
          title.textContent = titleCase(type);
          const detail = document.createElement('div');
          detail.className = 'panel-row-detail';
          detail.textContent = `$${spec.build.toLocaleString()} to build · $${spec.upkeep}/day upkeep`;
          const blurb = document.createElement('div');
          blurb.className = 'panel-row-blurb';
          blurb.textContent = AMENITY_BLURB[type] ?? '';
          info.append(title, detail, blurb);

          const action = document.createElement('button');
          action.type = 'button';
          action.className = 'panel-btn';

          if (owned) {
            action.textContent = 'Built';
            action.disabled = true;
          } else {
            action.textContent = 'Build';
            const affordable = current.money >= spec.build;
            if (!affordable) {
              action.disabled = true;
              const shortfall = document.createElement('div');
              shortfall.className = 'panel-shortfall';
              shortfall.textContent = `$${(spec.build - current.money).toLocaleString()} short`;
              info.appendChild(shortfall);
            }
            action.addEventListener('click', () => {
              const next = structuredClone(current);
              next.money -= spec.build;
              next.resort.amenities.push({ type });
              current = next;
              onChange(current);
              rerender();
            });
          }

          row.append(info, action);
          body.appendChild(row);
        }
      }

      rerender();
    },
  });
}

// ---------------------------------------------------------------------
// Staff sheet
// ---------------------------------------------------------------------

const STAFF_ROLES = ['groundskeeper', 'marshal'];
const ROLE_LABEL = { groundskeeper: 'Groundskeeper', marshal: 'Marshal' };

/** Opens the staff sheet. `onChange(nextState)` fires on every hire/fire. */
export function openStaffSheet(sheetHost, { state, onChange }) {
  injectStyles();
  let current = state;

  sheetHost.open({
    id: 'staff',
    title: 'Staff',
    render(body) {
      const note = document.createElement('p');
      note.className = 'panel-note';
      note.textContent =
        'One groundskeeper holds roughly three holes steady; a nine needs ' +
        'two to three to keep up with the turf. Marshals pace the field ' +
        'and shave time off a slow round.';
      body.appendChild(note);

      const rowsEl = document.createElement('div');
      const totalEl = document.createElement('div');
      totalEl.className = 'panel-total';
      body.append(rowsEl, totalEl);

      function countOf(role) {
        return current.resort.staff.filter((m) => m.role === role).length;
      }

      function rerender() {
        rowsEl.replaceChildren();
        for (const role of STAFF_ROLES) {
          const row = document.createElement('div');
          row.className = 'panel-row';

          const info = document.createElement('div');
          info.className = 'panel-row-info';
          const title = document.createElement('div');
          title.className = 'panel-row-title';
          title.textContent = ROLE_LABEL[role];
          const detail = document.createElement('div');
          detail.className = 'panel-row-detail';
          detail.textContent = `$${WAGES[role]}/day each`;
          info.append(title, detail);

          const stepper = document.createElement('div');
          stepper.className = 'panel-stepper';
          const fireBtn = document.createElement('button');
          fireBtn.type = 'button';
          fireBtn.className = 'panel-btn panel-btn--danger';
          fireBtn.textContent = '−';
          const count = countOf(role);
          fireBtn.disabled = count === 0;
          fireBtn.addEventListener('click', () => {
            const next = structuredClone(current);
            const idx = next.resort.staff.findIndex((m) => m.role === role);
            if (idx !== -1) next.resort.staff.splice(idx, 1);
            current = next;
            onChange(current);
            rerender();
          });

          const countEl = document.createElement('span');
          countEl.className = 'panel-stepper-count';
          countEl.textContent = String(count);

          const hireBtn = document.createElement('button');
          hireBtn.type = 'button';
          hireBtn.className = 'panel-btn';
          hireBtn.textContent = '+';
          hireBtn.addEventListener('click', () => {
            const next = structuredClone(current);
            next.resort.staff.push({ role });
            current = next;
            onChange(current);
            rerender();
          });

          stepper.append(fireBtn, countEl, hireBtn);
          row.append(info, stepper);
          rowsEl.appendChild(row);
        }

        const payroll = current.resort.staff.reduce((s, m) => s + (WAGES[m.role] ?? 0), 0);
        totalEl.textContent = `Total daily payroll: $${payroll.toLocaleString()}`;
      }

      rerender();
    },
  });
}

// ---------------------------------------------------------------------
// Pricing sheet
// ---------------------------------------------------------------------

const GREEN_FEE_MIN = 10;

/**
 * How far above a round's worth the fee slider will let the player go.
 *
 * The cap used to be a flat $120, unrelated to anything in the economy,
 * so a well-built course could be worth $130 a round and the player
 * could not even charge what it was worth - the interface, not the
 * market, was setting the ceiling. Deriving it from perceived value
 * means the limit is always the demand curve punishing you for
 * overpricing, which is a decision, rather than a slider running out,
 * which is just a wall.
 */
const GREEN_FEE_HEADROOM = 1.6;
const GREEN_FEE_FLOOR_MAX = 60;

export function greenFeeCeiling(valuePerRound) {
  return Math.max(GREEN_FEE_FLOOR_MAX, Math.ceil(valuePerRound * GREEN_FEE_HEADROOM));
}
const TEE_INTERVAL_MIN = 6;
const TEE_INTERVAL_MAX = 30;

/**
 * Whether the tee sheet will back up at `teeInterval`, given the expected
 * playing minutes of every currently open hole (`holeMinutesByIndex`, in
 * `openHoles` order — the same order `src/sim/schedule.js`'s
 * `bottleneckHoleIndex` uses, so naming a hole from this matches how the
 * evening report names one).
 *
 * Pure and DOM-free on purpose: the one rule this whole fix exists to
 * teach — queueing begins the moment the interval drops below the
 * slowest hole's playing time (see schedule.js's flow-shop rule) — needs
 * to be testable without a browser.
 */
export function paceConsequence(teeInterval, holeMinutesByIndex) {
  if (holeMinutesByIndex.length === 0) {
    return { backup: false, slowestIndex: null, slowestMinutes: 0 };
  }
  let slowestIndex = 0;
  for (let i = 1; i < holeMinutesByIndex.length; i++) {
    if (holeMinutesByIndex[i] > holeMinutesByIndex[slowestIndex]) slowestIndex = i;
  }
  const slowestMinutes = holeMinutesByIndex[slowestIndex];
  return { backup: teeInterval < slowestMinutes, slowestIndex, slowestMinutes };
}

/** Builds one line of consequence text with a single bolded figure. */
function consequenceLine(before, figure, after) {
  const line = document.createElement('div');
  if (before) line.appendChild(document.createTextNode(before));
  const strong = document.createElement('strong');
  strong.textContent = figure;
  line.appendChild(strong);
  if (after) line.appendChild(document.createTextNode(after));
  return line;
}

/** Opens the pricing sheet. `onChange(nextState)` fires as each slider moves. */
export function openPricingSheet(sheetHost, { state, onChange }) {
  injectStyles();
  let current = state;

  sheetHost.open({
    id: 'pricing',
    title: 'Pricing',
    render(body) {
      // --- Green fee -----------------------------------------------
      const feeBlock = document.createElement('div');
      feeBlock.className = 'panel-slider-block';
      const feeLabel = document.createElement('div');
      feeLabel.className = 'panel-slider-label';
      const feeLabelText = document.createElement('span');
      feeLabelText.textContent = 'Green fee';
      const feeValue = document.createElement('strong');
      feeLabel.append(feeLabelText, feeValue);

      const feeSlider = document.createElement('input');
      feeSlider.type = 'range';
      feeSlider.className = 'panel-slider';
      feeSlider.min = String(GREEN_FEE_MIN);
      feeSlider.step = '1';
      feeSlider.value = String(current.resort.pricing.greenFee);

      const feeConsequence = document.createElement('div');
      feeConsequence.className = 'panel-consequence';

      function currentValuePerRound() {
        const holes = openHoles(current);
        const rating = holes.length ? courseRating(holes, current.turfQuality) : 0;
        return perceivedValue({
          courseRating: rating,
          prestige: current.prestige,
          amenities: current.resort.amenities,
          holesOpen: holes.length,
        });
      }

      function updateFeeConsequence() {
        const value = currentValuePerRound();
        // The ceiling follows what the course is worth, so improving the
        // resort always buys room to charge more.
        feeSlider.max = String(greenFeeCeiling(value));
        const fee = current.resort.pricing.greenFee;
        feeValue.textContent = `$${fee}`;
        feeConsequence.replaceChildren();
        feeConsequence.appendChild(
          consequenceLine('A round here is worth ', `$${Math.round(value)}`, ' to a guest right now.')
        );
        const tagLine = document.createElement('div');
        tagLine.textContent =
          fee > value ? 'Your fee is above what a round here is worth.' : 'Your fee is at or below that value.';
        feeConsequence.appendChild(tagLine);
      }

      feeSlider.addEventListener('input', () => {
        const next = structuredClone(current);
        next.resort.pricing.greenFee = Number(feeSlider.value);
        current = next;
        updateFeeConsequence();
        onChange(current);
      });

      feeBlock.append(feeLabel, feeSlider, feeConsequence);

      // --- Tee interval ----------------------------------------------
      const intervalBlock = document.createElement('div');
      intervalBlock.className = 'panel-slider-block';
      const intervalLabel = document.createElement('div');
      intervalLabel.className = 'panel-slider-label';
      const intervalLabelText = document.createElement('span');
      intervalLabelText.textContent = 'Tee interval';
      const intervalValue = document.createElement('strong');
      intervalLabel.append(intervalLabelText, intervalValue);

      const intervalSlider = document.createElement('input');
      intervalSlider.type = 'range';
      intervalSlider.className = 'panel-slider';
      intervalSlider.min = String(TEE_INTERVAL_MIN);
      intervalSlider.max = String(TEE_INTERVAL_MAX);
      intervalSlider.step = '1';
      intervalSlider.value = String(current.resort.pricing.teeInterval);

      const intervalConsequence = document.createElement('div');
      intervalConsequence.className = 'panel-consequence';

      // expectedMinutes simulates twelve groups per hole — far too slow to
      // call on every slider tick. The holes don't change while this sheet
      // is open, so it is computed once, here, at sheet-open time, and the
      // slider's `input` handler below only ever does the cheap comparison
      // against this cached array.
      // Marshals shorten hole times before the tee sheet is scheduled, so the
      // forecast has to apply the same factor the day will. Without it, hiring
      // a marshal never moved this line even though the day genuinely ran
      // faster - the sheet contradicting the simulation.
      const carts = state.resort.amenities.some((a) => a.type === 'cartBarn');
      const marshals = state.resort.staff.filter((m) => m.role === 'marshal').length;
      const paceFactor = marshalPaceFactor(marshals);
      const holeMinutesByIndex = openHoles(state)
        .map((h) => expectedMinutes(h, { carts }) * paceFactor);

      function updateIntervalConsequence() {
        const interval = current.resort.pricing.teeInterval;
        intervalValue.textContent = `${interval} min`;
        const groups = maxGroupsForDay(interval);
        intervalConsequence.replaceChildren();
        intervalConsequence.appendChild(
          consequenceLine(
            `At ${interval} minutes apart, the tee sheet fits `,
            `${groups}`,
            ' groups a day.'
          )
        );

        const pace = paceConsequence(interval, holeMinutesByIndex);
        const paceLine = document.createElement('div');
        if (!pace.backup) {
          paceLine.textContent = 'No backup expected.';
        } else {
          const strongHole = document.createElement('strong');
          strongHole.textContent = ordinal(pace.slowestIndex + 1);
          paceLine.append('Groups will back up on the ', strongHole, '.');
        }
        intervalConsequence.appendChild(paceLine);
      }

      intervalSlider.addEventListener('input', () => {
        const next = structuredClone(current);
        next.resort.pricing.teeInterval = Number(intervalSlider.value);
        current = next;
        updateIntervalConsequence();
        onChange(current);
      });

      intervalBlock.append(intervalLabel, intervalSlider, intervalConsequence);

      body.append(feeBlock, intervalBlock);
      updateFeeConsequence();
      updateIntervalConsequence();
    },
  });
}
