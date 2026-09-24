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
});
