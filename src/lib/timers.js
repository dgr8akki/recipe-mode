/**
 * Kitchen timers. Pure state with an injectable clock so it can be tested
 * without waiting; the panel renders it and polls `collectFinished()`. The
 * state round-trips through `snapshot()`/`restore()` so it can live in
 * extension storage and outlast the panel (see timer-store.js).
 *
 * @module lib/timers
 */

/**
 * @typedef {object} Timer
 * @property {number} id
 * @property {string} label
 * @property {number} seconds Length it was set for.
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
    this.lastChime = -Infinity;
  }

  /**
   * @param {string} label
   * @param {number} seconds
   * @returns {Timer}
   */
  add(label, seconds) {
    const timer = { id: this.nextId++, label, seconds, endsAt: this.now() + seconds * 1000, finished: false };
    this.list.push(timer);
    return timer;
  }

  /** @param {number} id */
  remove(id) {
    this.list = this.list.filter((t) => t.id !== id);
  }

  /** Dismisses a ringing timer if there is one, else cancels the latest. @returns {Timer | undefined} */
  removeLatest() {
    const timer = this.list.findLast((t) => t.finished) ?? this.list.at(-1);
    if (timer) this.remove(timer.id);
    return timer;
  }

  /**
   * Marks one timer finished, as the service worker does when its alarm fires.
   *
   * @param {number} id
   * @returns {Timer | undefined} The timer, only if it was still running.
   */
  finish(id) {
    const timer = this.list.find((t) => t.id === id && !t.finished);
    if (!timer) return undefined;
    timer.finished = true;
    this.lastChime = -Infinity;
    return timer;
  }

  /** Dismisses every finished timer. @returns {Timer[]} */
  dismissFinished() {
    const done = this.list.filter((t) => t.finished);
    this.list = this.list.filter((t) => !t.finished);
    return done;
  }

  /** Share of the time still left, 1 to 0. @param {Timer} timer */
  fractionLeft(timer) {
    return timer.seconds ? this.secondsLeft(timer) / timer.seconds : 0;
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
    if (done.length) this.lastChime = -Infinity;
    return done;
  }

  /** Plain data for storage. @returns {{ list: Timer[], nextId: number }} */
  snapshot() {
    return { list: this.list.map((t) => ({ ...t })), nextId: this.nextId };
  }

  /**
   * Replaces the state with a snapshot from storage.
   *
   * @param {{ list?: Timer[], nextId?: number }} snapshot
   * @returns {Timer[]} Timers that finished elsewhere since this instance last saw them, so
   *   the panel can announce them; `collectFinished()` will not report them again.
   */
  restore({ list = [], nextId = 1 } = {}) {
    const known = new Map(this.list.map((t) => [t.id, t]));
    const finishedElsewhere = list.filter((t) => t.finished && !known.get(t.id)?.finished);
    this.list = list.map((t) => ({ ...t }));
    this.nextId = Math.max(nextId, ...this.list.map((t) => t.id + 1));
    return finishedElsewhere;
  }

  /**
   * True when a timer has just finished, then every `everyMs` until all
   * finished timers are dismissed. Call after `collectFinished()`.
   */
  shouldChime(everyMs = 20_000) {
    if (!this.list.some((t) => t.finished) || this.now() - this.lastChime < everyMs) return false;
    this.lastChime = this.now();
    return true;
  }
}
