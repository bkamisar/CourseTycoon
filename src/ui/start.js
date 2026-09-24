/**
 * The start screen: shown before anything else on boot. It is the only
 * place a player can deliberately abandon a save, wipe it for a new game,
 * or pull a different one in from a save code instead of whatever is
 * already on this device.
 *
 * `computeStartScreenData`, `startNewGame`, `loadSaveCode` and
 * `applySaveCode` are the pure half — no DOM at all, so the guards worth
 * trusting (Continue appears only when a save exists; a bad code is
 * rejected without ever touching whatever save is already stored) are
 * testable head-on rather than by driving a browser.
 *
 * `mountStartScreen` is the DOM half, exercised by hand in the browser —
 * the same split `src/ui/report.js` and `src/ui/hud.js` already use.
 */
import { PALETTE } from '../render/palette.js';
import { openChangeLog, BUILD } from './changes.js';
import { newGame, openHoles } from '../sim/state.js';
import { decode } from '../save/code.js';

// --- Pure ------------------------------------------------------------

/**
 * What the Continue option should show, or that there is nothing to
 * continue at all. `hasSave` is the single source of truth for whether
 * Continue is offered — nothing else decides that.
 */
export function computeStartScreenData(save) {
  if (!save) return { hasSave: false };
  return {
    hasSave: true,
    day: save.day,
    money: save.money,
    holesOpen: openHoles(save).length,
    resortName: save.resort.courses[0].name,
  };
}

/** A fresh day-one game. Wiping any old save is the caller's job — this
 * only ever produces a new state, it never touches storage. */
export function startNewGame(seed) {
  return newGame(seed);
}

/**
 * Attempts to decode a pasted save code. Never throws: a malformed or
 * wrong-version code comes back as `{ ok: false, error }` with a plain
 * message a caller can show directly, rather than letting `decode`'s throw
 * crash the screen.
 */
export function loadSaveCode(text) {
  try {
    return { ok: true, state: decode(text) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * The guard behind "Load from a save code": only a code that decodes
 * cleanly is ever handed to `adapter.save`. A bad paste returns
 * `{ ok: false, error }` without writing anything at all, so whatever save
 * was already on this device survives a corrupt paste completely
 * untouched — a bad clipboard paste must never cost a good save.
 */
export function applySaveCode(text, adapter) {
  const result = loadSaveCode(text);
  if (result.ok) adapter.save(result.state);
  return result;
}

// --- DOM ---------------------------------------------------------------

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .start-screen {
      position: fixed;
      inset: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      background: ${PALETTE.OUTLINE};
      color: ${PALETTE.WHITE};
      font-family: monospace;
      box-sizing: border-box;
      padding: 18px 18px 40px;
      z-index: 25;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .start-title {
      font-size: 24px;
      font-weight: bold;
      color: ${PALETTE.ACCENT};
      margin: 12px 0 0;
      text-align: center;
    }
    .start-subtitle {
      font-size: 12px;
      color: ${PALETTE.UI_LIGHT};
      text-align: center;
      margin: 0 0 8px;
    }
    .start-card {
      background: ${PALETTE.UI_DARK};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 8px;
      padding: 14px;
    }
    .start-card-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: ${PALETTE.UI_LIGHT};
      margin: 0 0 8px;
    }
    .start-continue-summary {
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 12px;
    }
    .start-continue-summary strong { color: ${PALETTE.ACCENT}; }
    .start-btn {
      display: block;
      width: 100%;
      box-sizing: border-box;
      min-height: 48px;
      padding: 8px 12px;
      background: ${PALETTE.PATH};
      color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.OUTLINE};
      border-radius: 8px;
      font-family: monospace;
      font-weight: bold;
      font-size: 15px;
    }
    .start-btn--primary {
      background: ${PALETTE.FAIRWAY};
      color: ${PALETTE.OUTLINE};
    }
    .start-btn--danger {
      background: ${PALETTE.SAND};
      color: ${PALETTE.OUTLINE};
    }
    .start-btn + .start-btn { margin-top: 10px; }
    .start-code-input {
      width: 100%;
      box-sizing: border-box;
      min-height: 64px;
      padding: 8px;
      margin-bottom: 10px;
      background: ${PALETTE.OUTLINE};
      color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      resize: vertical;
    }
    .start-error {
      color: ${PALETTE.SAND};
      font-size: 12px;
      margin: 8px 0 0;
      line-height: 1.5;
    }
    .start-feedback {
      color: ${PALETTE.FAIRWAY};
      font-size: 12px;
      margin: 8px 0 0;
    }
    .start-hint {
      font-size: 11px;
      color: ${PALETTE.UI_LIGHT};
      margin: 0 0 10px;
      line-height: 1.5;
    }
    .start-confirm-body {
      font-size: 14px;
      line-height: 1.6;
      color: ${PALETTE.WHITE};
    }
    .start-confirm-body strong { color: ${PALETTE.ACCENT}; }
  `;
  document.head.appendChild(style);
}

function money(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function button(label, { primary = false, danger = false } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = primary ? 'start-btn start-btn--primary' : danger ? 'start-btn start-btn--danger' : 'start-btn';
  btn.textContent = label;
  return btn;
}

/**
 * Opens the "start over" confirmation as a sheet on `sheets` (the same
 * `mountSheetHost` instance the rest of the game uses for its bottom
 * sheets). Naming the day, the resort and what is lost rather than asking
 * a bare "are you sure?" is deliberate — this is destructive and
 * irreversible, and the one thing worth losing sleep over here is someone
 * tapping it by accident on a phone and losing a week of play.
 */
function confirmNewGame(sheets, data, onConfirm) {
  sheets.open({
    id: 'start-confirm-new-game',
    title: 'Start Over?',
    render(body, { close }) {
      const text = document.createElement('p');
      text.className = 'start-confirm-body';
      const dayStrong = document.createElement('strong');
      dayStrong.textContent = `Day ${data.day} at ${data.resortName}`;
      text.append(
        'This deletes ',
        dayStrong,
        ` — ${money(data.money)} and ${data.holesOpen} hole${data.holesOpen === 1 ? '' : 's'} open — for good. This can't be undone.`
      );
      body.appendChild(text);

      const spacer = document.createElement('div');
      spacer.style.height = '16px';
      body.appendChild(spacer);

      const confirmBtn = button('Delete and Start Over', { danger: true });
      confirmBtn.addEventListener('click', () => {
        close();
        onConfirm();
      });
      const cancelBtn = button('Cancel');
      cancelBtn.style.marginTop = '10px';
      cancelBtn.addEventListener('click', () => close());

      body.append(confirmBtn, cancelBtn);
    },
  });
}

/**
 * Mounts the start screen into `root`. `save` is the existing save state
 * (or `null`/`undefined` if there isn't one) and `saveCode` is that save
 * already encoded as a copyable string (or `null`) — both precomputed by
 * the caller, which is the one place that knows how the save was loaded.
 *
 * `onContinue()` fires when Continue is tapped. `onNewGame()` fires only
 * once a destructive new game is actually confirmed (immediately, with no
 * confirmation, when there is no existing save to lose). `onLoadCode(text)`
 * is called with the raw pasted text and must return `{ ok, error }`
 * synchronously (see `applySaveCode` above) — a failure is shown inline
 * and the field is left as the player typed it; a success is left for the
 * caller to act on (this screen does not decide what happens next).
 */
/**
 * What storage actually contains, in words.
 *
 * Deliberately reads back rather than trusting the last write to have
 * worked: a save that was refused leaves the previous one in place, and
 * the game cannot tell the difference without looking.
 */
function saveHealth() {
  let raw = null;
  let stamp = null;
  try {
    raw = localStorage.getItem('course-tycoon-save');
    const s = localStorage.getItem('courseTycoon.lastWrite');
    stamp = s ? JSON.parse(s) : null;
  } catch {
    return 'This browser will not let the game use storage at all, so nothing '
      + 'can be saved here. Copy a save code before you close the tab.';
  }

  if (!raw) return 'Nothing is stored yet. A new game will be saved as you play it.';

  const kb = Math.round(raw.length / 1024);
  let day = null;
  try { day = JSON.parse(raw).day; } catch { /* reported below */ }
  if (day === null || day === undefined) {
    return `There is something in storage (${kb} KB) but it cannot be read back. `
      + 'That is a bug worth reporting.';
  }

  const parts = [`Stored game: day ${day}, ${kb} KB.`];
  if (stamp?.at) {
    const mins = Math.round((Date.now() - stamp.at) / 60000);
    const when = mins < 1 ? 'less than a minute ago'
      : mins < 60 ? `${mins} minutes ago`
        : `${Math.round(mins / 60)} hours ago`;
    parts.push(`Last written ${when}, on day ${stamp.day}.`);
    if (stamp.day !== day) {
      parts.push('Those two days do not match, which means a write was refused '
        + 'and what is stored is older than what was played. Please report this.');
    }
  }
  return parts.join(' ');
}

export function mountStartScreen(root, { save, saveCode, sheets, topInset = 0, onContinue, onNewGame, onLoadCode } = {}) {
  injectStyles();
  const data = computeStartScreenData(save);

  root.replaceChildren();
  const screen = document.createElement('div');
  screen.className = 'start-screen';
  if (topInset > 0) screen.style.paddingTop = `${18 + topInset}px`;

  const title = document.createElement('p');
  title.className = 'start-title';
  title.textContent = 'Course Tycoon';
  const subtitle = document.createElement('p');
  subtitle.className = 'start-subtitle';
  subtitle.textContent = 'An 8-bit golf resort management game';
  screen.append(title, subtitle);

  // --- Continue --------------------------------------------------------
  if (data.hasSave) {
    const card = document.createElement('div');
    card.className = 'start-card';
    const cardTitle = document.createElement('p');
    cardTitle.className = 'start-card-title';
    cardTitle.textContent = 'Resume';
    const summary = document.createElement('p');
    summary.className = 'start-continue-summary';
    const dayStrong = document.createElement('strong');
    dayStrong.textContent = `Day ${data.day}`;
    summary.append(
      dayStrong,
      ` at ${data.resortName} — ${money(data.money)}, ${data.holesOpen} hole${data.holesOpen === 1 ? '' : 's'} open.`
    );
    const continueBtn = button('Continue', { primary: true });
    continueBtn.addEventListener('click', () => onContinue?.());
    card.append(cardTitle, summary, continueBtn);
    screen.appendChild(card);
  }

  // --- New game ----------------------------------------------------------
  const newGameCard = document.createElement('div');
  newGameCard.className = 'start-card';
  const newGameTitle = document.createElement('p');
  newGameTitle.className = 'start-card-title';
  newGameTitle.textContent = 'New Game';
  const newGameBtn = button(data.hasSave ? 'Start Over' : 'New Game', { primary: !data.hasSave });
  newGameBtn.addEventListener('click', () => {
    if (data.hasSave) {
      confirmNewGame(sheets, data, () => onNewGame?.());
    } else {
      onNewGame?.();
    }
  });
  newGameCard.append(newGameTitle, newGameBtn);
  screen.appendChild(newGameCard);

  // --- Is this game actually being saved? --------------------------------
  //
  // A player reported their game reverting by dozens of days on a phone,
  // on the current build, with nothing on screen ever suggesting anything
  // was wrong. Every screen in this game will happily show a healthy
  // resort that is not being written down anywhere, and there was no way
  // for the player OR for me to tell the difference from the outside.
  //
  // This reads the storage back and reports what is actually in it, which
  // is the one thing a bug report about lost saves needs and could not
  // previously include.
  const diag = document.createElement('div');
  diag.className = 'start-card';
  const diagTitle = document.createElement('p');
  diagTitle.className = 'start-card-title';
  diagTitle.textContent = 'Saving';
  const diagBody = document.createElement('p');
  diagBody.className = 'start-hint';
  diagBody.textContent = saveHealth();
  diag.append(diagTitle, diagBody);
  screen.appendChild(diag);

  // --- What has changed --------------------------------------------------
  //
  // The pop-up on the way in is a one-shot: seen once per release and
  // then gone. Miss it, dismiss it early, or play on another device and
  // there is no way back to it. This is that way back.
  const logCard = document.createElement('div');
  logCard.className = 'start-card';
  const logTitle = document.createElement('p');
  logTitle.className = 'start-card-title';
  logTitle.textContent = 'What Has Changed';
  const logHint = document.createElement('p');
  logHint.className = 'start-hint';
  logHint.textContent =
    `Every update, newest first, including any you missed. You are on ${BUILD}.`;
  const logBtn = button('Read the Changes');
  logBtn.addEventListener('click', () => openChangeLog(sheets));
  logCard.append(logTitle, logHint, logBtn);
  screen.appendChild(logCard);

  // --- Load from a save code ---------------------------------------------
  const loadCard = document.createElement('div');
  loadCard.className = 'start-card';
  const loadTitle = document.createElement('p');
  loadTitle.className = 'start-card-title';
  loadTitle.textContent = 'Load From a Save Code';
  const loadHint = document.createElement('p');
  loadHint.className = 'start-hint';
  loadHint.textContent = 'Paste a save code from another device to pick up exactly where it left off.';
  const codeInput = document.createElement('textarea');
  codeInput.className = 'start-code-input';
  codeInput.placeholder = 'CT1...';
  codeInput.setAttribute('spellcheck', 'false');
  const loadBtn = button('Load');
  const loadError = document.createElement('p');
  loadError.className = 'start-error';
  loadError.hidden = true;

  loadBtn.addEventListener('click', () => {
    const text = codeInput.value.trim();
    loadError.hidden = true;
    if (!text) {
      loadError.textContent = 'Paste a save code first.';
      loadError.hidden = false;
      return;
    }
    const result = onLoadCode?.(text);
    if (result && !result.ok) {
      loadError.textContent = `That code was not valid: ${result.error}`;
      loadError.hidden = false;
    }
  });

  loadCard.append(loadTitle, loadHint, codeInput, loadBtn, loadError);
  screen.appendChild(loadCard);

  // --- Copy the current save code -----------------------------------------
  if (saveCode) {
    const copyCard = document.createElement('div');
    copyCard.className = 'start-card';
    const copyTitle = document.createElement('p');
    copyTitle.className = 'start-card-title';
    copyTitle.textContent = 'Copy Save Code';
    const copyHint = document.createElement('p');
    copyHint.className = 'start-hint';
    copyHint.textContent = 'Move this game to another device by copying its save code.';
    const codeOutput = document.createElement('textarea');
    codeOutput.className = 'start-code-input';
    codeOutput.value = saveCode;
    codeOutput.readOnly = true;
    const copyBtn = button('Copy Save Code');
    const copyFeedback = document.createElement('p');
    copyFeedback.className = 'start-feedback';
    copyFeedback.hidden = true;

    copyBtn.addEventListener('click', async () => {
      copyFeedback.hidden = true;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(saveCode);
        copyFeedback.textContent = 'Copied to clipboard.';
        copyFeedback.hidden = false;
      } catch {
        codeOutput.focus();
        codeOutput.select();
        copyFeedback.textContent = 'Could not copy automatically — selected below, copy it manually.';
        copyFeedback.hidden = false;
      }
    });

    copyCard.append(copyTitle, copyHint, codeOutput, copyBtn, copyFeedback);
    screen.appendChild(copyCard);
  }

  root.appendChild(screen);
  return { element: screen, data };
}
