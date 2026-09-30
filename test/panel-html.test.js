import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../src/panel/panel.html', import.meta.url), 'utf8');
const { document } = new JSDOM(html).window;
const $ = (id) => document.getElementById(id);

describe('panel markup', () => {
  it('does not announce the timer rail, which re-renders twice a second', () => {
    assert.equal($('timers').hasAttribute('aria-live'), false);
    const time = $('timer-template').content.querySelector('.timer-time');
    assert.equal(time.getAttribute('role'), 'timer', 'role=timer is aria-live=off by default');
  });

  it('shows the words being heard without announcing them word by word', () => {
    assert.equal($('heard').hasAttribute('aria-live'), false);
    // Listening status shares the element, so a live region here would also read every status line.
    assert.equal(document.querySelectorAll('.voice [aria-live]').length, 0);
  });

  it('tells the cook that the open panel checks every page for a recipe', () => {
    assert.match($('empty').textContent, /each page you view/i);
  });

  it('keeps the activity log as the one place timer starts and finishes are announced', () => {
    assert.equal($('activity').getAttribute('aria-live'), 'polite');
  });
});
