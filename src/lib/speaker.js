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

/**
 * @param {{ enabled: () => boolean }} options
 */
export function createSpeaker({ enabled }) {
  let busyUntil = 0;

  return {
    /** @param {string} text */
    say(text) {
      if (!enabled()) return;
      speechSynthesis.cancel();
      busyUntil = Date.now() + text.length * MS_PER_CHAR + 1500;
      // Sentence by sentence: Chrome can cut off long utterances without firing `onend`.
      const sentences = text.split(/(?<=[.!?])\s+/);
      sentences.forEach((sentence, i) => {
        const utterance = new SpeechSynthesisUtterance(sentence);
        if (i === sentences.length - 1) {
          utterance.onend = utterance.onerror = () => {
            busyUntil = Date.now() + ECHO_MS;
          };
        }
        speechSynthesis.speak(utterance);
      });
    },

    cancel() {
      speechSynthesis.cancel();
      busyUntil = Date.now() + ECHO_MS;
    },

    /** True while speaking, plus a short echo window. */
    get speaking() {
      return Date.now() < busyUntil;
    },
  };
}
