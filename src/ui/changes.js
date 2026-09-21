/**
 * What changed since you last played.
 *
 * Two problems, one answer.
 *
 * The rules move under an existing game. A save from before today keeps
 * its day, its money and its buildings — but a cart barn bought at $110 a
 * day now costs $520, satisfaction counts turf and amenities where it
 * barely did, and the green fee that was optimal is not any more. Nothing
 * breaks; the bank simply starts draining faster than the player expects
 * and nothing says why. "My resort suddenly stopped making money" is a
 * bug report about a balance change nobody was told about.
 *
 * And a browser holds onto the old files. GitHub Pages sends
 * `Cache-Control: max-age=600` and this game loads a dozen separate ES
 * modules, each cached independently — so a plain reload can serve a
 * *mix* of old and new, which is worse than either. That is how one
 * player saw four decision events in a hundred days when the cadence is
 * fifteen: they had the new page and an old `day.js`.
 *
 * So: the build stamps a version, `version.json` is fetched with
 * `cache: 'no-store'` so it can never be the stale copy, and a mismatch
 * means the modules are stale and says so. A match means the player is
 * current, and then the only question is whether they have seen the notes
 * for the version they are on.
 */
import { PALETTE } from '../render/palette.js';

/**
 * The version this bundle was built as. Must match `version.json` at the
 * site root; the check below exists precisely because it sometimes will
 * not.
 */
export const BUILD = '2026-09-21c';

/**
 * Newest first. Written for somebody who was mid-game, so each entry says
 * what will look different rather than what was implemented.
 */
export const CHANGES = [
  {
    version: '2026-09-21c',
    notes: [
      'Shop hands can be hired. The pro shop has been asking for one and there was no way to oblige — sorry.',
      'Everything you build costs more, especially to run. A cart barn is $520 a day now, not $110. If your resort has just started losing money, that is why, and you can remove anything you no longer want for most of what it cost.',
      'Turf, scenery and what you have built now count for much more with your guests. A well-kept resort should see happier golfers than it did yesterday.',
      'A busy, miserable course is no longer the most profitable way to run the place.',
      'The gate to the next act tells you where you stand and what will move it.',
      'Menus at the snack shack, halfway house and restaurant, and a beverage cart with Dee on it.',
    ],
  },
];

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .changes-wrap {
      position: fixed;
      inset: 0;
      z-index: 55;
      background: rgba(10, 10, 14, 0.82);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(14px, env(safe-area-inset-top, 0px)) 14px
               max(14px, env(safe-area-inset-bottom, 0px));
      box-sizing: border-box;
      font-family: monospace;
    }
    .changes-card {
      width: 100%;
      max-width: 520px;
      max-height: 100%;
      overflow-y: auto;
      background: ${PALETTE.UI_DARK};
      border: 1px solid ${PALETTE.UI_LIGHT};
      border-top: 4px solid ${PALETTE.ACCENT};
      border-radius: 10px;
      padding: 14px;
      box-sizing: border-box;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
    }
    .changes-kicker {
      margin: 0 0 4px;
      color: ${PALETTE.ACCENT};
      font-size: 10px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .changes-title { margin: 0 0 10px; color: ${PALETTE.WHITE}; font-size: 15px; }
    .changes-item {
      color: ${PALETTE.UI_LIGHT};
      font-size: 13px;
      line-height: 1.6;
      margin: 0 0 8px;
      padding-left: 12px;
      border-left: 2px solid ${PALETTE.FAIRWAY};
    }
    .changes-stale { border-left-color: ${PALETTE.SAND}; color: ${PALETTE.SAND}; }
    .changes-go {
      width: 100%;
      min-height: 44px;
      margin-top: 6px;
      background: ${PALETTE.FAIRWAY};
      color: ${PALETTE.OUTLINE};
      border: none;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

const SEEN_KEY = 'courseTycoon.changesSeen';

/** Browser storage is per-viewer and can throw, so every access is
 * guarded and a failure just means the note shows again. */
function lastSeen() {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}
function rememberSeen(version) {
  try { localStorage.setItem(SEEN_KEY, version); } catch { /* fine */ }
}

/**
 * Asks the server what the current version is, without letting the cache
 * answer. A missing or unreachable `version.json` means "no idea", which
 * is treated as "assume current" — a changelog is not worth breaking a
 * game over.
 */
export async function liveVersion() {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.build === 'string' ? body.build : null;
  } catch {
    return null;
  }
}

/**
 * Shows the note if there is one to show. Returns true if it took over
 * the screen, so the caller knows to wait.
 *
 * Two cases. If the server's version does not match the one baked into
 * this bundle, the player is running stale files — possibly a mix of old
 * and new — and the only useful advice is to reload properly. If they
 * match, show the notes for this version once.
 */
export function mountChanges(root, { serverBuild, onDismiss } = {}) {
  injectStyles();
  root.replaceChildren();

  const stale = serverBuild && serverBuild !== BUILD;
  const entry = CHANGES[0];
  if (!stale && (!entry || lastSeen() === entry.version)) return false;

  const wrap = document.createElement('div');
  wrap.className = 'changes-wrap';
  const card = document.createElement('div');
  card.className = 'changes-card';

  const kicker = document.createElement('p');
  kicker.className = 'changes-kicker';
  const title = document.createElement('p');
  title.className = 'changes-title';

  if (stale) {
    kicker.textContent = 'Out of date';
    title.textContent = 'There is a newer version of the course.';
    const item = document.createElement('p');
    item.className = 'changes-item changes-stale';
    item.textContent =
      'Your browser is holding onto old files, and may be mixing them with new '
      + 'ones — which can make the game behave oddly rather than simply behave '
      + 'like an older version. Reload the page properly to fix it: '
      + 'Ctrl+Shift+R on Windows, or Cmd+Shift+R on a Mac.';
    card.append(kicker, title, item);
  } else {
    kicker.textContent = 'Since you last played';
    title.textContent = 'A few things have changed.';
    card.append(kicker, title);
    for (const note of entry.notes) {
      const item = document.createElement('p');
      item.className = 'changes-item';
      item.textContent = note;
      card.appendChild(item);
    }
  }

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'changes-go';
  go.textContent = stale ? 'Carry on anyway' : 'Got it';
  go.addEventListener('click', () => {
    if (!stale) rememberSeen(entry.version);
    root.replaceChildren();
    onDismiss?.();
  });
  card.appendChild(go);

  wrap.appendChild(card);
  root.appendChild(wrap);
  return true;
}
