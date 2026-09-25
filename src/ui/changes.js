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
export const BUILD = '2026-09-24i';

/**
 * Newest first. Written for somebody who was mid-game, so each entry says
 * what will look different rather than what was implemented.
 */
export const CHANGES = [
  {
    version: '2026-09-24i',
    notes: [
      'Four hotel buildings do real work now instead of only making people likelier to turn up. The caddie programme speeds your rounds up — measured, 166 minutes down to 138, because a shorter hole compounds all the way down the tee sheet.',
      'A spa and a fine dining room make a room worth more, so guests will pay a higher nightly rate without leaving. The rate slider used to have nothing supporting it: the only way to charge more was to charge more, and people simply stopped coming.',
      'The function room and conference suite take money now — weddings, societies and corporate days — and cost more to put up because of it.',
      'The indoor range was losing $218 a day and could never pay back its build. It earned ONLY when the weather was bad, which is backwards: a range takes money every day and takes more when nobody can play. It does that now, and it is cheaper.',
    ],
  },
  {
    version: '2026-09-24h',
    notes: [
      'The cocktail bar has eight seats on the board and thirteen drinks: a Water Hazard, a John Daly, an Azalea, an old fashioned, a screwdriver, a negroni, a manhattan, a whiskey sour, a martini, an espresso martini, a gin and tonic, a margarita, and the Transfusion.',
      'Ten of those are the bar’s alone. The Water Hazard, the John Daly and the Transfusion are not — they are golf drinks before they are cocktails, so a halfway house can pour them and the cart can carry them.',
      'The brew pub has eight taps now rather than four, and you can still put food on them if you want to.',
    ],
  },
  {
    version: '2026-09-24g',
    notes: [
      'The hotel’s fine dining room, brew pub and cocktail bar sell food and drink now, with their own boards. The dining room opens with wine, oysters, lobster, steak frites and an espresso — and like every other kitchen in the resort, that board needs cooks behind it.',
      'The brew pub has eight taps and pours twelve beer styles, nine of which are poured nowhere else: a pilsner, a cask bitter, a dry stout, a hazy IPA, a sour, a wheat beer, a brown ale, a porter and a tasting flight. None of them travels on the beverage cart, because none of them would.',
    ],
  },
  {
    version: '2026-09-24f',
    notes: [
      'Two choices said they would cost you money when they cost you nothing. Turning down the developer read as paying him $48,000, and refusing the society block read as paying out $780 a day — both are money you decline rather than money you hand over, and they now say so.',
      'Selling the developer the land now makes clear he pays YOU, and going in on his campaign makes clear you are the one putting money in.',
      'When the residents turn up afterwards, they now say what they are actually complaining about.',
      'And a few lines were printing raw escape codes instead of apostrophes and dashes.',
    ],
  },
  {
    version: '2026-09-24e',
    notes: [
      'When the vandals come back and Gus decides he has had enough, the cheap option no longer offers to "leave the gate open" — there is no gate in that story, and it read as nonsense. It now says what it actually is: nobody patrols.',
    ],
  },
  {
    version: '2026-09-24d',
    notes: [
      'The investors no longer ask you to hit a target about a hotel you have not built. On the day they arrive you have no rooms and no nightly rate, which was producing "revenue per room of at least $0" — a target you meet by having no hotel at all. They now ask about your reputation or your guests until there are actually beds to judge.',
    ],
  },
  {
    version: '2026-09-24c',
    notes: [
      'The out-of-date warning now tells you how to actually clear it on a phone, in an order that does not cost you your game. Closing the tab does not do it, whatever the old wording said.',
    ],
  },
  {
    version: '2026-09-24b',
    notes: [
      'The start screen now has a "Saving" card that reads your stored game back and tells you what is actually in it — which day and how big. If what is stored is older than what you played, it says so. If saves have been going missing, that card is what will show it.',
      'If a save is ever refused, the game now says so on screen straight away instead of carrying on looking perfectly healthy while nothing is being written down.',
      'The out-of-date warning finally gives advice that works on a phone. It used to suggest a keyboard shortcut.',
    ],
  },
  {
    version: '2026-09-24a',
    notes: [
      'Saves were getting lost, and if yours jumped back a long way that is why. The game kept every day you had ever played inside the save file, so it grew about 2.5 KB a day — past 300 KB by day 120. Once it got too big for the browser to write, the game carried on as normal on screen while nothing further was being stored, so closing the tab took you back to whenever the last write succeeded. It only keeps the last fortnight now, and a save that is already too big will shrink itself the first time you open it.',
      'The game also now saves the moment you do something, rather than only when you finish a day. Building a hole, hiring, changing a price or paying the investors off used to sit in memory until the next evening, which on a phone meant losing it if you switched apps.',
    ],
  },
  {
    version: '2026-09-23k',
    notes: [
      'How many people want to play here no longer depends on how many tee times you print. Your reputation decides how many want to come; your tee sheet only decides how many of them get on. A quiet, unhurried course was being punished twice before — once for selling fewer rounds and again for being less wanted because it sold fewer rounds — and it is now the fastest way to reach Act II rather than a way to go broke.',
      'Holes cost $8,500 instead of $12,000, so building the course out is no longer most of the act.',
      'There is more than one right answer again. A pleasant expensive course, a busy cheap one and a middle road all work, on different timescales. Going too cheap or too expensive still does not.',
    ],
  },
  {
    version: '2026-09-23j',
    notes: [
      'Yesterday’s changes made Act I unwinnable and I am sorry. The greens collapsed to nothing on every course, which took satisfaction, then reputation, then the bank with them. If your resort has been dying for no reason you could see, that was why, and it is fixed.',
      'Worn ground can no longer be worn out further, so your greens now settle at a level that depends on how many groundskeepers you employ rather than collapsing to bare dirt. Roughly: one keeper holds a busy nine at 45, two at 80, three at 95.',
      'Reputation climbs at the speed it used to again. It still falls faster than it climbs — that part was meant.',
      'A pleasant, expensive course is still much harder to run than a busy cheap one, and that is not yet where it should be. It is the next thing being worked on.',
    ],
  },
  {
    version: '2026-09-23i',
    notes: [
      'Taking the cheap way out of a problem now carries a risk rather than a certainty. Patch the drainage instead of digging it out, wait a week for the standard mower part, buy the cheap batch of seed, pay the neighbour off instead of netting the boundary — most of the time you get away with it, and sometimes you do not.',
      'Fourteen choices across the game now carry that risk, between a third and two thirds each, and nine of them have a proper reckoning waiting on the other side. When one lands it is always more expensive than doing it right would have been, and it always still gives you a way to handle it well.',
      'Over ninety days a player who takes every cheap option meets about four of these gambles and loses roughly one and a half of them.',
    ],
  },
  {
    version: '2026-09-23h',
    notes: [
      'Decisions remember. Some of what you agree to now will come back in two or three weeks with a second decision attached, and taking the cheap way out of the first one is usually what brings the second.',
      'Five of these exist so far. The drainage you patched rather than fixed, the security guard you left to it, the land you sold along the 4th, and the snorkelling programme you were so pleased about.',
      'None of them is unanswerable. There is always a way to handle it well, and it always costs more than doing it right the first time would have.',
    ],
  },
  {
    version: '2026-09-23g',
    notes: [
      'Four more people want something from you. One of them would like to start a snorkelling programme, and he has thought about it more than you have. They are real decisions with real costs, so read them properly before you pick.',
    ],
  },
  {
    version: '2026-09-23f',
    notes: [
      'Nearly twice as many decisions to make — fifteen new ones — and they now arrive about every four days instead of every seven.',
      'Some of what happens to you is still happening next week. A drainage failure you patched instead of fixing, a bad write-up you did not answer, a neighbour you decided to let sue you: these run for days or weeks, and the evening report lists what is still wrong and how long is left on it.',
      'They are deliberately different problems. A bill wants cash, a blight wants groundskeepers and time, bad press just has to be outlasted, and a shut hole changes what your course even is while it lasts. There is no one habit that answers all of them.',
      'Taking the free option every time is a real strategy and it will bury you. Across ninety days it leaves something wrong about 70% of the time; paying properly when it matters runs at about 45%.',
    ],
  },
  {
    version: '2026-09-23e',
    notes: [
      'Act I is meant to be properly hard now, and if you are mid-game it will feel different from this morning. Nothing is broken — the rules underneath changed.',
      'Your course sits in a town. There are only so many golfers to be had, and your reputation decides how far away they will come from. Printing more tee times no longer conjures more people, so the question is now whether your tee sheet matches the crowd you can actually draw.',
      'Golf wears out a golf course. A busy day now does real damage to the turf, so a crowd you cannot afford to maintain will ruin the greens they came for. Two groundskeepers on a busy nine will lose you money; four will not.',
      'Reputation falls faster than it climbs, a bit more than twice as fast. A bad week costs more than a good week earns.',
      'The bar for reaching Act II has moved up, and deliberately sits above what the most profitable way to play will give you. Clearing it means choosing to leave money on the table — charge a bit less, space the tee times a bit wider — which is the decision the act is supposed to be about. Playing purely for profit will now stall short of it.',
    ],
  },
  {
    version: '2026-09-23d',
    notes: [
      'You can build the back nine. Reaching Act II now shows a "Back 9" button that takes you to nine more plots. It was supposed to work all along and never has: the button only appeared once you had built a hole back there, and the only way to build one was through the button.',
    ],
  },
  {
    version: '2026-09-23c',
    notes: [
      'The investors now turn up, deliver their verdict and call their money in on a proper card, rather than in small grey lines on the evening report. Their fortnightly review is a moment now, which is what it should have been all along.',
      'When they offer to sell you their stake, or want their money back, you can settle it straight from that card as well as from the Hotel screen.',
      'And the evening they arrive, the report now actually describes them. It used to be the one evening it said nothing, so their first target went unannounced until the following day.',
    ],
  },
  {
    version: '2026-09-23b',
    notes: [
      'The investors’ target is now the loudest thing on the evening report, with a gauge showing where you actually stand against it and how long is left. It used to state the demand and never say whether you were near it.',
      'The tee-time screen now tells you how long your slowest hole takes, rather than only whether it will back up. Marshals were always shortening it and the sentence never changed — on the opening course they take it from 18.2 minutes to 16.0 and you could not see any of that.',
    ],
  },
  {
    version: '2026-09-23a',
    notes: [
      'Act II has an ending now. When the investors offer to sell you their stake, or demand their money back, there is a button on the Hotel screen to actually settle it — there was not one before, so the demand simply stood there forever.',
      'And the deadline is real. Let a demand run out and they will sell rooms to get their money back. An offer that runs out only lapses: a hotel good enough to be offered a buyout will not be broken up for failing to have the cash that fortnight, and the offer comes round again if you keep the reviews good.',
    ],
  },
  {
    version: '2026-09-21e',
    notes: [
      'The day recap now shows what the hotel took and what it cost to run. It was counting both into the totals and showing neither, so there was no way to tell whether your nightly rate was covering the beds.',
      'The recap no longer lists Act I’s goals once you are past them. The investors’ standing target is the thing you are playing to now.',
      'This note used to show only the newest update, so if you missed one you never saw it. It now shows everything since you last played, and the start screen has a "What Has Changed" card you can read back at any time.',
    ],
  },
  {
    version: '2026-09-21d',
    notes: [
      'The hotel has buildings now: a pool, a spa, a brew pub, a short course, an indoor range and nine more. Each one shows who it is for, and three of them do something beyond drawing a crowd — the range earns on a day the course is shut, the short course takes beginners off your first tee, and the kids’ club and spa make people stay longer.',
      'The hotel’s nightly bill now includes those buildings. It was only counting the rooms, so it read lower than what you were actually being charged.',
      'Save codes work. Every code copied from a game anyone had played was broken, and the game gave no sign of it until the code failed to load. Codes copied before today will not load; copy a fresh one.',
    ],
  },
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
    .changes-stamp {
      color: ${PALETTE.ACCENT};
      font-family: monospace;
      font-size: 11px;
      margin: 14px 0 6px;
      border-bottom: 1px solid ${PALETTE.UI_DARK};
      padding-bottom: 4px;
    }
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

/**
 * The entries a player has not read yet, newest first.
 *
 * `mountChanges` used to show `CHANGES[0]` and nothing else, under a
 * heading reading "Since you last played". It stored which version had
 * been seen and then did not use it, so anybody who missed a release
 * never saw those notes at all — the heading claimed a span the data did
 * not support, which is the same disagreement this project keeps
 * producing in other places.
 *
 * Position is used rather than comparing version strings: `CHANGES` is
 * newest first, so everything above the last-seen entry is new. A stored
 * version that no longer appears in the list (an old format, a hand-edit,
 * a cleared entry) is treated as having seen nothing, which shows too
 * much rather than too little.
 *
 * `list` is a parameter only so this can be tested against more releases
 * than the game has shipped. With two entries in `CHANGES`, "everything
 * since" and "only the newest" are the same list, and a test written
 * against the real one passes whether this is fixed or not.
 */
export function unseenChanges(seen = lastSeen(), list = CHANGES) {
  if (!seen) return list.slice();
  const index = list.findIndex((entry) => entry.version === seen);
  return index === -1 ? list.slice() : list.slice(0, index);
}

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
/**
 * How to force a reload, on the device actually reading it.
 *
 * This said "Ctrl+Shift+R on Windows, or Cmd+Shift+R on a Mac" and
 * nothing else, which is no help at all on a phone — where module
 * caching bites hardest and where this game is mostly played. A player
 * asked how to force a refresh on a phone and there was no answer in the
 * game or out of it.
 *
 * Touch is detected rather than the user agent, because what matters here
 * is whether the reader has a keyboard to press the shortcut on.
 */
function reloadAdvice() {
  let touch = false;
  try {
    touch = window.matchMedia?.('(pointer: coarse)').matches
      || (navigator.maxTouchPoints ?? 0) > 0;
  } catch { /* assume desktop */ }

  return touch
    ? 'Closing the tab will not fix this — a phone keeps the old files anyway. '
      + 'The only reliable way, in this order: (1) tap Carry on anyway, then '
      + 'Copy Save Code on the start screen and paste it somewhere safe. '
      + '(2) On iPhone: Settings, Safari, Advanced, Website Data, find this '
      + 'site and swipe to delete it. On Android: the padlock by the address, '
      + 'then site settings, then clear. (3) Open the game again and paste '
      + 'your code into Load From a Save Code. Step 2 deletes your saved '
      + 'game, which is why step 1 comes first.'
    : 'To fix it, reload the page properly: Ctrl+Shift+R on Windows, or '
      + 'Cmd+Shift+R on a Mac.';
}

export function mountChanges(root, { serverBuild, onDismiss } = {}) {
  injectStyles();
  root.replaceChildren();

  const stale = serverBuild && serverBuild !== BUILD;
  const unseen = unseenChanges();
  if (!stale && unseen.length === 0) return false;

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
      + 'like an older version.';

    const how = document.createElement('p');
    how.className = 'changes-item changes-stale';
    how.textContent = reloadAdvice();

    const warn = document.createElement('p');
    warn.className = 'changes-item';
    warn.textContent =
      'Your saved game lives in that website data, so take the save code '
      + 'first and you lose nothing. Without it, you lose the game.';

    card.append(kicker, title, item, how, warn);
  } else {
    kicker.textContent = 'Since you last played';
    title.textContent = unseen.length > 1
      ? `A few things have changed, across ${unseen.length} updates.`
      : 'A few things have changed.';
    card.append(kicker, title);
    // Oldest first inside the card, so it reads forwards even though
    // CHANGES is stored newest first.
    for (const entry of unseen.slice().reverse()) {
      if (unseen.length > 1) {
        const stamp = document.createElement('p');
        stamp.className = 'changes-stamp';
        stamp.textContent = entry.version;
        card.appendChild(stamp);
      }
      for (const note of entry.notes) {
        const item = document.createElement('p');
        item.className = 'changes-item';
        item.textContent = note;
        card.appendChild(item);
      }
    }
  }

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'changes-go';
  go.textContent = stale ? 'Carry on anyway' : 'Got it';
  go.addEventListener('click', () => {
    if (!stale) rememberSeen(CHANGES[0]?.version);
    root.replaceChildren();
    onDismiss?.();
  });
  card.appendChild(go);

  wrap.appendChild(card);
  root.appendChild(wrap);
  return true;
}

/**
 * The whole history, as a sheet, for reading back at any time.
 *
 * The pop-up is a one-shot: it appears once per player per release and
 * then is gone for good. That is right for something that interrupts you
 * on the way into a game, and wrong as the only copy of what changed —
 * miss it, dismiss it early, play on another device, and there is no way
 * back to it. So the start screen keeps a door to the same notes, and
 * this reads every entry rather than only the unseen ones.
 */
export function openChangeLog(sheets) {
  injectStyles();
  sheets.open({
    id: 'changelog',
    title: 'What has changed',
    render(body) {
      if (CHANGES.length === 0) {
        const none = document.createElement('p');
        none.className = 'changes-item';
        none.textContent = 'Nothing yet.';
        body.appendChild(none);
        return;
      }
      // Newest first here, unlike the pop-up: somebody opening this on
      // purpose is looking for what just changed, not reading a history
      // forwards from the beginning.
      for (const entry of CHANGES) {
        const stamp = document.createElement('p');
        stamp.className = 'changes-stamp';
        stamp.textContent = entry.version === CHANGES[0].version
          ? `${entry.version} — current`
          : entry.version;
        body.appendChild(stamp);
        for (const note of entry.notes) {
          const item = document.createElement('p');
          item.className = 'changes-item';
          item.textContent = note;
          body.appendChild(item);
        }
      }
    },
  });
}
