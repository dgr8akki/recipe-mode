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

  it('shows a request in flight, and the reduced-motion override can actually win', () => {
    assert.match(css, /\.thinking \.heard\.live::after \{\s*content: ' …';/);
    // jsdom cannot compute the cascade, so compare what decides it: specificity, then order.
    const specificity = (selector) => [
      (selector.match(/#[\w-]+/g) ?? []).length,
      (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length,
      (selector.match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length,
    ];
    const higherOrEqual = (a, b) => a.every((n, i) => n >= b[i]);
    const pulse = css.match(/^([^{@\n][^{]*\.rec)\s*\{\s*animation: rec-pulse/m);
    assert.ok(pulse, 'the pulse rule exists');
    const reducedBlock = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
    const override = reducedBlock.match(/^\s*([^{@\n][^{]*\.rec)\s*\{\s*animation: none/m);
    assert.ok(override, 'the reduced-motion block resets the pulse');
    assert.ok(
      higherOrEqual(specificity(override[1].trim()), specificity(pulse[1].trim())),
      `override "${override[1].trim()}" is weaker than "${pulse[1].trim()}"`,
    );
    assert.ok(css.indexOf(override[0]) > css.indexOf(pulse[0]), 'the override comes later in the sheet');
  });

  it('names the settings section as a landmark', () => {
    const settings = $('settings');
    const heading = document.getElementById(settings.getAttribute('aria-labelledby'));
    assert.equal(heading?.tagName, 'H2');
    assert.equal(heading.textContent, 'Panel settings');
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
    assert.match(
      rule(css, '.voice'),
      /grid-template-columns: minmax\(0, 1fr\)/,
      'the mic label must wrap, not widen the dock',
    );
    assert.match(rule(css, '.timer-label'), /overflow-wrap: break-word/, 'labels wrap between words, not inside them');
    assert.doesNotMatch(css, /overflow-wrap: anywhere/);
    assert.match(rule(css, '.step-nav'), /grid-template-columns: auto minmax\(0, 1fr\)/, 'Back is sized to its label');
    // Container queries key off the rail's and dock's own width, so they also fire under CSS zoom.
    for (const sel of ['.timers', '.dock']) assert.match(rule(css, sel), /container-type: inline-size/);
    const narrow = css.slice(css.indexOf('@container (max-width: 300px)'));
    assert.match(narrow, /grid-template-areas:\s*'time remove'\s*'label remove'/, 'the label gets its own row');
    assert.match(narrow, /#prev \.nav-label \{\s*display: none/);
    assert.equal($('prev').getAttribute('aria-label'), 'Back', 'the name survives hiding the text');
  });

  it('declares both colour schemes before the stylesheet loads', () => {
    assert.equal(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'), 'light dark');
    assert.ok(document.querySelector('meta[name="description"]')?.getAttribute('content'));
  });

  it('puts the timer rail inside a named landmark', () => {
    const region = $('timers').closest('section[aria-label]');
    assert.equal(region?.getAttribute('aria-label'), 'Timers');
  });

  it('keeps the activity log as the one place timer starts and finishes are announced', () => {
    assert.equal($('activity').getAttribute('aria-live'), 'polite');
  });
});
