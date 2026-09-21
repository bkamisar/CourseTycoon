/**
 * The narration card: one line, from one voice, about the day that just
 * happened.
 *
 * This is the answer to emergent positioning being unreadable -- the course
 * silently decides who shows up (src/sim/segments.js), and this is how the
 * resort tells its owner what it has become, in a voice, rather than a
 * second statistics panel. `src/sim/narration.js` already picked the line
 * deterministically and put it on `report.narration`; this file only has to
 * show it without getting in the way.
 *
 * "Without getting in the way" is the whole design brief. It fires most
 * days (see narration.js: there is always a fallback line, a silent day
 * would be a bug), so it has to read as the lightest thing on the screen --
 * a toast the world hands you on your way back to the map, not a modal
 * that stands between the player and the button they actually came to
 * press. Concretely: it floats above the report rather than blocking it,
 * everything outside its own footprint still receives taps (`pointer-
 * events: none` on the wrapper), and either the explicit dismiss control
 * or a tap anywhere on the card itself closes it -- one tap, from anywhere
 * on a large target, never a precise hit on a tiny "x".
 */
import { PALETTE } from '../render/palette.js';

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .narration-wrap {
      position: fixed;
      left: 0;
      right: 0;
      top: max(14px, env(safe-area-inset-top, 0px));
      z-index: 30;
      display: flex;
      justify-content: center;
      padding: 0 14px;
      pointer-events: none;
    }
    .narration-card {
      pointer-events: auto;
      width: 100%;
      max-width: 520px;
      background: ${PALETTE.UI_DARK};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-left: 4px solid ${PALETTE.ACCENT};
      border-radius: 10px;
      padding: 12px 40px 12px 14px;
      box-sizing: border-box;
      position: relative;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      font-family: monospace;
      animation: narration-in 180ms ease-out;
    }
    @keyframes narration-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .narration-speaker {
      margin: 0 0 5px;
      color: ${PALETTE.UI_LIGHT};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .narration-text {
      margin: 0;
      color: ${PALETTE.WHITE};
      font-size: 15px;
      line-height: 1.55;
    }
    .narration-dismiss {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
      background: transparent;
      border: none;
      color: ${PALETTE.UI_LIGHT};
      font-size: 18px;
      font-family: monospace;
      line-height: 1;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Mounts (or clears) the narration card into `root`. Passing a falsy
 * `narration` clears `root` and does nothing else -- day one of a fresh
 * save has no history to narrate about only in the sense that the sim
 * always supplies a fallback line (see LINES' `any-*` entries), so this
 * is a defensive no-op path, not one the game is expected to hit.
 *
 * `onDismiss` fires exactly once, from either the explicit control or a
 * tap anywhere else on the card -- both are "the one tap" the task calls
 * for, just two ways to land it.
 */
export function mountNarrationCard(root, { narration, onDismiss } = {}) {
  injectStyles();
  root.replaceChildren();
  if (!narration) return { element: null };

  const wrap = document.createElement('div');
  wrap.className = 'narration-wrap';

  const card = document.createElement('div');
  card.className = 'narration-card';
  card.addEventListener('click', () => onDismiss?.());

  const speaker = document.createElement('p');
  speaker.className = 'narration-speaker';
  speaker.textContent = narration.speaker;

  const text = document.createElement('p');
  text.className = 'narration-text';
  text.textContent = narration.text;

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'narration-dismiss';
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', 'Dismiss');
  // Its own handler, not just relying on the card's -- a button inside a
  // clickable card still needs stopPropagation, otherwise the click both
  // dismisses (bubelling to the card) AND the button's own handler fires
  // onDismiss a second time. Harmless here since onDismiss is idempotent
  // from the caller's side, but no reason to rely on that.
  dismiss.addEventListener('click', (evt) => {
    evt.stopPropagation();
    onDismiss?.();
  });

  card.append(speaker, text, dismiss);
  wrap.appendChild(card);
  root.appendChild(wrap);
  return { element: wrap };
}
