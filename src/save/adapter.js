/**
 * The save adapter: `load()` and `save(state)`, with no idea where the data
 * actually goes. Backends register themselves in priority order; the
 * adapter tries each in turn and stops at the first one that works.
 *
 * A backend that throws — a browser refusing storage access, a future
 * network backend timing out — is skipped in favour of whatever is
 * registered after it, rather than letting the failure propagate and take
 * the save/load path down with it. Losing a save is the worst bug this game
 * can have, so this module never lets one flaky backend cost the player
 * their progress if another backend could have held it.
 */

export function createSaveAdapter() {
  const backends = [];

  return {
    /** Registers a backend (`{ load(), save(state) }`), lowest priority last. */
    registerBackend(backend) {
      backends.push(backend);
      return this;
    },

    get backends() {
      return backends.slice();
    },

    /**
     * Returns the first state any backend hands back, trying backends in
     * registration order. A backend that throws, or that simply has
     * nothing stored (returns a falsy value), is skipped. Returns `null`
     * if every backend is empty or unavailable — never throws.
     */
    load() {
      for (const backend of backends) {
        let result;
        try {
          result = backend.load();
        } catch {
          continue;
        }
        if (result) return result;
      }
      return null;
    },

    /**
     * Writes `state` to the first backend that accepts it, trying backends
     * in registration order. Returns `true` once some backend has taken
     * the write, `false` if every backend failed — never throws, so a
     * caller can surface "couldn't save" to the player instead of
     * crashing the evening report.
     */
    save(state) {
      for (const backend of backends) {
        try {
          backend.save(state);
          return true;
        } catch {
          continue;
        }
      }
      return false;
    },
  };
}
