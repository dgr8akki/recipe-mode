/**
 * Keeps the kitchen timers in `chrome.storage.session` with one `chrome.alarms`
 * alarm per running timer, so a timer outlives the side panel that started it.
 * The panel saves after every change and re-reads on `onChanged`; the service
 * worker finishes a timer when its alarm fires and shows a notification if no
 * panel is open to chime.
 *
 * Alarms are what make the worker wake up. Chrome delays alarms due in under
 * 30 seconds in a packed extension, so a very short timer can ring late when
 * the panel is closed; with it open, the panel's own tick is on time.
 */

import { Timers } from './timers.js';

const KEY = 'timers';
const PREFIX = 'timer:';

/** Alarm and notification name for a timer. @param {number} id */
export const alarmName = (id) => `${PREFIX}${id}`;

/** @param {string} name @returns {number | null} The timer id, or null for a name that is not ours. */
export function timerIdFromName(name) {
  if (!name.startsWith(PREFIX)) return null;
  const id = Number(name.slice(PREFIX.length));
  return Number.isInteger(id) ? id : null;
}

/**
 * @param {object} deps
 * @param {chrome.storage.StorageArea} deps.storage Session storage: timers should not outlive the browser.
 * @param {typeof chrome.alarms} deps.alarms
 */
export function createTimerStore({ storage, alarms }) {
  return {
    /**
     * Fills `timers` from storage.
     *
     * @param {Timers} timers
     * @returns {Promise<boolean>} Whether anything was stored.
     */
    async load(timers) {
      const { [KEY]: snapshot } = await storage.get(KEY);
      if (snapshot) timers.restore(snapshot);
      return Boolean(snapshot);
    },

    /** Writes `timers` to storage and makes the alarms match: one per running timer. @param {Timers} timers */
    async save(timers) {
      const snapshot = timers.snapshot();
      await storage.set({ [KEY]: snapshot });
      const running = new Set(timers.running().map((t) => alarmName(t.id)));
      for (const alarm of await alarms.getAll()) {
        if (timerIdFromName(alarm.name) !== null && !running.has(alarm.name)) await alarms.clear(alarm.name);
      }
      for (const timer of timers.running()) await alarms.create(alarmName(timer.id), { when: timer.endsAt });
    },

    /** Calls `listener` with the new snapshot whenever another context saves. */
    onChange(listener) {
      storage.onChanged.addListener((changes) => {
        if (changes[KEY]) listener(changes[KEY].newValue ?? { list: [], nextId: 1 });
      });
    },
  };
}

/**
 * Marks the alarm's timer finished in storage.
 *
 * @param {ReturnType<typeof createTimerStore>} store
 * @param {string} name The alarm name.
 * @returns {Promise<import('./timers.js').Timer | null>} The timer if it was still running, else null.
 */
export async function finishFromAlarm(store, name) {
  const id = timerIdFromName(name);
  if (id === null) return null;
  const timers = new Timers();
  await store.load(timers);
  const timer = timers.finish(id);
  if (timer) await store.save(timers);
  return timer ?? null;
}

/**
 * Removes the timer behind a notification the cook clicked.
 *
 * @param {ReturnType<typeof createTimerStore>} store
 * @param {string} name The notification id, which is the alarm name.
 */
export async function dismissFromNotification(store, name) {
  const id = timerIdFromName(name);
  if (id === null) return;
  const timers = new Timers();
  await store.load(timers);
  timers.remove(id);
  await store.save(timers);
}
