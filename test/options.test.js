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
 * Loads options.js fresh against the real options.html and a chrome double.
 * `reply` answers the key check: a Response, or an Error for fetch to reject with.
 */
async function load({ local = {}, reply = okReply() } = {}) {
  const chrome = fakeChrome({ local });
  restore = installPage(html, chrome);
  globalThis.fetch = async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  };
  await import(`../src/options/options.js?case=${seq}`);
  await import(`../src/options/sample.js?case=${seq++}`);
  await settle();
  const $ = (id) => globalThis.document.getElementById(id);
  return { chrome, $, document: globalThis.document, window: globalThis.window };
}

const okReply = () => Response.json({ answers: { ok: { type: 'choice', choice: 'yes', confidence: 0.9 } } });

async function connect({ $, window }, key = 'vck_0123456789abcdef') {
  $('api-key').value = key;
  $('key-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  for (let i = 0; i < 4; i++) await settle(); // key check, storage write, render
}

describe('options page', () => {
  it('saves a working key and shows the connected state', async () => {
    const page = await load();
    await connect(page);
    assert.equal(page.chrome.storage.local.store.apiKey, 'vck_0123456789abcdef');
    assert.equal(page.$('connected').hidden, false);
    assert.match(page.$('status').textContent, /^Key works\./);
  });

  it('moves focus to Test after connecting, so keyboard users are not dropped on <body>', async () => {
    const page = await load();
    await connect(page);
    assert.equal(page.document.activeElement, page.$('test'));
  });

  it('moves focus to Replace after cancelling a replacement', async () => {
    const page = await load({ local: { apiKey: 'vck_saved_key_1234567890', provider: 'vercel' } });
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
        assert.equal(page.$('status').className, 'status error');
        assert.equal(page.$('status').textContent, 'Unexpected reply from ai-gateway.vercel.sh.');
        assert.equal(errors.mock.callCount(), 1, 'console.error');
        assert.ok(errors.mock.calls[0].arguments.at(-1) instanceof Error, 'logged with the cause');
      });
    }
  });

  it('names the host when it cannot be reached, and does not blame the key', async () => {
    const page = await load({ reply: new TypeError('Failed to fetch') });
    await connect(page);
    assert.equal(page.chrome.storage.local.store.apiKey, undefined);
    assert.equal(
      page.$('status').textContent,
      "Can't reach ai-gateway.vercel.sh. Check your connection and try again.",
    );
    assert.equal(page.$('status').className, 'status error');
    assert.equal(page.$('api-key').getAttribute('aria-invalid'), 'false', 'the key is not what is wrong');
    assert.equal(errors.mock.callCount(), 1);
  });

  it('marks the key invalid when the provider rejects it', async () => {
    const page = await load({ reply: Response.json({ error: { message: 'nope' } }, { status: 401 }) });
    await connect(page);
    assert.equal(page.$('status').textContent, 'Your API key was rejected. Check it in settings.');
    assert.equal(page.$('api-key').getAttribute('aria-invalid'), 'true');
  });

  it('opens the bundled sample recipe in a tab, key or no key', async () => {
    const page = await load();
    page.$('sample').click();
    assert.deepEqual(page.chrome.openedTabs, [{ url: 'chrome-extension://test/demo/lemon-drizzle.html' }]);
  });
});
