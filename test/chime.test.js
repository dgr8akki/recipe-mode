import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createChime } from '../src/lib/chime.js';

class FakeAudioContext {
  static created = [];
  constructor() {
    this.state = 'running';
    this.currentTime = 5;
    this.resumes = 0;
    this.oscillators = [];
    this.destination = { name: 'speakers' };
    FakeAudioContext.created.push(this);
  }
  createOscillator() {
    const osc = { frequency: { value: 0 }, started: null, stopped: null };
    osc.connect = (node) => node;
    osc.start = (t) => (osc.started = t);
    osc.stop = (t) => (osc.stopped = t);
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    return { gain: { value: 0 }, connect: (node) => node };
  }
  async resume() {
    this.resumes++;
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}

/** A chime with a hand-cranked timer for the close-down. */
function setup() {
  FakeAudioContext.created = [];
  const pending = [];
  const chime = createChime({
    AudioContext: FakeAudioContext,
    schedule: (fn, ms) => pending.push({ fn, ms }) && pending.length,
    unschedule: (id) => id && (pending[id - 1] = null),
  });
  const runPending = async () => {
    for (const entry of pending.splice(0)) entry?.fn();
    await Promise.resolve();
  };
  return { chime, pending, runPending };
}

describe('chime', () => {
  it('plays three short 880 Hz beeps scheduled from the context clock', () => {
    const { chime } = setup();
    chime();
    const [audio] = FakeAudioContext.created;
    assert.deepEqual(
      audio.oscillators.map((o) => [o.frequency.value, o.started, o.stopped]),
      [
        [880, 5, 5.2],
        [880, 5.35, 5.55],
        [880, 5.7, 5.9],
      ],
    );
  });

  it('reuses one AudioContext while ringing instead of opening one per chime', () => {
    const { chime } = setup();
    chime();
    chime();
    chime();
    assert.equal(FakeAudioContext.created.length, 1);
    assert.equal(FakeAudioContext.created[0].oscillators.length, 9);
  });

  it('resumes a context the browser suspended', () => {
    const { chime } = setup();
    chime();
    const [audio] = FakeAudioContext.created;
    assert.equal(audio.resumes, 0);
    audio.state = 'suspended';
    chime();
    assert.equal(audio.resumes, 1);
  });

  it('closes the context once the last beep has faded, and opens a fresh one next time', async () => {
    const { chime, pending, runPending } = setup();
    chime();
    assert.equal(pending.filter(Boolean).length, 1, 'one close-down scheduled');
    assert.ok(pending[0].ms >= 900, 'not before the third beep ends at 900 ms');
    await runPending();
    assert.equal(FakeAudioContext.created[0].state, 'closed');
    chime();
    assert.equal(FakeAudioContext.created.length, 2, 'a closed context cannot be reused');
    assert.equal(FakeAudioContext.created[1].state, 'running');
  });
});
