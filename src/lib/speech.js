/**
 * Continuous speech recognition for an extension page, emitting a transcript
 * for every new word so the caller can act before the speaker finishes.
 *
 * Prefers Chrome's on-device recognizer (Chrome 139+), which needs no network,
 * and falls back to cloud recognition. Brave ships the API surface without a
 * working backend in either mode, so it is reported as unsupported.
 */

/** Errors that only mean "nobody talked" and must not stop listening. */
const BENIGN_ERRORS = new Set(['no-speech', 'aborted']);

/** @type {Record<string, string>} */
const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access is blocked.',
  'audio-capture': 'No microphone was found.',
  network:
    "Can't turn speech into text: Google's speech service is out of reach and this computer can't do it offline.",
  'language-not-supported': "This browser can't recognise spoken English.",
};

/**
 * @typedef {object} Transcript
 * @property {string} text
 * @property {boolean} final True once the recognizer has settled the phrase.
 * @property {string} id Stable for every partial of the same phrase.
 */

/**
 * @param {object} callbacks
 * @param {(t: Transcript) => void} callbacks.onTranscript
 * @param {(error: { code: string, message: string }) => void} callbacks.onError
 * @param {(status: { listening: boolean, mode?: 'on-device' | 'cloud' }) => void} [callbacks.onStatus]
 * @param {(message: string) => void} [callbacks.onNotice] One-off progress messages.
 * @param {string} [lang]
 */
export function createListener({ onTranscript, onError, onStatus = () => {}, onNotice = () => {} }, lang = 'en-US') {
  const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
  const unsupportedReason = navigator.brave
    ? "Brave doesn't hear speech, so type your commands below, or cook with Google Chrome for voice."
    : !Recognition
      ? "Voice isn't available in this browser. Type your commands below."
      : null;

  let recognition = null;
  let listening = false;
  let mode = null;
  let session = 0;
  let lastWordCount = 0;

  async function chooseMode() {
    if (mode) return;
    mode = 'cloud';
    if (!Recognition.available) return;
    const options = { langs: [lang], processLocally: true };
    let state = await within(Recognition.available(options), 3_000, 'unavailable');
    if (state === 'downloadable' || state === 'downloading') {
      onNotice('Fetching the speech model so Chrome can listen offline. Only the first time.');
      state = (await within(Recognition.install(options), 60_000, false)) ? 'available' : 'unavailable';
    }
    if (state === 'available') mode = 'on-device';
  }

  function build() {
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.processLocally = mode === 'on-device';
    r.onstart = () => {
      session += 1;
      lastWordCount = 0;
    };
    r.onresult = (event) => {
      const index = event.results.length - 1;
      const result = event.results[index];
      const text = result[0].transcript.trim();
      if (!text) return;
      const words = text.split(/\s+/).length;
      // Chrome resends the same partial many times a second; pass one on only when it grows a word or settles.
      if (!result.isFinal && words === lastWordCount) return;
      lastWordCount = result.isFinal ? 0 : words;
      onTranscript({ text, final: result.isFinal, id: `${session}:${index}` });
    };
    // A quiet spell (stirring, waiting for the oven) makes Chrome end the session; pick it straight back up.
    r.onend = () => {
      if (listening) tryStart(r);
    };
    r.onerror = (event) => {
      if (BENIGN_ERRORS.has(event.error)) return;
      stop();
      onError({
        code: event.error,
        message: ERROR_MESSAGES[event.error] ?? `Speech recognition error: ${event.error}.`,
      });
    };
    return r;
  }

  /**
   * `start()` throws (InvalidStateError and friends) when the recogniser is in a state it does not
   * like. Left alone that meant `listening` stayed true over a dead recogniser, which a cook with
   * messy hands would not notice for a while.
   */
  function tryStart(r) {
    try {
      r.start();
      return true;
    } catch {
      listening = false;
      onStatus({ listening, mode });
      onError({ code: 'start-failed', message: 'Listening stopped. Tap the microphone to start again.' });
      return false;
    }
  }

  async function start() {
    if (unsupportedReason) return onError({ code: 'unsupported', message: unsupportedReason });
    if (listening) return;
    await chooseMode();
    recognition ??= build();
    listening = true;
    if (tryStart(recognition)) onStatus({ listening, mode });
  }

  function stop() {
    if (!listening) return;
    listening = false;
    recognition?.stop();
    onStatus({ listening, mode });
  }

  return {
    start,
    stop,
    get listening() {
      return listening;
    },
    get supported() {
      return !unsupportedReason;
    },
  };
}

/** Resolves with `fallback` if `promise` hasn't settled in `ms` (Brave never settles). */
function within(promise, ms, fallback) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => setTimeout(resolve, ms, fallback)),
  ]);
}
