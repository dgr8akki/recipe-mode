import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../src/panel/panel.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/panel/panel.css', import.meta.url), 'utf8');
const { document } = new JSDOM(html).window;
const $ = (id) => document.getElementById(id);
/** Declarations inside the rule for `selector`. */
const rule = (sheet, selector) => sheet.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))[1];

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

  it('shows a request in flight, without motion for those who asked for none', () => {
    assert.match(css, /\.thinking \.mic\[aria-pressed='true'\] \.rec \{\s*animation:/);
    assert.match(css, /\.thinking \.heard\.live::after \{\s*content: ' …';/);
    const reduced = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
    assert.match(reduced, /\.thinking \.mic \.rec \{\s*animation: none/);
  });

  it('names the settings section as a landmark', () => {
    const settings = $('settings');
    const heading = document.getElementById(settings.getAttribute('aria-labelledby'));
    assert.equal(heading?.tagName, 'H2');
    assert.equal(heading.textContent, 'Settings');
    assert.ok(heading.classList.contains('visually-hidden'));
  });

  it('shows the typed-command send button at every width, with a name', () => {
    assert.doesNotMatch(rule(css, '.command button'), /display: none/);
    assert.equal(document.querySelector('.command button[type="submit"]').getAttribute('aria-label'), 'Send command');
  });

  it('lets the page scroll and the rows shrink so the dock survives 200 % zoom', () => {
    assert.doesNotMatch(rule(css, 'body'), /overflow: hidden/);
    assert.match(rule(css, '.dock'), /max-height: 55vh;\s*overflow-y: auto/);
    assert.match(rule(css, '.timers'), /max-height: 30vh;\s*overflow-y: auto/);
    assert.match(rule(css, '.scroll'), /min-height: 120px/);
    assert.match(rule(css, '.timer'), /grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(rule(css, '.step-nav'), /minmax\(0, 1fr\) minmax\(0, 2fr\)/);
    assert.match(
      rule(css, '.voice'),
      /grid-template-columns: minmax\(0, 1fr\)/,
      'the mic label must wrap, not widen the dock',
    );
  });

  it('keeps the activity log as the one place timer starts and finishes are announced', () => {
    assert.equal($('activity').getAttribute('aria-live'), 'polite');
  });
});
