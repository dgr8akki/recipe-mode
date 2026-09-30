import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { createListener } from '../src/lib/speech.js';

/** A stand-in for webkitSpeechRecognition that records calls and lets a test fire its events. */
class FakeRecognition {
  static instances = [];
  static startThrows = null;
  constructor() {
    this.starts = 0;
    this.stops = 0;
    FakeRecognition.instances.push(this);
  }
  start() {
    if (FakeRecognition.startThrows) throw FakeRecognition.startThrows;
    this.starts++;
    this.onstart?.();
  }
  stop() {
    this.stops++;
  }
  /** Fires a result whose last entry is `text`. */
  result(text, isFinal = false) {
    this.onresult({ results: [[{ transcript: text }]].map((r) => Object.assign(r, { isFinal })) });
  }
}

function setup() {
  FakeRecognition.instances = [];
  FakeRecognition.startThrows = null;
  globalThis.webkitSpeechRecognition = FakeRecognition;
  globalThis.navigator ??= {};
  const transcripts = [];
  const errors = [];
  const statuses = [];
  const listener = createListener({
    onTranscript: (t) => transcripts.push(t),
    onError: (e) => errors.push(e),
    onStatus: (s) => statuses.push(s),
  });
  return { listener, transcripts, errors, statuses, recognition: () => FakeRecognition.instances[0] };
}

afterEach(() => {
  delete globalThis.webkitSpeechRecognition;
});

describe('speech listener', () => {
  it('starts and stops the recogniser and reports the status each way', async () => {
    const { listener, statuses, recognition } = setup();
    await listener.start();
    assert.equal(listener.listening, true);
    assert.equal(recognition().starts, 1);
    listener.stop();
    assert.equal(listener.listening, false);
    assert.equal(recognition().stops, 1);
    assert.deepEqual(
      statuses.map((s) => s.listening),
      [true, false],
    );
  });

  it('emits a transcript per new word, and finals always', async () => {
    const { listener, transcripts, recognition } = setup();
    await listener.start();
    recognition().result('go');
    recognition().result('go'); // interim repeats are not news
    recognition().result('go to');
    recognition().result('go to step', true);
    assert.deepEqual(
      transcripts.map((t) => [t.text, t.final]),
      [
        ['go', false],
        ['go to', false],
        ['go to step', true],
      ],
    );
    assert.equal(new Set(transcripts.map((t) => t.id)).size, 1, 'one id for one phrase');
  });

  it('restarts after Chrome ends a session, but not once stopped', async () => {
    const { listener, recognition } = setup();
    await listener.start();
    recognition().onend();
    assert.equal(recognition().starts, 2);
    listener.stop();
    recognition().onend();
    assert.equal(recognition().starts, 2);
  });

  it('gives up cleanly when a restart throws, so the cook is told', async () => {
    const { listener, errors, recognition } = setup();
    await listener.start();
    FakeRecognition.startThrows = new DOMException('already started', 'InvalidStateError');
    recognition().onend();
    assert.equal(listener.listening, false, 'not left believing it listens');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'Listening stopped. Tap the microphone to start again.');
  });

  it('reports a first start that throws the same way', async () => {
    const { listener, errors } = setup();
    FakeRecognition.startThrows = new Error('no audio device');
    await listener.start();
    assert.equal(listener.listening, false);
    assert.match(errors[0].message, /Listening stopped/);
  });
});
