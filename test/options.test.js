import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { fakeChrome, installPage, settle } from './support.js';

const html = readFileSync(new URL('../src/options/options.html', import.meta.url), 'utf8');

let restore = () => {};
let seq = 0;
let errors;
beforeEach(() => {
  errors = mock.method(console, 'error', () => {});
});
afterEach(() => {
  restore();
  delete globalThis.fetch;
  errors.mock.restore();
});

/**
 * Loads the shared options.js and this repo's sample.js against the real options.html and a
 * chrome double. `reply` answers the key check: a Response, or an Error for fetch to reject with.
 */
async function load({ local = {}, reply = okReply() } = {}) {
  const chrome = fakeChrome({ local });
  restore = installPage(html, chrome);
  globalThis.fetch = async () => {
    if (reply instanceof Error) throw reply;
    return reply.clone();
  };
  await import(`../src/options/options.js?case=${seq}`);
  await import(`../src/options/sample.js?case=${seq}`);
  await import(`../src/options/reveal.js?case=${seq++}`);
  await settle();
  const $ = (id) => globalThis.document.getElementById(id);
  return { chrome, $, document: globalThis.document, window: globalThis.window };
}

const okReply = () => Response.json({ answers: { ok: { type: 'choice', choice: 'yes', confidence: 0.9 } } });
const KEY = 'vck_0123456789abcdef';

async function connect({ $, window }, key = KEY) {
  $('api-key').value = key;
  $('key-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  for (let i = 0; i < 4; i++) await settle(); // key check, storage write, render
}

describe('options page', () => {
  it('opens on the form with a Welcome kicker when no key is saved', async () => {
    const { $, document } = await load();
    assert.equal($('key-form').hidden, false);
    assert.equal($('connected').hidden, true);
    assert.equal($('kicker').textContent, 'Welcome');
    assert.equal(document.body.dataset.state, 'welcome');
    assert.match($('steps').innerHTML, /opens in a new tab/, 'external links say so');
  });

  it('saves a working key, shows the connected card and the next step from the page', async () => {
    const page = await load();
    await connect(page);
    assert.equal(page.chrome.storage.local.store.apiKey, KEY);
    assert.equal(page.$('connected').hidden, false);
    assert.equal(page.$('connected-status').textContent, 'Key works. Open a recipe, then the Recipe Mode side panel.');
    assert.equal(page.$('connected-status').dataset.tone, 'ok');
    assert.equal(page.$('kicker').textContent, 'Settings');
  });

  it('moves focus to Test after connecting and to Replace after cancelling', async () => {
    const page = await load();
    await connect(page);
    assert.equal(page.document.activeElement, page.$('test'));
    page.$('replace').click();
    assert.equal(page.$('key-form').hidden, false);
    page.$('cancel').click();
    assert.equal(page.$('key-form').hidden, true);
    assert.equal(page.document.activeElement, page.$('replace'));
  });

  describe('does not save a key the provider did not really vouch for', () => {
    const cases = {
      'a 200 with an empty body': () => new Response('{}', { status: 200 }),
      'a 200 that is not JSON': () => new Response('<html>captive portal</html>', { status: 200 }),
      'a 200 whose answer has no choice': () => Response.json({ answers: { ok: { type: 'choice' } } }),
    };
    for (const [name, reply] of Object.entries(cases)) {
      it(name, async () => {
        const page = await load({ reply: reply() });
        await connect(page);
        assert.equal(page.chrome.storage.local.store.apiKey, undefined, 'key was saved');
        assert.equal(page.$('key-form').hidden, false);
        assert.equal(page.$('key-status').dataset.tone, 'error');
        assert.equal(page.$('key-status').textContent, 'Unexpected reply from ai-gateway.vercel.sh.');
        assert.equal(page.$('api-key').getAttribute('aria-invalid'), 'false', "a garbled reply is not the key's fault");
      });
    }
  });

  it('saves the key on a 429 but says the provider is busy instead of "Key works."', async () => {
    const page = await load({ reply: Response.json({}, { status: 429, headers: { 'retry-after': '120' } }) });
    await connect(page);
    assert.equal(page.chrome.storage.local.store.apiKey, KEY, 'a rate limit means the key was checked');
    assert.equal(page.$('connected-status').textContent, 'Key accepted; the provider is busy right now.');
    assert.equal(page.$('connected-status').dataset.tone, 'neutral');
  });

  it('names the host when it cannot be reached, and does not blame the key', async () => {
    const page = await load({ reply: new TypeError('Failed to fetch') });
    await connect(page);
    assert.equal(page.chrome.storage.local.store.apiKey, undefined);
    assert.equal(
      page.$('key-status').textContent,
      "Can't reach ai-gateway.vercel.sh. Check your connection and try again.",
    );
    assert.equal(page.$('key-status').dataset.tone, 'error');
    assert.equal(page.$('api-key').getAttribute('aria-invalid'), 'false');
    assert.equal(errors.mock.callCount(), 0, 'a provider verdict is not logged as an error');
  });

  it('marks the key invalid when the provider rejects it, and clears that on typing', async () => {
    const page = await load({ reply: Response.json({ error: { message: 'nope' } }, { status: 401 }) });
    await connect(page);
    assert.equal(page.$('key-status').textContent, 'Your API key was rejected. Check it in settings.');
    assert.equal(page.$('api-key').getAttribute('aria-invalid'), 'true');
    page.$('api-key').dispatchEvent(new page.window.Event('input'));
    assert.equal(page.$('api-key').getAttribute('aria-invalid'), 'false');
    assert.equal(page.$('key-status').textContent, '');
  });

  it('keeps every piece of content inside a landmark', async () => {
    const { document } = await load();
    const landmarks = 'header, main, footer, nav, section[aria-labelledby], [role]';
    const stray = [...document.body.querySelectorAll('h1, h2, p, button, input')].filter(
      (el) => !el.closest(landmarks),
    );
    assert.deepEqual(
      stray.map((el) => `${el.tagName.toLowerCase()}#${el.id}.${el.className}`),
      [],
    );
  });

  it('lets the cook see the key they pasted, and hides it again once it is saved', async () => {
    const page = await load({ local: { apiKey: 'vck_saved_key_1234567890', provider: 'vercel' } });
    page.$('replace').click();
    const input = page.$('api-key');
    const reveal = page.$('reveal');
    assert.equal(input.type, 'password');
    assert.equal(reveal.getAttribute('aria-pressed'), 'false');
    reveal.click();
    assert.equal(input.type, 'text');
    assert.equal(reveal.getAttribute('aria-pressed'), 'true');
    assert.equal(reveal.textContent.trim(), 'Hide');
    await connect(page);
    await settle();
    assert.equal(page.$('key-form').hidden, true);
    assert.equal(input.type, 'password', 'back to hidden for the next time the form opens');
    assert.equal(reveal.getAttribute('aria-pressed'), 'false');
  });

  it('opens the bundled sample recipe in a tab, key or no key', async () => {
    const page = await load();
    page.$('sample').click();
    assert.deepEqual(page.chrome.openedTabs, [{ url: 'chrome-extension://test/demo/lemon-drizzle.html' }]);
  });
});
