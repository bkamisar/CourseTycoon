/**
 * The menu board: what this amenity serves, and who it is for.
 *
 * Built to be looked at rather than read. The game had spent three slices
 * — segments, narration, decision events — putting words on cards, and the
 * author's note on approving this one was that everything was getting text
 * heavy. So the sprite comes first on every line, appeal is three coloured
 * bars and never a sentence, and the only prose on the screen is one
 * closing line about who your crowd actually is.
 *
 * **Every number here comes from `src/sim/menu.js` and `src/sim/kitchen.js`.**
 * Nothing is retyped. A menu board is a screen made almost entirely of
 * prices, and the recurring bug on this project is the interface telling
 * the player something the simulation disagrees with — the renderer
 * against `lieAt`, prices in the UI against the sim, marshals missing from
 * the pace forecast. A hardcoded `$9` here would be the next one.
 *
 * The bars are the point. Appeal is the single fact that decides every
 * choice on this screen, so it has to be legible without a tap: a full
 * green bar means that crowd wants it, a dark stub means they will not buy
 * it whatever it costs.
 */
import { PALETTE } from '../render/palette.js';
import { foodSpriteCanvas } from '../render/food.js';
import { ITEMS, MENU_SLOTS, itemsFor, menuPrep, menuPull, menuBasket } from '../sim/menu.js';
import { kitchenCapacity, kitchenLoad } from '../sim/kitchen.js';
import { SEGMENTS, SEGMENT_KEYS } from '../sim/segments.js';
import { titleCase } from './panels.js';

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .mb-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin: 0 0 8px;
      font-family: monospace;
    }
    .mb-head-label {
      color: ${PALETTE.UI_LIGHT};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .mb-slots { color: ${PALETTE.ACCENT}; font-size: 12px; }
    .mb-row {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 44px;
      box-sizing: border-box;
      background: ${PALETTE.OUTLINE};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
      padding: 6px 9px;
      margin-bottom: 5px;
      font-family: monospace;
      color: ${PALETTE.WHITE};
      cursor: pointer;
      text-align: left;
    }
    /* Faded, but not so faded you cannot read it. When the board is full
       every unused item is disabled, and those are exactly the rows the
       player is studying to decide what to swap out — hiding their appeal
       bars defeats the one thing this screen exists to show. */
    .mb-row:disabled { opacity: 0.72; cursor: default; }
    .mb-row--off { background: transparent; }
    .mb-art { flex: 0 0 auto; }
    .mb-text { flex: 1 1 auto; min-width: 0; }
    .mb-name { font-size: 13px; line-height: 1.3; }
    .mb-bars { display: flex; gap: 3px; margin-top: 4px; }
    .mb-bar {
      width: 16px;
      height: 4px;
      border-radius: 1px;
      background: ${PALETTE.UI_DARK};
    }
    .mb-price { flex: 0 0 auto; font-size: 13px; color: ${PALETTE.ACCENT}; }
    .mb-sub {
      margin: 12px 0 6px;
      color: ${PALETTE.UI_LIGHT};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-family: monospace;
    }
    .mb-foot {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid ${PALETTE.UI_DARK};
      font-family: monospace;
      font-size: 12px;
      color: ${PALETTE.UI_LIGHT};
      line-height: 1.6;
    }
    .mb-foot strong { color: ${PALETTE.WHITE}; font-weight: normal; }
    .mb-warn { color: ${PALETTE.SAND}; }
    .mb-legend {
      display: flex;
      gap: 10px;
      margin: 0 0 8px;
      font-family: monospace;
      font-size: 10px;
      color: ${PALETTE.UI_LIGHT};
    }
    .mb-legend span { display: flex; align-items: center; gap: 4px; }
  `;
  document.head.appendChild(style);
}

/** A crowd's bar, filled in proportion to how much they want this item.
 * Dark and stubby means they will not buy it — which is information, so it
 * still draws rather than being left blank. */
function appealBar(appeal) {
  const bar = document.createElement('i');
  bar.className = 'mb-bar';
  const width = Math.max(3, Math.round(16 * appeal));
  const fill = appeal >= 0.7 ? PALETTE.FAIRWAY
    : appeal >= 0.4 ? PALETTE.SAND
      : PALETTE.UI_DARK;
  bar.style.background =
    `linear-gradient(to right, ${fill} ${width}px, ${PALETTE.UI_DARK} ${width}px)`;
  return bar;
}

function itemRow(id, { active, disabled, onTap }) {
  const item = ITEMS[id];
  const row = document.createElement('button');
  row.type = 'button';
  row.className = active ? 'mb-row' : 'mb-row mb-row--off';
  row.disabled = Boolean(disabled);

  const art = document.createElement('span');
  art.className = 'mb-art';
  art.appendChild(foodSpriteCanvas(id, 2));

  const text = document.createElement('span');
  text.className = 'mb-text';
  const name = document.createElement('span');
  name.className = 'mb-name';
  name.textContent = item.name;
  const bars = document.createElement('span');
  bars.className = 'mb-bars';
  for (const key of SEGMENT_KEYS) bars.appendChild(appealBar(item.appeal[key]));
  text.append(name, bars);

  const price = document.createElement('span');
  price.className = 'mb-price';
  // Straight from the catalogue. Never retyped.
  price.textContent = `$${item.price}`;

  row.append(art, text, price);
  row.addEventListener('click', () => { if (!row.disabled) onTap(); });
  return row;
}

/**
 * Which crowd this board is actually for, in a sentence.
 *
 * The bars say what each item does; this says what the whole board adds
 * up to, because a player can pick five individually sensible items and
 * still end up with a board aimed at nobody.
 */
function verdict(menu) {
  if (menu.length === 0) return 'Nothing on the board. Nobody is buying anything.';
  const pulls = SEGMENT_KEYS.map((key) => ({ key, pull: menuPull(menu, key) }));
  pulls.sort((a, b) => b.pull - a.pull);
  const top = pulls[0];
  if (top.pull < 0.45) return 'This board does not really suit anyone who plays here.';
  if (top.pull - pulls[2].pull < 0.2) {
    return 'Something for everyone — and nothing special for anyone.';
  }
  const label = SEGMENTS[top.key].shortLabel;
  return `Aimed at ${label}. They spend about $${Math.round(menuBasket(menu, top.key))} a head.`;
}

/**
 * Opens the board for one amenity.
 *
 * `onChange(nextState)` fires with a new state whenever the menu changes —
 * the caller owns the state, the same contract the build, staff and
 * pricing sheets already use.
 */
export function openMenuBoard(sheetHost, { state, amenityId, onChange }) {
  injectStyles();
  let current = state;

  // Addressed by id, not by type. A later act gives the player a second
  // course with its own snack shack and its own board aimed at a
  // different crowd, and this is the line that makes that an addition
  // rather than a rewrite.
  const find = (s) => s.resort.amenities.find((a) => a.id === amenityId);
  const amenityType = find(state)?.type;
  const slots = MENU_SLOTS[amenityType] ?? 0;

  const menuOf = (s) => find(s)?.menu ?? [];

  function setMenu(next) {
    const updated = structuredClone(current);
    const amenity = find(updated);
    if (!amenity) return;
    amenity.menu = next;
    current = updated;
    onChange?.(updated);
  }

  sheetHost.open({
    id: `menu-${amenityId}`,
    title: `${titleCase(amenityType)} menu`,
    render(body) {
      // The sheet's scrolling element, whichever ancestor actually owns
      // the overflow.
      function scroller() {
        let el = body;
        while (el && el !== document.body) {
          if (el.scrollHeight > el.clientHeight + 4) return el;
          el = el.parentElement;
        }
        return null;
      }

      let opened = false;

      function rerender() {
        // Preserve the scroll position across a re-render, but start at
        // the top when the sheet first opens. Without the first half,
        // tapping an item throws the player back to the top of a
        // twenty-one row list; without the second, the sheet opens
        // somewhere in the middle of it.
        const keep = opened ? (scroller()?.scrollTop ?? 0) : 0;
        body.replaceChildren();
        const menu = menuOf(current);

        const legend = document.createElement('div');
        legend.className = 'mb-legend';
        for (const key of SEGMENT_KEYS) {
          const cell = document.createElement('span');
          const swatch = document.createElement('i');
          swatch.className = 'mb-bar';
          swatch.style.background = PALETTE.FAIRWAY;
          cell.append(swatch, document.createTextNode(SEGMENTS[key].shortLabel));
          legend.appendChild(cell);
        }
        body.appendChild(legend);

        const head = document.createElement('div');
        head.className = 'mb-head';
        const label = document.createElement('span');
        label.className = 'mb-head-label';
        label.textContent = 'On the board';
        const count = document.createElement('span');
        count.className = 'mb-slots';
        count.textContent = `${menu.length} of ${slots}`;
        head.append(label, count);
        body.appendChild(head);

        for (const id of menu) {
          body.appendChild(itemRow(id, {
            active: true,
            onTap: () => { setMenu(menu.filter((x) => x !== id)); rerender(); },
          }));
        }

        const sub = document.createElement('div');
        sub.className = 'mb-sub';
        sub.textContent = menu.length >= slots ? 'The board is full' : 'Add something';
        body.appendChild(sub);

        for (const id of itemsFor(amenityType)) {
          if (menu.includes(id)) continue;
          body.appendChild(itemRow(id, {
            active: false,
            disabled: menu.length >= slots,
            onTap: () => { setMenu([...menu, id]); rerender(); },
          }));
        }

        // The footer is where breadth stops being free. Both figures come
        // from kitchen.js, so the screen cannot drift from the simulation.
        const load = kitchenLoad(current.resort.amenities);
        const capacity = kitchenCapacity(current.resort.staff);

        const foot = document.createElement('div');
        foot.className = 'mb-foot';

        const kitchen = document.createElement('div');
        const used = document.createElement('strong');
        used.textContent = `${load} of ${capacity}`;
        kitchen.append(
          document.createTextNode('Kitchen '),
          used,
          document.createTextNode(`  ·  this board uses ${menuPrep(menu)}`)
        );
        foot.appendChild(kitchen);

        if (load > capacity) {
          const warn = document.createElement('div');
          warn.className = 'mb-warn';
          warn.textContent =
            'Past what your cooks can cook. Service slows and guests notice — hire kitchen staff or serve less.';
          foot.appendChild(warn);
        }

        const who = document.createElement('div');
        who.textContent = verdict(menu);
        foot.appendChild(who);

        body.appendChild(foot);

        const el = scroller();
        if (el) el.scrollTop = keep;
        opened = true;
      }
      rerender();
    },
  });
}
