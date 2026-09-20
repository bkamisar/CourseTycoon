/**
 * The amenity strip: a DOM row of labelled chips naming every amenity the
 * player has built, mounted right below the HUD bar.
 *
 * This replaces a canvas-drawn row of unlabelled 8x8 building sprites.
 * Playtesting was blunt about it: "the top left bar with sprites... I
 * can't tell what they are at all." Eight pixels has no room for a label,
 * and the overview canvas is drawn at 180x320 internal resolution — there
 * is no zoom level on a real phone that fixes that. DOM text does not have
 * that ceiling, so amenities live here now instead.
 *
 * Labels are shared with the build sheet's own labelling (`titleCase` from
 * `src/ui/panels.js`) so an amenity is never named one thing here and
 * another thing in the sheet that lets you buy it.
 *
 * Tapping the strip opens the same build sheet the overview toolbar's
 * "Amenities" button does — one tappable summary, per the brief, rather
 * than a separate per-chip target that would just recreate the old
 * too-small-to-hit-reliably problem in DOM form.
 */
import { PALETTE } from '../render/palette.js';
import { titleCase } from './panels.js';

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .amenity-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 6px 10px;
      background: ${PALETTE.UI_DARK};
      border-bottom: 2px solid ${PALETTE.OUTLINE};
      box-sizing: border-box;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      pointer-events: auto;
      cursor: pointer;
    }
    .amenity-bar::-webkit-scrollbar {
      display: none;
    }
    .amenity-chip {
      flex: none;
      white-space: nowrap;
      padding: 4px 8px;
      background: ${PALETTE.PATH};
      color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.OUTLINE};
      border-radius: 10px;
      font-family: monospace;
      font-size: 11px;
    }
    .amenity-bar-empty {
      color: ${PALETTE.UI_LIGHT};
      font-family: monospace;
      font-size: 11px;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Mounts the amenity strip into `root` and returns `{ element, update(state) }`.
 * `onTap` fires on any tap/click anywhere on the strip — the whole row is
 * one target, sized well past the 44px touch minimum by being a full-width
 * band rather than the old individual 8x8 icons.
 */
export function mountAmenityBar(root, { onTap }) {
  injectStyles();

  const bar = document.createElement('div');
  bar.className = 'amenity-bar';
  bar.addEventListener('click', () => onTap?.());
  root.appendChild(bar);

  function update(state) {
    const amenities = state.resort.amenities;
    bar.replaceChildren();
    if (amenities.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'amenity-bar-empty';
      empty.textContent = 'No amenities yet — tap to build one';
      bar.appendChild(empty);
      return;
    }
    for (const amenity of amenities) {
      const chip = document.createElement('span');
      chip.className = 'amenity-chip';
      chip.textContent = titleCase(amenity.type);
      bar.appendChild(chip);
    }
  }

  return { element: bar, update };
}
