import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

// background.js runs against the `chrome` global as soon as it is imported. Each case installs a
// stub, imports a fresh copy (the query string defeats the module cache) and waits a turn of the
// event loop so any rejected promise the worker leaked has time to surface.
let imports = 0;

async function loadWorker({ setAccessLevel }) {
  const listeners = [];
  globalThis.chrome = {
    sidePanel: { setPanelBehavior() {} },
    storage: { local: setAccessLevel ? { setAccessLevel } : {} },
    runtime: {
      onInstalled: { addListener: (fn) => listeners.push(fn) },
      openOptionsPage() {},
    },
  };
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await import(`../src/background.js?${imports++}`);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return { listeners, unhandled };
}

describe('background', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it('registers onInstalled when storage.local has no setAccessLevel (Chrome < 140)', async () => {
    const { listeners, unhandled } = await loadWorker({});
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
});
