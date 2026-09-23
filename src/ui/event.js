/**
 * The decision card: the one thing in this game that stops and waits.
 *
 * Everything else in the UI is designed to stay out of the way. The
 * narration card floats and lets taps through (src/ui/narration.js); the
 * sheets close on a tap outside; the report has a Continue button you can
 * hit without reading a line of it. This is the deliberate exception, and
 * the exception is the whole feature.
 *
 * **It is not dismissable.** No close button, no tap-outside, no Escape,
 * no Continue that skips it. The only way back to the resort is choosing
 * one of the options. That is not an oversight to be tidied up later: an
 * event that can be waved away is a notification, and a player who learns
 * they can wave it away stops reading it by the third one. The author's
 * own verdict on Act I was that it could be played on autopilot, and a
 * dismissable decision is autopilot with extra steps.
 *
 * Each choice shows three things, in this order and for this reason:
 *
 *   1. the **stance** ("Pragmatic — splits the difference"), which says
 *      what kind of answer this is before any number is read;
 *   2. the **label**, which says what you do;
 *   3. the **cost**, in plain numbers, which says what it does to you.
 *
 * The cost is never hidden. The reference the author gave — an MLB
 * lockout simulator — prints "Costs 3 days and 35 points" on every
 * option, and that is precisely why its options read as decisions rather
 * than as a guess between three unlabelled doors. An unread cost is the
 * same as no cost at all, so this file's layout rule is that a choice's
 * cost can never be separated from the choice: they are one button, they
 * scroll together, and nothing is ever clipped to make the card fit.
 */
import { PALETTE } from '../render/palette.js';
import { STANCES } from '../sim/events.js';

/**
 * The chip colour per stance. Roles, not decoration: the money-spending
 * stances read warm, the ones that spend nothing read cool and muted, so
 * a glance down the card sorts the options before a word is read.
 *
 * Drawn from the palette like everything else — no raw hex outside
 * src/render/palette.js.
 */
const STANCE_COLOR = {
  populist: PALETTE.FAIRWAY,
  ambitious: PALETTE.ACCENT,
  commercial: PALETTE.SAND,
  thorough: PALETTE.WATER,
  pragmatic: PALETTE.GREEN_SURFACE,
  principled: PALETTE.WHITE,
  thrifty: PALETTE.UI_LIGHT,
  defiant: PALETTE.SAND_SHADOW,
};

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .event-scrim {
      position: fixed;
      inset: 0;
      z-index: 60;
      background: rgba(10, 10, 14, 0.82);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(12px, env(safe-area-inset-top, 0px)) 12px
               max(12px, env(safe-area-inset-bottom, 0px));
      box-sizing: border-box;
      font-family: monospace;
      /* Above every other overlay, and it swallows taps rather than
         letting them reach the report underneath. There is no handler on
         it: tapping the scrim does nothing at all, on purpose. */
    }
    .event-card {
      width: 100%;
      max-width: 520px;
      max-height: 100%;
      display: flex;
      flex-direction: column;
      background: ${PALETTE.UI_DARK};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-top: 4px solid ${PALETTE.ACCENT};
      border-radius: 10px;
      box-sizing: border-box;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
      animation: event-in 200ms ease-out;
      overflow: hidden;
    }
    @keyframes event-in {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }
    .event-head {
      padding: 12px 14px 0;
      flex: 0 0 auto;
    }
    .event-kicker {
      margin: 0 0 8px;
      color: ${PALETTE.ACCENT};
      font-size: 10px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .event-speaker {
      margin: 0 0 6px;
      color: ${PALETTE.UI_LIGHT};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .event-prompt {
      margin: 0 0 12px;
      color: ${PALETTE.WHITE};
      font-size: 15px;
      line-height: 1.5;
    }
    /* The choices scroll, not the page. The head stays pinned so the
       question never scrolls away from its own answers. */
    .event-choices {
      flex: 1 1 auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 0 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .event-choice {
      display: block;
      width: 100%;
      min-height: 44px;
      text-align: left;
      background: ${PALETTE.OUTLINE};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
      padding: 9px 11px;
      box-sizing: border-box;
      cursor: pointer;
      font-family: monospace;
      color: ${PALETTE.WHITE};
    }
    .event-choice:active { background: ${PALETTE.UI_DARK}; }
    .event-stance {
      display: block;
      margin: 0 0 3px;
      font-size: 10px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .event-stance-gloss {
      text-transform: none;
      letter-spacing: 0;
      color: ${PALETTE.UI_LIGHT};
    }
    .event-label {
      display: block;
      margin: 0 0 4px;
      font-size: 14px;
      line-height: 1.35;
      color: ${PALETTE.WHITE};
    }
    .event-cost {
      display: block;
      margin: 0;
      font-size: 12px;
      line-height: 1.45;
      color: ${PALETTE.UI_LIGHT};
    }
  `;
  document.head.appendChild(style);
}

/**
 * Mounts the decision card into `root`, or clears `root` when there is no
 * event. `onChoose(index)` fires once, with the index of the chosen
 * option; the card disarms itself first, so a double-tap on a slow phone
 * cannot apply the same consequence twice.
 *
 * The caller is responsible for tearing the card down — this file has no
 * way to close itself, which is the point.
 */
export function mountEventCard(root, { event, onChoose } = {}) {
  injectStyles();
  root.replaceChildren();
  if (!event) return { element: null };

  const scrim = document.createElement('div');
  scrim.className = 'event-scrim';

  const card = document.createElement('div');
  card.className = 'event-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'A decision');

  const head = document.createElement('div');
  head.className = 'event-head';

  const kicker = document.createElement('p');
  kicker.className = 'event-kicker';
  // The investors borrow this card for their own moments, and some of
  // those are announcements rather than decisions. "Your call" over a
  // card with one button reading "Understood" would be the interface
  // claiming a choice the player does not have.
  kicker.textContent = event.kicker ?? 'Your call';

  const speaker = document.createElement('p');
  speaker.className = 'event-speaker';
  speaker.textContent = event.speaker;

  const prompt = document.createElement('p');
  prompt.className = 'event-prompt';
  prompt.textContent = event.prompt;

  head.append(kicker, speaker, prompt);

  const list = document.createElement('div');
  list.className = 'event-choices';

  let answered = false;
  event.choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'event-choice';

    const stance = STANCES[choice.stance];
    if (stance) {
      const tag = document.createElement('span');
      tag.className = 'event-stance';
      tag.style.color = STANCE_COLOR[choice.stance] ?? PALETTE.UI_LIGHT;
      tag.textContent = stance.label;
      const gloss = document.createElement('span');
      gloss.className = 'event-stance-gloss';
      gloss.textContent = ` — ${stance.gloss}`;
      tag.appendChild(gloss);
      button.appendChild(tag);
    }

    const label = document.createElement('span');
    label.className = 'event-label';
    label.textContent = choice.label;

    const cost = document.createElement('span');
    cost.className = 'event-cost';
    cost.textContent = choice.cost;

    button.append(label, cost);
    if (choice.disabled) button.disabled = true;
    button.addEventListener('click', () => {
      if (answered || choice.disabled) return;
      answered = true;
      onChoose?.(index);
    });
    list.appendChild(button);
  });

  card.append(head, list);
  scrim.appendChild(card);
  root.appendChild(scrim);
  return { element: scrim };
}
