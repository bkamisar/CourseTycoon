/**
 * One coat of finish over every piece of DOM chrome in the game.
 *
 * Each screen styles its own bars, buttons and cards, in the 8-bit look
 * the game started with: monospace, flat dark slabs, hard borders. Since
 * the course itself is drawn at full resolution (build 2026-11-16e) that
 * chrome sat beside it like a different game. Rather than rewrite fifteen
 * stylesheets, this lays one theme over all of them:
 *
 *   - one typeface, the phone's own, with numbers that line up;
 *   - bars that are glass — dark, translucent, blurred — with a hairline
 *     of light along their edge;
 *   - buttons with a little light on top and a little weight underneath,
 *     that press in when tapped;
 *   - cards and sheets that float, with a shadow;
 *   - a swing meter that reads as one instrument.
 *
 * Every rule is prefixed with `body` so it outranks the component's own
 * rule of the same class however late that one is injected (several are
 * injected on mount). Layout is never touched — no sizes, paddings or
 * positions — because the canvas insets are measured off these bars and
 * the layouts were tuned on real phones. Colours come from the palette.
 */
import { PALETTE, withAlpha, mix } from '../render/palette.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const BARS = [
  '.hud-bar', '.amenity-bar', '.ov-toolbar', '.play-header', '.play-dock', '.editor-dock',
];
const CARDS = [
  '.sheet-panel', '.event-card', '.narration-card', '.changes-card',
];
const ROWS = [
  '.panel-row', '.hotel-row', '.mb-row', '.glossary-entry', '.template-card', '.amenity-chip',
  '.report-breakdown', '.report-champ', '.report-crowd-card', '.report-gate', '.report-pace', '.report-rating',
];

const all = (selectors, suffix = '') => selectors.map((s) => `body ${s}${suffix}`).join(',\n    ');

export function injectTheme() {
  const style = document.createElement('style');
  style.dataset.theme = 'course-tycoon';
  style.textContent = `
    body, body *:not(canvas) {
      font-family: ${FONT} !important;
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
    }

    ${all(BARS)} {
      background-color: ${withAlpha('UI_DARK', 0.82)};
      background-image: linear-gradient(${withAlpha('WHITE', 0.07)}, ${withAlpha('OUTLINE', 0.18)});
      -webkit-backdrop-filter: blur(10px) saturate(1.3);
      backdrop-filter: blur(10px) saturate(1.3);
      border-color: ${withAlpha('WHITE', 0.08)};
    }
    body .hud-bar, body .amenity-bar, body .play-header {
      box-shadow: 0 1px 0 ${withAlpha('WHITE', 0.06)}, 0 6px 16px ${withAlpha('OUTLINE', 0.35)};
    }
    body .ov-toolbar, body .play-dock, body .editor-dock {
      box-shadow: inset 0 1px 0 ${withAlpha('WHITE', 0.1)}, 0 -6px 16px ${withAlpha('OUTLINE', 0.35)};
    }
    /* The HUD and the amenity strip stack in one wrapper: one shadow, under the pair. */
    body .hud-bar { box-shadow: none; }

    /* A bare element selector loses to every button's own class rule,
       whose background shorthand would wipe the gradient: hence !important,
       on the finish only — never on a colour or a size. */
    body button {
      border-color: ${withAlpha('OUTLINE', 0.45)} !important;
      background-image: linear-gradient(${withAlpha('WHITE', 0.2)}, ${withAlpha('WHITE', 0)} 55%, ${withAlpha('OUTLINE', 0.14)}) !important;
      box-shadow: inset 0 1px 0 ${withAlpha('WHITE', 0.22)}, 0 2px 0 ${withAlpha('OUTLINE', 0.4)}, 0 3px 8px ${withAlpha('OUTLINE', 0.25)} !important;
      font-weight: 600;
      letter-spacing: 0.01em;
      transition: transform 70ms ease-out, filter 70ms ease-out, box-shadow 70ms ease-out;
      -webkit-tap-highlight-color: transparent;
    }
    body button:active {
      transform: translateY(1px);
      filter: brightness(0.9);
      box-shadow: inset 0 1px 0 ${withAlpha('WHITE', 0.12)}, 0 1px 0 ${withAlpha('OUTLINE', 0.4)} !important;
    }
    body button:disabled {
      filter: saturate(0.4) brightness(0.8);
      box-shadow: none !important;
    }

    ${all(CARDS)} {
      background-image: linear-gradient(${withAlpha('WHITE', 0.06)}, ${withAlpha('WHITE', 0)} 40%);
      box-shadow: 0 -2px 0 ${withAlpha('WHITE', 0.05)}, 0 14px 40px ${withAlpha('OUTLINE', 0.55)};
    }
    body .sheet-panel {
      border-top-color: ${withAlpha('WHITE', 0.18)};
      box-shadow: 0 -10px 40px ${withAlpha('OUTLINE', 0.55)};
    }
    body .sheet-backdrop--open, body .event-scrim {
      -webkit-backdrop-filter: blur(3px);
      backdrop-filter: blur(3px);
    }
    ${all(ROWS)} {
      box-shadow: inset 0 1px 0 ${withAlpha('WHITE', 0.06)}, 0 1px 3px ${withAlpha('OUTLINE', 0.3)};
    }

    /* The swing meter: a recessed track, soft zones, and a cursor that glows. */
    body .play-meter {
      border-radius: 999px;
      border-color: ${withAlpha('WHITE', 0.22)};
      background: linear-gradient(${mix('OUTLINE', 'UI_DARK', 0.3)}, ${mix('OUTLINE', 'UI_DARK', 0.8)});
      box-shadow: inset 0 2px 4px ${withAlpha('OUTLINE', 0.8)}, 0 1px 0 ${withAlpha('WHITE', 0.08)};
    }
    body .play-meter-miss {
      background: linear-gradient(90deg, ${withAlpha('SAND_SHADOW', 0.75)}, ${withAlpha('SAND_SHADOW', 0.15)});
      opacity: 1;
    }
    body .play-meter-over {
      background: linear-gradient(90deg, ${withAlpha('FLAG', 0.2)}, ${withAlpha('FLAG', 0.85)});
      opacity: 1;
    }
    body .play-meter-window {
      background: radial-gradient(ellipse at center, ${withAlpha('ACCENT', 0.55)}, ${withAlpha('ACCENT', 0.08)} 70%);
      opacity: 1;
    }
    body .play-meter-line {
      background: ${PALETTE.WHITE};
      box-shadow: 0 0 6px ${withAlpha('WHITE', 0.7)};
    }
    body .play-meter-mark {
      background: ${PALETTE.ACCENT};
      box-shadow: 0 0 6px ${withAlpha('ACCENT', 0.8)};
    }
    body .play-meter-power {
      background: ${PALETTE.FAIRWAY};
      box-shadow: 0 0 6px ${withAlpha('FAIRWAY', 0.8)};
    }
    body .play-meter-cursor {
      border-radius: 3px;
      background: linear-gradient(${PALETTE.WHITE}, ${PALETTE.UI_LIGHT});
      box-shadow: 0 0 0 1px ${withAlpha('OUTLINE', 0.8)}, 0 0 10px ${withAlpha('WHITE', 0.75)};
    }
    body .play-caddie { letter-spacing: 0.02em; }
  `;
  document.head.appendChild(style);
}
