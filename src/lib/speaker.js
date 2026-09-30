/**
 * Reads answers aloud with the browser's built-in speech synthesis, and tells
 * the listener when to ignore the microphone (it would hear us otherwise).
 *
 * @module lib/speaker
 */

/** Grace period after speech ends, while the room echo dies down. */
const ECHO_MS = 500;
/** Fallback speaking-rate estimate (≈15 chars/s) in case `onend` never fires. */
const MS_PER_CHAR = 70;
/** Chrome reports our own cancel() as an error on the interrupted utterance; that is not a failure. */
const NOT_FAILURES = new Set(['interrupted', 'canceled']);

/**
 * @param {object} options
 * @param {() => boolean} options.enabled
 * @param {(message: string) => void} [options.onError] Speech failed; the message is safe to show.
 * @param {() => void} [options.onIdle] Speech has ended and the echo grace has passed.
 * @param {(available: boolean) => void} [options.onVoices] The set of installed voices changed.
 * @param {() => number} [options.now] Injected for tests.
 * @param {typeof setTimeout} [options.schedule] Injected for tests.
 * @param {typeof clearTimeout} [options.unschedule] Injected for tests.
 */
export function createSpeaker({
  enabled,
  onError = () => {},
  onIdle = () => {},
  onVoices = () => {},
  now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms),
  unschedule = (id) => clearTimeout(id),
}) {
  let busyUntil = 0;
  let idleTimer = null;

  // Some systems have no voice installed at all; speak() then does nothing and never says so.
  // Chrome may also list voices only after onvoiceschanged, so keep watching.
  const hasVoices = () => speechSynthesis.getVoices().length > 0;
  let available = hasVoices();
  speechSynthesis.onvoiceschanged = () => {
    const next = hasVoices();
    if (next === available) return;
    available = next;
    onVoices(available);
  };

  /** Speech is over (or was cut short): free the mic after `graceMs`, then tell the panel. */
  function finish(graceMs) {
    busyUntil = now() + graceMs;
    unschedule(idleTimer);
    idleTimer = schedule(onIdle, graceMs);
  }

  return {
    /** @param {string} text */
    say(text) {
      if (!enabled()) return;
      speechSynthesis.cancel();
      busyUntil = now() + text.length * MS_PER_CHAR + 1500;
      // Sentence by sentence: Chrome can cut off long utterances without firing `onend`.
      const sentences = text
        .trim()
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean);
      sentences.forEach((sentence, i) => {
        const utterance = new SpeechSynthesisUtterance(sentence);
        if (i === sentences.length - 1) utterance.onend = () => finish(ECHO_MS);
        utterance.onerror = (event) => {
          if (NOT_FAILURES.has(event?.error)) return;
          // Without this the length-based estimate keeps the mic muted for a readout nobody heard.
          finish(0);
          onError(`Couldn't read that aloud (${event?.error ?? 'unknown error'}).`);
        };
        speechSynthesis.speak(utterance);
      });
    },

    cancel() {
      speechSynthesis.cancel();
      finish(ECHO_MS);
    },

    /** True while speaking, plus a short echo window. */
    get speaking() {
      return now() < busyUntil;
    },

    /** Whether the browser has any voice to speak with. */
    get available() {
      return available;
    },
  };
}
