/**
 * Kitchen timers. Pure state with an injectable clock so it can be tested
 * without waiting; the panel renders it and polls `collectFinished()`.
 *
 * @module lib/timers
 */

/**
 * @typedef {object} Timer
 * @property {number} id
 * @property {string} label
 * @property {number} endsAt Epoch milliseconds.
 * @property {boolean} finished
 */

export class Timers {
  /** @param {{ now?: () => number }} [options] */
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    /** @type {Timer[]} */
    this.list = [];
    this.nextId = 1;
  }

  /**
   * @param {string} label
   * @param {number} seconds
   * @returns {Timer}
   */
  add(label, seconds) {
    const timer = { id: this.nextId++, label, endsAt: this.now() + seconds * 1000, finished: false };
    this.list.push(timer);
    return timer;
  }

  /** @param {number} id */
  remove(id) {
    this.list = this.list.filter((t) => t.id !== id);
  }

  /** Cancels the most recently started timer. @returns {Timer | undefined} */
  removeLatest() {
    return this.list.pop();
  }

  /** @param {Timer} timer Seconds left, never negative. */
  secondsLeft(timer) {
    return Math.max(0, (timer.endsAt - this.now()) / 1000);
  }

  /** @returns {Timer[]} */
  running() {
    return this.list.filter((t) => !t.finished);
  }

  /** Marks and returns timers that finished since the last call. @returns {Timer[]} */
  collectFinished() {
    const done = this.list.filter((t) => !t.finished && t.endsAt <= this.now());
    for (const t of done) t.finished = true;
    return done;
  }
}
