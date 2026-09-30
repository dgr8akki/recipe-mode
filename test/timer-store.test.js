import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Timers } from '../src/lib/timers.js';
import { alarmName, createTimerStore, dismissFromNotification, finishFromAlarm } from '../src/lib/timer-store.js';
import { fakeAlarms, fakeStorageArea } from './support.js';

const setup = (now = 0) => {
  const storage = fakeStorageArea();
  const alarms = fakeAlarms();
  const store = createTimerStore({ storage, alarms });
  const timers = new Timers({ now: () => now });
  return { storage, alarms, store, timers };
};

describe('timer store', () => {
  it('saves timers to storage with one alarm per running timer', async () => {
    const { storage, alarms, store, timers } = setup();
    const eggs = timers.add('Eggs', 60);
    const rice = timers.add('Rice', 600);
    await store.save(timers);

    assert.deepEqual(storage.store.timers, timers.snapshot());
    assert.deepEqual([...alarms.scheduled.keys()], [alarmName(eggs.id), alarmName(rice.id)]);
    assert.equal(alarms.scheduled.get(alarmName(eggs.id)).scheduledTime, eggs.endsAt);
  });

  it('clears the alarm of a removed or finished timer', async () => {
    const { alarms, store, timers } = setup();
    const eggs = timers.add('Eggs', 60);
    const rice = timers.add('Rice', 600);
    await store.save(timers);
    timers.remove(rice.id);
    timers.finish(eggs.id);
    await store.save(timers);
    assert.deepEqual([...alarms.scheduled.keys()], []);
  });

  it('survives a panel reload: load restores what save wrote', async () => {
    const { storage, alarms, store, timers } = setup();
    timers.add('Eggs', 60);
    await store.save(timers);

    const reloaded = new Timers({ now: () => 0 });
    const fresh = createTimerStore({ storage, alarms });
    assert.equal(await fresh.load(reloaded), true);
    assert.deepEqual(reloaded.list, timers.list);

    const empty = new Timers();
    assert.equal(await createTimerStore({ storage: fakeStorageArea(), alarms }).load(empty), false);
    assert.deepEqual(empty.list, []);
  });

  it('tells the panel when another context changed the timers', async () => {
    const { storage, alarms, store } = setup();
    const seen = [];
    store.onChange((snapshot) => seen.push(snapshot));
    const other = new Timers({ now: () => 0 });
    other.add('Eggs', 60);
    await createTimerStore({ storage, alarms }).save(other);
    storage.onChanged.fire({ unrelated: { newValue: 1 } });
    assert.deepEqual(seen, [other.snapshot()]);
  });

  it("finishes the alarm's timer in storage and returns it once", async () => {
    const { storage, alarms, store, timers } = setup();
    const eggs = timers.add('Step 4: 30 mins', 1800);
    await store.save(timers);

    const finished = await finishFromAlarm(store, alarmName(eggs.id));
    assert.equal(finished.label, 'Step 4: 30 mins');
    assert.equal(storage.store.timers.list[0].finished, true);
    assert.equal(alarms.scheduled.size, 0);
    assert.equal(await finishFromAlarm(store, alarmName(eggs.id)), null, 'already finished');
    assert.equal(await finishFromAlarm(store, 'something-else'), null, 'not one of ours');
  });

  it('dismisses a timer from its notification', async () => {
    const { storage, store, timers } = setup();
    const eggs = timers.add('Eggs', 60);
    timers.add('Rice', 600);
    await store.save(timers);
    await dismissFromNotification(store, alarmName(eggs.id));
    assert.deepEqual(
      storage.store.timers.list.map((t) => t.label),
      ['Rice'],
    );
  });
});
