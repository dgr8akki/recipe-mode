/**
 * Doubles for the parts of the `chrome` API the extension pages and worker
 * touch: storage areas with onChanged, alarms, and a jsdom page installer.
 * Only this repo's own tests use these; shared test helpers live in helpers.js.
 */

import { JSDOM } from 'jsdom';

/**
 * A `chrome.storage` area double. `store` is the backing object, exposed so
 * tests can read what was saved; `onChanged.fire` is what `set`/`remove` call.
 *
 * @param {Record<string, unknown>} [store]
 */
export function fakeStorageArea(store = {}) {
  const listeners = [];
  const fire = (changes) => listeners.forEach((listener) => listener(changes, 'session'));
  return {
    store,
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.filter((name) => name in store).map((name) => [name, store[name]]));
    },
    async set(values) {
      const changes = Object.fromEntries(
        Object.entries(values).map(([name, value]) => [name, { oldValue: store[name], newValue: value }]),
      );
      Object.assign(store, values);
      fire(changes);
    },
    async remove(key) {
      const changes = { [key]: { oldValue: store[key] } };
      delete store[key];
      fire(changes);
    },
    onChanged: { addListener: (listener) => listeners.push(listener), fire },
  };
}

/** A `chrome.alarms` double that remembers what is scheduled, keyed by name. */
export function fakeAlarms() {
  const scheduled = new Map();
  const listeners = [];
  return {
    scheduled,
    async create(name, info) {
      scheduled.set(name, { name, scheduledTime: info.when });
    },
    async clear(name) {
      return scheduled.delete(name);
    },
    async getAll() {
      return [...scheduled.values()];
    },
    onAlarm: { addListener: (listener) => listeners.push(listener) },
    /** Fires every registered listener as Chrome would. */
    fire: (name) => Promise.all(listeners.map((listener) => listener({ name, scheduledTime: 0 }))),
  };
}

/**
 * A `chrome` double: local and session storage, alarms, notifications that
 * record what was shown, and a runtime whose getContexts reports the open
 * side panels given in `panels`.
 *
 * @param {{ local?: object, session?: object, panels?: number }} [options]
 */
export function fakeChrome({ local = {}, session = {}, panels = 0, tabs = [], pageResults = {} } = {}) {
  const notifications = { shown: [], cleared: [], listeners: [] };
  const opened = [];
  const openedTabs = [];
  const injected = [];
  const tabListeners = { onActivated: [], onUpdated: [], onRemoved: [] };
  const event = (name) => ({
    addListener: (fn) => tabListeners[name].push(fn),
    fire: (...args) => tabListeners[name].forEach((fn) => fn(...args)),
  });
  return {
    opened,
    openedTabs,
    injected,
    notifications: {
      shown: notifications.shown,
      cleared: notifications.cleared,
      create(id, options) {
        notifications.shown.push({ id, ...options });
      },
      clear(id) {
        notifications.cleared.push(id);
      },
      onClicked: {
        addListener: (listener) => notifications.listeners.push(listener),
        fire: (id) => Promise.all(notifications.listeners.map((listener) => listener(id))),
      },
    },
    storage: {
      local: fakeStorageArea(local),
      session: fakeStorageArea(session),
      onChanged: { addListener() {} },
    },
    alarms: fakeAlarms(),
    sidePanel: { setPanelBehavior() {} },
    tabs: {
      create: (options) => openedTabs.push(options),
      query: async () => tabs,
      onActivated: event('onActivated'),
      onUpdated: event('onUpdated'),
      onRemoved: event('onRemoved'),
    },
    /** Injected page functions are answered by name from `pageResults` (a value or a function of the args). */
    scripting: {
      async executeScript({ target, func, args = [] }) {
        injected.push({ tabId: target.tabId, func: func.name, args });
        const result = pageResults[func.name];
        return [{ result: typeof result === 'function' ? result(...args) : result }];
      },
    },
    runtime: {
      onInstalled: { addListener() {} },
      openOptionsPage: () => opened.push('options'),
      getURL: (path) => `chrome-extension://test/${path}`,
      getContexts: async () => Array.from({ length: panels }, () => ({ contextType: 'SIDE_PANEL' })),
    },
  };
}

/**
 * Exposes a jsdom page as the globals an extension page script expects, plus
 * `chrome`. Returns a restore function.
 *
 * @param {string} html
 * @param {object} chrome
 */
export function installPage(html, chrome) {
  const { window } = new JSDOM(html, { url: 'chrome-extension://test/page.html', pretendToBeVisual: true });
  const names = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLButtonElement',
    'Event',
    'InputEvent',
    'MutationObserver',
    'HTMLLIElement',
    'chrome',
  ];
  // defineProperty, not assignment: Node exposes `navigator` through a getter-only accessor.
  const define = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const previous = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) define(name, name === 'window' ? window : name === 'chrome' ? chrome : window[name]);
  return () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

/** Waits for pending promises (storage reads, module top-level awaits) to settle. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
