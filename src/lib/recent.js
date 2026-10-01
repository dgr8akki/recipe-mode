/**
 * A set that only remembers the last `limit` values added. The panel uses it
 * to ignore the final of a phrase whose partial it already acted on; a plain
 * Set would grow by one id per utterance for as long as the panel stays open.
 */

/** @param {number} [limit] */
export function createRecentSet(limit = 100) {
  /** Insertion-ordered, so the first key is the oldest. */
  const ids = new Set();
  return {
    add(id) {
      ids.delete(id); // re-adding moves it to the newest end
      ids.add(id);
      if (ids.size > limit) ids.delete(ids.values().next().value);
    },
    has: (id) => ids.has(id),
    get size() {
      return ids.size;
    },
  };
}
