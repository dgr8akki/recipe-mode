import { JSDOM } from 'jsdom';

/**
 * A Jev client double. `respond` receives the request body and returns the
 * `answers` object (or throws, to simulate errors).
 *
 * @param {(body: any) => Record<string, any>} respond
 */
export function fakeJev(respond) {
  const calls = [];
  return {
    calls,
    secondsPaused: () => 0,
    async evaluate(body) {
      calls.push(body);
      return respond(body);
    },
  };
}

/** Shorthand for a Jev choice answer. */
export const choice = (value, confidence = 0.95) => ({
  type: 'choice',
  choice: value,
  confidence,
  probabilities: { [value]: confidence },
});

/** Shorthand for a Jev boolean answer. */
export const yesNo = (probability) => ({ type: 'boolean', probability });

/**
 * Exposes a jsdom page as the globals that injected page functions expect.
 *
 * @param {string} html
 * @returns {() => void} Restores the previous globals.
 */
export function installDom(html) {
  const { window } = new JSDOM(html, { url: 'https://recipes.example/banana-bread' });
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
    window.lastScrolledTo = this;
  };
  window.matchMedia = () => ({ matches: false });

  const names = ['window', 'document', 'DOMParser', 'matchMedia'];
  const previous = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  Object.assign(globalThis, {
    window,
    document: window.document,
    DOMParser: window.DOMParser,
    matchMedia: window.matchMedia,
  });
  return () => Object.assign(globalThis, previous);
}

/**
 * A minimal `fetch` Response double.
 *
 * @param {number} status
 * @param {object} body
 * @param {Record<string, string>} [headers]
 */
export function response(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}
