import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { createSpeaker } from '../src/lib/speaker.js';

/** speechSynthesis stand-in: keeps utterances so a test can end or fail them. */
function fakeSynthesis({ voices = [{ lang: 'en-US', name: 'Test' }] } = {}) {
  const synth = { spoken: [], cancels: 0, voices, onvoiceschanged: null };
  synth.speak = (u) => synth.spoken.push(u);
  synth.cancel = () => synth.cancels++;
  synth.getVoices = () => synth.voices;
  globalThis.speechSynthesis = synth;
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  return synth;
}

let now = 0;
const clock = () => now;

afterEach(() => {
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
});

describe('speaker', () => {
  it('speaks sentence by sentence and stays busy until the last one ends plus an echo grace', () => {
    const synth = fakeSynthesis();
    const speaker = createSpeaker({ enabled: () => true, now: clock });
    speaker.say('Step 2. Cream the butter and sugar! Then add the eggs?');
    assert.deepEqual(
      synth.spoken.map((u) => u.text),
      ['Step 2.', 'Cream the butter and sugar!', 'Then add the eggs?'],
    );
    assert.equal(speaker.speaking, true);
    synth.spoken.at(-1).onend();
    assert.equal(speaker.speaking, true, 'the room echo has not died down');
    now += 499;
    assert.equal(speaker.speaking, true);
    now += 1;
    assert.equal(speaker.speaking, false);
  });

  it('does not queue an empty utterance for trailing whitespace', () => {
    const synth = fakeSynthesis();
    const speaker = createSpeaker({ enabled: () => true, now: clock });
    speaker.say('Bake for 30 mins. ');
    assert.deepEqual(
      synth.spoken.map((u) => u.text),
      ['Bake for 30 mins.'],
    );
    assert.equal(typeof synth.spoken[0].onend, 'function', 'the real last sentence carries onend');
  });

  it('does nothing when read-aloud is off', () => {
    const synth = fakeSynthesis();
    const speaker = createSpeaker({ enabled: () => false, now: clock });
    speaker.say('Hello.');
    assert.deepEqual(synth.spoken, []);
    assert.equal(speaker.speaking, false);
  });

  it('frees the mic at once and reports when speaking fails', () => {
    const synth = fakeSynthesis();
    const errors = [];
    const speaker = createSpeaker({ enabled: () => true, now: clock, onError: (m) => errors.push(m) });
    speaker.say('x'.repeat(400));
    assert.equal(speaker.speaking, true, 'the length-based estimate would mute the mic for ~30 s');
    synth.spoken[0].onerror({ error: 'synthesis-failed' });
    assert.equal(speaker.speaking, false);
    assert.deepEqual(errors, ["Couldn't read that aloud (synthesis-failed)."]);
  });

  it('reports a failure once per say() and stops the rest of the sentences', () => {
    const synth = fakeSynthesis();
    const errors = [];
    const speaker = createSpeaker({ enabled: () => true, now: clock, onError: (m) => errors.push(m) });
    speaker.say('One. Two. Three.');
    assert.equal(synth.spoken.length, 3);
    for (const utterance of synth.spoken) utterance.onerror({ error: 'synthesis-failed' });
    assert.deepEqual(errors, ["Couldn't read that aloud (synthesis-failed)."]);
    assert.equal(synth.cancels, 2, 'the remaining sentences were cancelled after the first failure');
  });

  it('cancel stops speech and leaves only the echo grace', () => {
    const synth = fakeSynthesis();
    const speaker = createSpeaker({ enabled: () => true, now: clock });
    speaker.say('A long sentence that would take a while.');
    speaker.cancel();
    assert.equal(synth.cancels, 2, 'once before speaking, once to cancel');
    now += 500;
    assert.equal(speaker.speaking, false);
  });

  it('calls onIdle once speaking has ended, so a command heard meanwhile can run', () => {
    const synth = fakeSynthesis();
    const timers = [];
    let idle = 0;
    const speaker = createSpeaker({
      enabled: () => true,
      now: clock,
      onIdle: () => idle++,
      schedule: (fn, ms) => timers.push({ fn, ms }),
    });
    speaker.say('One. Two.');
    assert.equal(idle, 0);
    synth.spoken.at(-1).onend();
    assert.equal(idle, 0, 'not before the echo grace');
    assert.equal(timers.at(-1).ms, 500);
    now += 500;
    timers.at(-1).fn();
    assert.equal(idle, 1);
  });

  it('knows when the browser has no voice to speak with', () => {
    fakeSynthesis({ voices: [] });
    const speaker = createSpeaker({ enabled: () => true, now: clock });
    assert.equal(speaker.available, false);
    fakeSynthesis({ voices: [{ lang: 'en-GB', name: 'Daniel' }] });
    assert.equal(createSpeaker({ enabled: () => true, now: clock }).available, true);
  });

  it('learns about voices that arrive later', () => {
    const synth = fakeSynthesis({ voices: [] });
    const seen = [];
    const speaker = createSpeaker({ enabled: () => true, now: clock, onVoices: (ok) => seen.push(ok) });
    assert.equal(speaker.available, false);
    synth.voices = [{ lang: 'en-US', name: 'Late' }];
    synth.onvoiceschanged();
    assert.equal(speaker.available, true);
    assert.deepEqual(seen, [true]);
  });
});
