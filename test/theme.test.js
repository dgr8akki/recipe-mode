import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const theme = read('../src/theme.css');
const panel = read('../src/panel/panel.css');

/** Custom properties declared in the first `:root` block after `marker`. */
function tokens(css, marker) {
  const block = css.slice(css.indexOf(marker)).match(/:root\s*\{([^}]*)\}/)[1];
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrast(a, b) {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Declarations inside the rule for `selector`. */
const rule = (css, selector) => css.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))[1];

/** Composites an `rgb(r g b / a)` colour over a #rrggbb background. */
function over(rgba, hexBg) {
  const [r, g, b, a] = rgba.match(/[\d.]+/g).map(Number);
  const bg = [1, 3, 5].map((i) => parseInt(hexBg.slice(i, i + 2), 16));
  const mix = [r, g, b].map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

describe('theme', () => {
  const light = tokens(theme, ':root');
  const dark = tokens(theme, 'prefers-color-scheme: dark');

  it('draws input and tile borders at 3:1 or better in light mode', () => {
    // --rule is the only boundary of the command input, the key input, the provider tiles and the settings button.
    for (const surface of ['--bg', '--surface']) {
      const ratio = contrast(over(light['--rule'], light[surface]), light[surface]);
      assert.ok(ratio >= 3, `--rule on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  });

  it('gives placeholders the muted ink instead of the browser grey', () => {
    assert.match(theme, /::placeholder \{\s*color: var\(--muted\);\s*opacity: 1;/);
    for (const [name, t] of Object.entries({ light, dark })) {
      const ratio = contrast(t['--muted'], t['--surface']);
      assert.ok(ratio >= 4.5, `${name} placeholder is ${ratio.toFixed(2)}:1`);
    }
  });

  it('does not use the error red for the command input focus ring', () => {
    assert.match(rule(panel, '.command input:focus-visible'), /outline-color: var\(--ink\)/);
  });

  it('fills primary buttons with a red that passes 4.5:1 against their text', () => {
    // Connect buttons are 18px bold, just under large text, so the normal-text threshold applies.
    for (const [name, t] of Object.entries({ light, dark })) {
      assert.ok(t['--accent-fill'], `${name} has no --accent-fill`);
      const ratio = contrast(t['--accent-fill'], t['--on-accent']);
      assert.ok(ratio >= 4.5, `${name}: ${t['--accent-fill']} on ${t['--on-accent']} is ${ratio.toFixed(2)}:1`);
    }
  });

  it('uses --accent-fill for the fill and border of primary buttons, and keeps --accent for marks', () => {
    for (const [css, selector] of [
      [theme, '.btn.primary'],
      [panel, '.nav-button.primary'],
    ]) {
      const declarations = rule(css, selector);
      assert.match(declarations, /background:\s*var\(--accent-fill\)/, `${selector} background`);
      assert.match(declarations, /border-color:\s*var\(--accent-fill\)/, `${selector} border`);
    }
    assert.equal(light['--accent'], '#ec3013', 'the ruler, rec dot and focus ring keep the brighter red');
  });
});
