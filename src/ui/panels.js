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
import { ITEMS, MENU_SLOTS } from '../sim/menu.js';
import { amenity } from '../sim/state.js';
import { openMenuBoard } from './menuBoard.js';
import { kitchenCapacity, kitchenLoad } from '../sim/kitchen.js';
import { shopCapacity, PER_SHOP_STAFF, BASE_SHOP_CAPACITY } from '../sim/shop.js';
import { PER_COOK, BASE_CAPACITY } from '../sim/kitchen.js';
import { AMENITIES, WAGES, perceivedValue, amenityPerceivedValue, demandGroups, demolitionRefund } from '../sim/economy.js';
import { maxGroupsForDay } from '../sim/schedule.js';
import { holeStats } from '../sim/hole.js';
import { marshalPaceFactor } from '../sim/day.js';
import { openHoles } from '../sim/state.js';
import { courseRating } from '../sim/ratings.js';
import { expectedMinutes } from '../sim/round.js';
import { ordinal } from '../sim/satisfaction.js';

/** Plain-words blurb per amenity. Flavour text only — never a number. */
const AMENITY_BLURB = {
  clubhouse: 'The resort’s front desk and hub. Always open.',
  proShop: 'Sells merchandise to guests after their round.',
  snackShack: 'Quick food and drinks near the clubhouse. Golfers grab something early in the round — a smaller lift than the halfway house, but it costs them no time at all.',
  halfwayHouse: 'A stop partway round for food and a breather. Worth most on a long course — golfers finish a nine with plenty left, so the stop costs more time than the rest is worth. It comes into its own over eighteen.',
  restaurant: 'Sit-down dining after the round. Needs a full kitchen behind it, and on a nine-hole course most golfers leave rather than stay to eat — it earns its keep once there is a reason to linger.',
  restrooms: 'Guests notice sharply when there aren’t enough.',
  drivingRange: 'Lets guests warm up before teeing off.',
  practiceGreen: 'Practice putting before the round starts.',
  cartBarn: 'A fleet of carts. Takes about half an hour off a round and lifts satisfaction more than anything else you can build — and costs more to run than everything else combined. Buy it when you can carry it.',
  beverageCart: 'Dee works the course with a cart. She reaches golfers without stopping them, so she earns without costing a minute of pace — and she needs no kitchen if you keep her to drinks. She sells; she does not feed. That is what the snack shack and halfway house are for.',
};

/**
 * Amenities that are a building plus a person, and what happens without
 * the person.
 *
 * The game says a consistent thing about staff now: a building with
 * nobody in it only half works. It said nothing at all until shopStaff
 * turned out to be a $170/day wage that no part of the simulation read,
 * and the restaurant turned out to lose $555 a day when built by a player
 * who had not thought about cooks. Neither was signposted anywhere.
 */
/** What an amenity is for, in words. Exported so a test can assert that
 * everything buildable has something to say about itself — a silent row
 * in a shop is a thing the player has no way to evaluate. */
export function amenityBlurb(type) {
  return AMENITY_BLURB[type] ?? '';
}

const NEEDS_STAFF = {
  proShop: { role: 'shopStaff', label: 'a shop hire', what: 'sales' },
  snackShack: { role: 'kitchenStaff', label: 'a cook', what: 'food service' },
  halfwayHouse: { role: 'kitchenStaff', label: 'a cook', what: 'food service' },
  restaurant: { role: 'kitchenStaff', label: 'a cook', what: 'food service' },
  beverageCart: { role: 'kitchenStaff', label: 'a cook', what: 'food service' },
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
    .panel-row-warn {
      color: ${PALETTE.SAND};
      font-size: 11px;
      line-height: 1.5;
      margin-top: 4px;
    }
    .panel-row-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 0 0 auto;
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
      /**
       * Demolition, behind a confirmation.
       *
       * Amenities could be built and never removed, which turned a
       * wrong guess into a permanent one — and wrong guesses are easy
       * here, since a halfway house loses $1,437 a day once a snack shack
       * and a cart are already feeding people and nothing says so until
       * it has happened. A game whose effects depend on combinations has
       * to let the player take a combination apart again.
       */
      function removeButton(type) {
        const refund = demolitionRefund(type);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'panel-btn panel-btn--danger';
        btn.textContent = 'Remove';
        btn.addEventListener('click', () => {
          sheetHost.open({
            id: `remove-${type}`,
            title: `Remove the ${titleCase(type).toLowerCase()}?`,
            render(confirmBody, { close }) {
              const spec = AMENITIES[type];
              const words = document.createElement('div');
              words.className = 'panel-row-blurb';
              words.textContent =
                `It cost $${spec.build.toLocaleString()} to build. You get $${refund.toLocaleString()} back `
                + `and stop paying $${spec.upkeep}/day to run it. Anything on its menu goes with it.`;
              const go = document.createElement('button');
              go.type = 'button';
              go.className = 'panel-btn panel-btn--danger';
              go.textContent = `Remove it for $${refund.toLocaleString()} back`;
              go.addEventListener('click', () => {
                const next = structuredClone(current);
                next.money += refund;
                next.resort.amenities = next.resort.amenities.filter((a) => a.type !== type);
                current = next;
                onChange(current);
                close();
                rerender();
              });
              const keep = document.createElement('button');
              keep.type = 'button';
              keep.className = 'panel-btn';
              keep.textContent = 'Keep it';
              keep.addEventListener('click', () => close());
              confirmBody.append(words, go, keep);
            },
          });
        });
        return btn;
      }

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

          // Loud, and before the money is spent. Read live from the same
          // capacity functions the day itself runs on.
          const needs = NEEDS_STAFF[type];
          const staffWarning = document.createElement('div');
          staffWarning.className = 'panel-row-warn';
          if (needs) {
            const staff = current.resort.staff;
            if (needs.role === 'shopStaff') {
              const golfers = (current.history.at(-1)?.groupsPlayed ?? 0) * 4;
              const capacity = shopCapacity(staff);
              staffWarning.textContent = golfers > capacity
                ? `Needs ${needs.label}. ${golfers} golfers came yesterday and the counter serves ${capacity} — the rest walk out without buying.`
                : `Needs ${needs.label} once you are busy: the counter serves ${capacity} golfers a day, +${PER_SHOP_STAFF} per hire.`;
            } else {
              const load = kitchenLoad(current.resort.amenities);
              const capacity = kitchenCapacity(staff);
              staffWarning.textContent = load > capacity
                ? `Needs ${needs.label}. Your boards already ask for ${load} prep against a kitchen of ${capacity} — ${needs.what} is running slow.`
                : `Needs ${needs.label} if you put hot food on its board. Kitchen is ${load} of ${capacity}.`;
            }
          }
          // What this amenity actually does, stated plainly: it is not
          // just flavour, it is the one number that both raises what a
          // round can be priced at AND draws a bigger crowd — a chain the
          // player otherwise has no way to see coming (§15a: every choice
          // states its cost explicitly).
          const value = document.createElement('div');
          value.className = 'panel-row-blurb';
          value.textContent =
            `Adds $${Math.round(amenityPerceivedValue(type))} to what a round is worth — worth more draws more golfers.`;
          info.append(title, detail, blurb);
          if (NEEDS_STAFF[type]) info.appendChild(staffWarning);
          info.appendChild(value);

          const action = document.createElement('button');
          action.type = 'button';
          action.className = 'panel-btn';

          if (owned) {
            action.textContent = 'Built';
            action.disabled = true;
            if (MENU_SLOTS[type]) {
              // What this board is currently worth per guest, quoted from
              // the simulation rather than recomputed here - the same
              // anti-drift rule the perceived-value line above follows.
              const built = current.resort.amenities.find((a) => a.type === type);
              const menu = built?.menu ?? [];
              const board = document.createElement('div');
              board.className = 'panel-row-blurb';
              board.textContent = menu.length
                ? `Serving ${menu.length} of ${MENU_SLOTS[type]}: ${menu.map((id) => ITEMS[id]?.name).filter(Boolean).join(', ')}`
                : 'Nothing on the board.';
              info.appendChild(board);
            }
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
              // A newly built food amenity opens with a sensible board.
              // Without this it would be built and serving nothing, which
              // reads as broken rather than as an invitation.
              next.resort.amenities.push(amenity(type));
              current = next;
              onChange(current);
              rerender();
            });
          }

          if (owned && MENU_SLOTS[type]) {
            // Stacked under "Built" rather than beside it: two 44px
            // targets side by side do not fit a 375px row next to the
            // amenity's name and blurb.
            const actions = document.createElement('div');
            actions.className = 'panel-row-actions';
            const menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'panel-btn';
            menuBtn.textContent = 'Menu';
            menuBtn.addEventListener('click', () => {
              const built = current.resort.amenities.find((a) => a.type === type);
              if (!built) return;
              openMenuBoard(sheetHost, {
                state: current,
                amenityId: built.id,
                onChange: (next) => { current = next; onChange(current); },
              });
            });
            actions.append(action, menuBtn, removeButton(type));
            row.append(info, actions);
          } else if (owned && AMENITIES[type].build > 0) {
            const actions = document.createElement('div');
            actions.className = 'panel-row-actions';
            actions.append(action, removeButton(type));
            row.append(info, actions);
          } else {
            row.append(info, action);
          }
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

/**
 * Hireable roles.
 *
 * `kitchenStaff` joined this list when menus arrived. It had existed in
 * economy.js as a wage that nothing read; now it is what decides how much
 * food actually reaches guests (kitchen.js), and leaving it off this list
 * would make the entire cost-of-breadth mechanic unreachable — the player
 * could overload a kitchen and have no way to fix it.
 */
/**
 * Every role the player can hire, and it must be EVERY role in `WAGES`.
 *
 * shopStaff was missing from this list while the wage existed, the
 * capacity maths ran, guests complained about the queue, and the
 * Amenities sheet told the player in so many words that the pro shop
 * "needs a shop hire". There was no way to hire one. A player read an
 * instruction the game would not let them follow.
 *
 * tests/panels.test.js now asserts this list matches WAGES in both
 * directions. The copy test that existed checked every role had a
 * description — which passed, because the description was there too. It
 * was checking the wrong thing.
 */
export const STAFF_ROLES = ['groundskeeper', 'marshal', 'shopStaff', 'kitchenStaff'];
const ROLE_LABEL = {
  groundskeeper: 'Groundskeeper',
  marshal: 'Marshal',
  shopStaff: 'Shop hand',
  kitchenStaff: 'Cook',
};

/**
 * What each hire actually does, with the numbers read from the modules
 * that own them rather than retyped.
 *
 * The staff sheet showed a name and a wage and nothing else, which was
 * survivable when there were two roles doing obvious things and is not
 * now there are four, three of them situational. A marshal is worthless
 * on an empty course and worth thousands a day on a busy one; nothing
 * anywhere said so, and the same silence is what let a wage exist for
 * months against a role that did nothing at all.
 */
export function roleBlurb(role) {
  switch (role) {
    case 'groundskeeper':
      return 'Holds the turf steady — about three holes each. Without enough, '
        + 'every round played wears the course down faster than it recovers.';
    case 'marshal':
      return 'Moves slow groups along. Worth nothing on a quiet course and a '
        + 'great deal on a busy one, and since waiting is what hurts guests '
        + 'most, marshals are how a full tee sheet stays bearable.';
    case 'shopStaff':
      return `Serves the pro shop counter. The clubhouse desk manages about `
        + `${BASE_SHOP_CAPACITY} golfers a day on its own; each hire adds `
        + `${PER_SHOP_STAFF}. Past that the queue turns people away with their money.`;
    case 'kitchenStaff':
      return `Cooks. Your boards can ask for ${BASE_CAPACITY} prep with nobody `
        + `hired; each cook adds ${PER_COOK}. Past capacity the food comes out slowly `
        + 'and guests notice.';
    default:
      return '';
  }
}

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
          const blurb = document.createElement('div');
          blurb.className = 'panel-row-blurb';
          blurb.textContent = roleBlurb(role);
          info.append(title, detail, blurb);

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

      /**
       * How many groups actually want to play today, at the current
       * price, pace and amenities — the same call `src/sim/day.js` makes
       * to decide who shows up, fed the same inputs it computes (course
       * difficulty and scenery averaged over the open holes, recent
       * satisfaction, whether rooms exist). Mirrors `runDay`'s own
       * demand computation rather than a re-derived shortcut, so this
       * sheet can never show a demand figure the simulation wouldn't
       * also produce.
       *
       * This is what makes an amenity's demand effect visible: raising
       * `perceivedValue` (see the Amenities sheet) raises this number
       * too, and the ONE moment that matters to the player is whether it
       * has room to land — which `updateIntervalConsequence` below reads
       * this to say plainly.
       */
      function currentDemand() {
        const holes = openHoles(current);
        if (holes.length === 0) return { total: 0 };
        const rating = courseRating(holes, current.turfQuality);
        const courseDifficulty = holes.reduce((s, h) => s + holeStats(h).difficulty, 0) / holes.length;
        const averageScenery = holes.reduce((s, h) => s + holeStats(h).scenery, 0) / holes.length;
        const recentHistory = current.satisfactionHistory.slice(-3);
        const recentSatisfaction = recentHistory.length
          ? recentHistory.reduce((s, v) => s + v, 0) / recentHistory.length
          : 50;
        const hasRooms = (current.resort.rooms?.count ?? 0) > 0;
        return demandGroups({
          courseRating: rating,
          prestige: current.prestige,
          amenities: current.resort.amenities,
          greenFee: current.resort.pricing.greenFee,
          teeInterval: current.resort.pricing.teeInterval,
          recentSatisfaction,
          holesOpen: holes.length,
          courseDifficulty,
          scenery: averageScenery,
          turfQuality: current.turfQuality,
          hasRooms,
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
        // The fee is also an input to demand (see currentDemand), so the
        // tee sheet's "full" line below can flip with the fee alone, not
        // just the interval — keep it live rather than stale until the
        // player happens to touch the other slider.
        updateIntervalConsequence();
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

        // The one moment more perceived value (a new amenity, a lower
        // fee) stops helping: the tee sheet is already full. Below this,
        // every extra golfer an amenity draws is a golfer with nowhere to
        // tee off — see the Amenities sheet's per-amenity value line for
        // the other half of this trade.
        const demand = currentDemand();
        if (demand.total > 0 && demand.total >= groups) {
          const capacityLine = document.createElement('div');
          const strongFull = document.createElement('strong');
          strongFull.textContent = 'full';
          capacityLine.append(
            "Today's tee sheet is ",
            strongFull,
            ' — more perceived value won’t bring more golfers, only longer waits.'
          );
          intervalConsequence.appendChild(capacityLine);
        }
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
