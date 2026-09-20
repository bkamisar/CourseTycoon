/**
 * Screen routing.
 *
 * `createScreenRouter` is pure — it holds no DOM reference and can be
 * exercised entirely from `node --test`. That separation is deliberate: the
 * logic worth guarding (an unknown screen must be rejected, not silently
 * swallowed) shouldn't need a browser to test.
 *
 * `mountScreens` is the thin DOM half: one container per screen, toggled by
 * the router. It is not unit tested — there is nothing to assert about it
 * that the routing tests do not already cover — but it is exercised by hand
 * in the browser (see the Task 5 report).
 */

export const SCREEN_NAMES = Object.freeze(['start', 'overview', 'editor', 'playback', 'report']);

function assertScreen(name) {
  if (!SCREEN_NAMES.includes(name)) {
    throw new Error(`unknown screen: "${name}" (expected one of ${SCREEN_NAMES.join(', ')})`);
  }
}

/**
 * Tracks which screen is active. Switching to an unknown name throws rather
 * than blanking the game — the active screen is left exactly as it was.
 */
export function createScreenRouter(initial = 'overview') {
  assertScreen(initial);
  let current = initial;
  const listeners = new Set();

  return {
    get current() {
      return current;
    },
    go(name) {
      assertScreen(name);
      if (name === current) return;
      current = name;
      for (const fn of listeners) fn(current);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * Creates one DOM container per screen inside `root`, shows only the one
 * matching `router.current`, and keeps that in sync as the router changes.
 * `renderers[name]`, if given, is called once with that screen's container
 * so a caller can mount its content lazily.
 */
export function mountScreens(root, router, renderers = {}) {
  const elements = {};
  for (const name of SCREEN_NAMES) {
    const el = document.createElement('div');
    el.className = `screen screen--${name}`;
    el.hidden = name !== router.current;
    root.appendChild(el);
    elements[name] = el;
    renderers[name]?.(el);
  }

  const unsubscribe = router.subscribe((name) => {
    for (const n of SCREEN_NAMES) elements[n].hidden = n !== name;
  });

  return { elements, unsubscribe };
}
