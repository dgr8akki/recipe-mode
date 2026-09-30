import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';

import { fakeChrome, installPage, settle } from './support.js';

const html = readFileSync(new URL('../src/panel/panel.html', import.meta.url), 'utf8');

const recipe = {
  title: 'Banana bread',
  ingredients: ['140g butter, softened', '2 large eggs'],
  steps: [
    'Heat the oven to 180C.',
    `Cream the butter and sugar, then add the eggs one at a time. ${'Beat well after each addition. '.repeat(6)}`,
    'Bake for 30 mins, then cool for 10 mins.',
  ],
};

/** Jev stand-in: picks the action from the command text and always picks the first ingredient. */
function answersFor({ state, questions }) {
  const command = (state.command ?? '').toLowerCase();
  const action = /how much/.test(command)
    ? 'amount'
    : /timer/.test(command)
      ? 'timer'
      : /back/.test(command)
        ? 'prev'
        : 'next';
  const choice = (value) => ({ type: 'choice', choice: value, confidence: 0.95, probabilities: { [value]: 0.95 } });
  return Object.fromEntries(
    Object.entries(questions).map(([name, q]) => {
      if (name === 'action') return [name, choice(action)];
      if (name === 'ingredient') return [name, choice(/butter/.test(command) ? 'i0' : 'none')];
      if (q.type === 'choice') return [name, choice(Object.keys(q.criteria)[0])];
      return [name, { type: 'boolean', probability: 0.9 }];
    }),
  );
}

let restore = () => {};
let seq = 0;
afterEach(() => {
  restore();
  delete globalThis.fetch;
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
});

/** Loads panel.js against the real panel.html, a recipe tab and a chrome double. */
async function load({ key = 'vck_0123456789abcdef', fetchReply } = {}) {
  const chrome = fakeChrome({
    local: key ? { apiKey: key, provider: 'vercel', readAloud: true } : {},
    tabs: [{ id: 7, url: 'https://recipes.example/banana-bread', active: true }],
    pageResults: { extractRecipe: recipe, highlightStep: true, clearHighlight: 0 },
  });
  restore = installPage(html, chrome);
  const spoken = [];
  globalThis.speechSynthesis = { speak: (u) => spoken.push(u.text), cancel() {}, getVoices: () => [{ lang: 'en-US' }] };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  globalThis.fetch = async (_url, init) => {
    if (fetchReply) return fetchReply();
    return Response.json({ answers: answersFor(JSON.parse(init.body)) });
  };
  await import(`../src/panel/panel.js?case=${seq++}`);
  for (let i = 0; i < 6; i++) await settle(); // storage, connection, timers, recipe tab
  const $ = (id) => globalThis.document.getElementById(id);
  return { chrome, spoken, $, document: globalThis.document, window: globalThis.window };
}

async function type(ctx, text) {
  ctx.$('command').value = text;
  ctx.$('command-form').dispatchEvent(new ctx.window.Event('submit', { cancelable: true }));
  for (let i = 0; i < 8; i++) await settle(); // queue, Jev call, perform
}

/** Each activity entry as its spans joined by one space. */
const activity = ($) =>
  [...$('activity').children].map((li) =>
    [...li.children]
      .map((span) => span.textContent.trim())
      .filter(Boolean)
      .join(' '),
  );

describe('panel', () => {
  it('reads the recipe from the active tab and renders the first step', async () => {
    const { $, chrome } = await load();
    assert.equal($('recipe').hidden, false);
    assert.equal($('title').textContent, 'Banana bread');
    assert.equal($('title').title, 'Banana bread');
    assert.equal($('step-count').textContent, 'Step 1 of 3');
    assert.equal($('prev').disabled, true);
    assert.equal($('next-label').textContent, 'Next step');
    assert.equal($('up-next-text').textContent, recipe.steps[1]);
    assert.equal($('ingredients-summary').textContent, 'Ingredients (2)');
    assert.deepEqual(
      chrome.injected.map((call) => call.func),
      ['extractRecipe', 'highlightStep'],
    );
  });

  it('drops a size for a long step and turns Next into Finish on the last one', async () => {
    const { $ } = await load();
    $('next').click();
    assert.equal($('step-text').classList.contains('long'), true);
    assert.equal($('step-timers').children.length, 0, 'no time in this step');
    $('next').click();
    assert.equal($('step-count').textContent, 'Step 3 of 3');
    assert.equal($('step-text').classList.contains('long'), false);
    assert.equal($('next-label').textContent, 'Finish');
    assert.equal($('next').classList.contains('last'), true);
    assert.equal($('up-next').hidden, true);
    assert.deepEqual(
      [...$('step-timers').children].map((b) => b.textContent),
      ['Start the 30 mins timer', 'Start the 10 mins timer'],
    );
  });

  it('runs a typed command through Jev and shows the outcome where "Thinking…" was', async () => {
    const ctx = await load();
    await type(ctx, 'next');
    assert.equal(ctx.$('step-count').textContent, 'Step 2 of 3');
    const [entry] = activity(ctx.$);
    assert.match(entry, /^“next” Next step in \d+ ms$/);
    assert.equal(activity(ctx.$).length, 1, 'the pending entry was reused, not duplicated');
    assert.equal(ctx.document.body.classList.contains('thinking'), false);
    assert.equal(ctx.spoken.join(' '), `Step 2. ${recipe.steps[1].trim()}`);
  });

  it('attaches an answer to the command that asked, and gives other answers their own entry', async () => {
    const ctx = await load();
    await type(ctx, 'how much butter');
    const [entry] = activity(ctx.$);
    assert.match(entry, /^“how much butter” Read an ingredient in \d+ ms 140g butter, softened$/);
    assert.ok(ctx.$('activity').firstElementChild.querySelector('.reply'), 'reply under the command');

    ctx.$('next').click();
    ctx.$('next').click();
    ctx.$('step-timers').firstElementChild.click(); // not a command: the answer stands alone
    const [headless] = activity(ctx.$);
    assert.equal(headless, 'Timer set for 30 minutes.');
    assert.equal(ctx.$('activity').firstElementChild.querySelector('.said'), null);
    ctx.$('timers').querySelector('.timer-remove').click(); // stops the tick so the test can end
  });

  it('shows a started timer in the rail with an alarm behind it, and removes both on ✕', async () => {
    const { $, chrome } = await load();
    $('next').click();
    $('next').click();
    $('step-timers').firstElementChild.click();
    await settle();
    const row = $('timers').querySelector('.timer');
    assert.equal(row.querySelector('.timer-label').textContent, 'Step 3: 30 mins');
    assert.equal(row.querySelector('.timer-time').textContent, '30:00');
    assert.equal(row.querySelector('.timer-remove').getAttribute('aria-label'), 'Remove Step 3: 30 mins timer');
    assert.deepEqual([...chrome.alarms.scheduled.keys()], ['timer:1']);
    assert.ok(chrome.storage.session.store.timers, 'saved for the service worker and other panels');

    row.querySelector('.timer-remove').click();
    await settle();
    assert.equal($('timers').children.length, 0);
    assert.equal(chrome.alarms.scheduled.size, 0);
    assert.deepEqual(chrome.storage.session.store.timers.list, []);
  });

  it('speaks and shows a network error for a final command', async () => {
    const ctx = await load({
      fetchReply: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await type(ctx, 'next');
    const [entry] = activity(ctx.$);
    assert.equal(entry, "“next” Can't reach ai-gateway.vercel.sh. Check your connection and try again.");
    assert.ok(ctx.$('activity').firstElementChild.querySelector('.error'));
    assert.equal(ctx.spoken.join(' '), "Can't reach ai-gateway.vercel.sh. Check your connection and try again.");
    assert.equal(ctx.$('step-count').textContent, 'Step 1 of 3');
  });

  it('goes back to the empty state when the recipe tab closes', async () => {
    const { $, chrome } = await load();
    chrome.tabs.onRemoved.fire(99);
    assert.equal($('recipe').hidden, false, 'another tab closing changes nothing');
    chrome.tabs.onRemoved.fire(7);
    assert.equal($('recipe').hidden, true);
    assert.equal($('empty').hidden, false);
    assert.equal($('dock').hidden, true);
  });

  it('without a key, sends the cook to settings instead of Jev', async () => {
    const ctx = await load({ key: '' });
    assert.equal(ctx.$('mic-label').textContent, 'Connect Jev for voice');
    assert.equal(ctx.$('command').placeholder, 'Voice and typed commands need Jev · Connect');
    assert.equal(ctx.$('settings').hidden, true, 'the drawer does not force itself open');
    await type(ctx, 'next');
    assert.deepEqual(ctx.chrome.opened, ['options']);
    assert.equal(ctx.$('step-count').textContent, 'Step 1 of 3');
    assert.deepEqual(activity(ctx.$), []);
  });
});
