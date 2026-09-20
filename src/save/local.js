/**
 * The `localStorage` backend. Every read and every write goes through its
 * own try/catch: Safari private browsing (and others) can make
 * `localStorage.getItem`/`setItem` throw on ANY access, not just once a
 * quota is exceeded, so a bare call here would crash the boot sequence for
 * anyone using it.
 *
 * `load()` never throws — a storage error or unreadable value is simply "no
 * save here," and the adapter (or a caller with only this one backend
 * registered) falls back to a new game rather than crashing. `save()` DOES
 * throw when the underlying write fails, on purpose: silently swallowing a
 * failed write would be exactly the kind of "lost the save and nobody was
 * told" bug this game can least afford. The adapter that calls this backend
 * catches that throw and either tries another backend or reports the save
 * as failed — it does not vanish.
 */
import { serialize, deserialize } from '../sim/state.js';

const SAVE_KEY = 'course-tycoon-save';

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    // Some browsers throw merely on TOUCHING `localStorage` in certain
    // private-browsing configurations, before any method is even called.
    return undefined;
  }
}

/** `storage` is injectable for tests; defaults to the real `localStorage`. */
export function createLocalBackend(storage = defaultStorage()) {
  return {
    name: 'local',

    load() {
      if (!storage) return null;
      let text;
      try {
        text = storage.getItem(SAVE_KEY);
      } catch {
        return null; // storage inaccessible: nothing we can call a save
      }
      if (!text) return null;
      try {
        return deserialize(text);
      } catch {
        return null; // whatever is under our key isn't a save we can read
      }
    },

    save(state) {
      if (!storage) throw new Error('local storage is not available');
      const text = serialize(state);
      try {
        storage.setItem(SAVE_KEY, text);
      } catch (err) {
        throw new Error(`could not write to local storage: ${err.message}`);
      }
    },
  };
}
