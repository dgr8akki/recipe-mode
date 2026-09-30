import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { Timers } from '../src/lib/timers.js';
import { alarmName, createTimerStore } from '../src/lib/timer-store.js';
import { fakeChrome, fakeStorageArea, settle } from './support.js';

// background.js runs against the `chrome` global as soon as it is imported. Each case installs a
// stub, imports a fresh copy (the query string defeats the module cache) and waits a turn of the
// event loop so any rejected promise the worker leaked has time to surface.
let imports = 0;

async function loadWorker({ setAccessLevel, panels = 0, session = {} } = {}) {
  const chrome = fakeChrome({ panels, session });
  const listeners = [];
  chrome.runtime.onInstalled.addListener = (fn) => listeners.push(fn);
  if (setAccessLevel) chrome.storage.local.setAccessLevel = setAccessLevel;
  globalThis.chrome = chrome;
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await import(`../src/background.js?${imports++}`);
    await settle();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return { chrome, listeners, unhandled };
}

/** Session storage holding one running timer, the way the panel saves it. */
async function storedTimer(label = 'Step 4: 30 mins') {
  const session = {};
  const timers = new Timers({ now: () => 0 });
  const timer = timers.add(label, 1800);
  const alarms = { getAll: async () => [], create: async () => {}, clear: async () => {} };
  await createTimerStore({ storage: fakeStorageArea(session), alarms }).save(timers);
  return { session, timer };
}

describe('background', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it('registers onInstalled when storage.local has no setAccessLevel (Chrome < 140)', async () => {
    const { listeners, unhandled } = await loadWorker();
    assert.equal(listeners.length, 1);
    assert.deepEqual(unhandled, []);
  });

  it('registers onInstalled when setAccessLevel throws synchronously', async () => {
    const { listeners, unhandled } = await loadWorker({
      setAccessLevel() {
        throw new TypeError('not a function');
      },
    });
    assert.equal(listeners.length, 1);
    assert.deepEqual(unhandled, []);
  });

  it('leaves no unhandled rejection when setAccessLevel rejects', async () => {
    const { listeners, unhandled } = await loadWorker({
      setAccessLevel: () => Promise.reject(new Error('Access level cannot be changed')),
    });
    assert.equal(listeners.length, 1);
    assert.deepEqual(unhandled, []);
  });

  it('shows a notification when a timer ends with no panel open', async () => {
    const { session, timer } = await storedTimer();
    const { chrome } = await loadWorker({ session, panels: 0 });
    await chrome.alarms.fire(alarmName(timer.id));
    await settle();

    assert.equal(chrome.notifications.shown.length, 1);
    const [shown] = chrome.notifications.shown;
    assert.equal(shown.id, alarmName(timer.id));
    assert.equal(shown.message, 'Step 4: 30 mins is done');
    assert.equal(shown.requireInteraction, true);
    assert.equal(shown.type, 'basic');
    assert.equal(session.timers.list[0].finished, true, 'the panel will see it as finished when it opens');
  });

  it('leaves the chime and the announcement to an open panel', async () => {
    const { session, timer } = await storedTimer();
    const { chrome } = await loadWorker({ session, panels: 1 });
    await chrome.alarms.fire(alarmName(timer.id));
    await settle();
    assert.deepEqual(chrome.notifications.shown, []);
    assert.equal(session.timers.list[0].finished, true);
  });

  it('ignores alarms that are not timers and timers that already finished', async () => {
    const { session, timer } = await storedTimer();
    session.timers.list[0].finished = true;
    const { chrome } = await loadWorker({ session });
    await chrome.alarms.fire('housekeeping');
    await chrome.alarms.fire(alarmName(timer.id));
    await settle();
    assert.deepEqual(chrome.notifications.shown, []);
  });

  it('dismisses the timer when its notification is clicked', async () => {
    const { session, timer } = await storedTimer();
    const { chrome } = await loadWorker({ session });
    await chrome.notifications.onClicked.fire(alarmName(timer.id));
    await settle();
    assert.deepEqual(chrome.notifications.cleared, [alarmName(timer.id)]);
    assert.deepEqual(session.timers.list, []);
  });
});
