/**
 * The timer bell: three short beeps from the Web Audio API. One AudioContext
 * is shared while the bell rings and closed once the last beep has faded,
 * because each context holds an audio thread and output stream until it is
 * closed or collected, and a forgotten timer chimes every 20 seconds.
 *
 * @module lib/chime
 */

const HZ = 880;
const BEEP_AT = [0, 0.35, 0.7];
const BEEP_S = 0.2;
/** After the last beep ends at 900 ms, with a margin so the tail is not clipped. */
const CLOSE_AFTER_MS = 1200;

/**
 * @param {object} [deps] Injected for tests.
 * @param {typeof AudioContext} [deps.AudioContext]
 * @param {typeof setTimeout} [deps.schedule]
 * @param {typeof clearTimeout} [deps.unschedule]
 * @returns {() => void}
 */
export function createChime({
  AudioContext = globalThis.AudioContext,
  schedule = (fn, ms) => setTimeout(fn, ms),
  unschedule = (id) => clearTimeout(id),
} = {}) {
  /** @type {AudioContext | null} */
  let audio = null;
  let closing = null;

  return function chime() {
    audio ??= new AudioContext();
    // Chrome suspends a context created without a user gesture; a timer ending is not one.
    if (audio.state === 'suspended') audio.resume();
    const start = audio.currentTime;
    for (const at of BEEP_AT) {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = HZ;
      gain.gain.value = 0.2;
      tone.connect(gain).connect(audio.destination);
      tone.start(start + at);
      tone.stop(start + at + BEEP_S);
    }
    unschedule(closing);
    closing = schedule(() => {
      const done = audio;
      audio = null;
      done?.close();
    }, CLOSE_AFTER_MS);
  };
}
