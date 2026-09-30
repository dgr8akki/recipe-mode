import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Timers } from '../src/lib/timers.js';

describe('Timers', () => {
  it('counts down and finishes each timer exactly once', () => {
    let now = 0;
    const timers = new Timers({ now: () => now });
    const eggs = timers.add('Eggs', 60);
    timers.add('Rice', 600);

    now = 30_000;
    assert.equal(timers.secondsLeft(eggs), 30);
    assert.deepEqual(timers.collectFinished(), []);

    now = 60_000;
    assert.deepEqual(
      timers.collectFinished().map((t) => t.label),
      ['Eggs'],
    );
    assert.deepEqual(timers.collectFinished(), [], 'already reported');
    assert.deepEqual(
      timers.running().map((t) => t.label),
      ['Rice'],
    );
    assert.equal(timers.secondsLeft(eggs), 0);
  });

  it('removes timers by id or the latest one', () => {
    const timers = new Timers({ now: () => 0 });
    const first = timers.add('First', 10);
    timers.add('Second', 10);
    assert.equal(timers.removeLatest().label, 'Second');
    timers.remove(first.id);
    assert.equal(timers.list.length, 0);
    assert.equal(timers.removeLatest(), undefined);
  });

  it('dismisses a ringing timer before cancelling a running one', () => {
    let now = 0;
    const timers = new Timers({ now: () => now });
    timers.add('Short', 1);
    timers.add('Long', 600);
    now = 1000;
    timers.collectFinished();
    assert.equal(timers.removeLatest().label, 'Short');
    assert.equal(timers.removeLatest().label, 'Long');
  });

  it('chimes when a timer finishes, then every 20 s until dismissed', () => {
    let now = 0;
    const timers = new Timers({ now: () => now });
    timers.add('Eggs', 60);
    assert.equal(timers.shouldChime(), false, 'nothing finished');
    now = 60_000;
    timers.collectFinished();
    assert.equal(timers.fractionLeft(timers.list[0]), 0);
    assert.equal(timers.shouldChime(), true);
    now = 70_000;
    assert.equal(timers.shouldChime(), false);
    now = 80_000;
    assert.equal(timers.shouldChime(), true);
    assert.deepEqual(
      timers.dismissFinished().map((t) => t.label),
      ['Eggs'],
    );
    now = 200_000;
    assert.equal(timers.shouldChime(), false);
  });
});

describe('Timers persistence', () => {
  it('round-trips through a plain snapshot, as a reopened panel would', () => {
    let now = 0;
    const timers = new Timers({ now: () => now });
    timers.add('Step 2: 10 mins', 600);
    timers.add('Step 4: 30 mins', 1800);
    now = 600_000;
    timers.collectFinished();

    const snapshot = JSON.parse(JSON.stringify(timers.snapshot()));
    const reopened = new Timers({ now: () => now });
    assert.deepEqual(
      reopened.restore(snapshot).map((t) => t.label),
      ['Step 2: 10 mins'],
      'a reopened panel is told once about the timer that finished while it was closed',
    );
    assert.deepEqual(reopened.list, timers.list);
    assert.deepEqual(reopened.restore(snapshot), [], 'not told twice');
    assert.equal(reopened.add('Step 5: 5 mins', 300).id, 3, 'ids continue after the restored ones');
    assert.equal(reopened.shouldChime(), true, 'a restored finished timer rings again');
  });

  it('reports timers another context finished when restoring', () => {
    const timers = new Timers({ now: () => 0 });
    const eggs = timers.add('Eggs', 60);
    const snapshot = timers.snapshot();
    snapshot.list[0].finished = true;
    assert.deepEqual(
      timers.restore(snapshot).map((t) => t.id),
      [eggs.id],
    );
    assert.deepEqual(timers.collectFinished(), [], 'not reported a second time');
    assert.deepEqual(timers.restore(snapshot), [], 'not reported a second time');
  });

  it('finishes a timer by id once', () => {
    const timers = new Timers({ now: () => 0 });
    const eggs = timers.add('Eggs', 60);
    assert.equal(timers.finish(eggs.id)?.label, 'Eggs');
    assert.equal(timers.finish(eggs.id), undefined);
    assert.equal(timers.finish(99), undefined);
    assert.equal(timers.shouldChime(), true);
  });
});
