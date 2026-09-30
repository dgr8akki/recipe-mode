import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';

import { durations } from '../src/lib/durations.js';
import { canScan, clearHighlight, extractRecipe, highlightStep } from '../src/lib/page.js';
import { installDom } from './helpers.js';

let restore = () => {};
afterEach(() => restore());
const load = (html) => (restore = installDom(html));

const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe('extractRecipe', () => {
  it('reads schema.org JSON-LD inside an @graph, with sections and HTML entities', () => {
    load(
      `<html><head><title>Site</title>${jsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', name: 'Page' },
          {
            '@type': 'Recipe',
            name: 'Mac &amp; cheese',
            recipeIngredient: ['200g macaroni', ' 50g  butter ', ''],
            recipeInstructions: [
              {
                '@type': 'HowToSection',
                name: 'Pasta',
                itemListElement: [
                  { '@type': 'HowToStep', text: 'Boil the <b>pasta</b> for 8 mins.' },
                  { '@type': 'HowToStep', text: 'Drain.' },
                ],
              },
              { '@type': 'HowToStep', text: 'Stir in the cheese &amp; serve.' },
            ],
          },
        ],
      })}</head><body></body></html>`,
    );

    assert.deepEqual(extractRecipe(), {
      title: 'Mac & cheese',
      ingredients: ['200g macaroni', '50g butter'],
      steps: ['Boil the pasta for 8 mins.', 'Drain.', 'Stir in the cheese & serve.'],
    });
  });

  it('accepts instructions as one string, @type arrays, and skips broken JSON-LD blocks', () => {
    load(`<html><head>
      <script type="application/ld+json">{ not json</script>
      ${jsonLd({ '@type': ['Recipe', 'NewsArticle'], name: 'Toast', recipeInstructions: 'Toast the bread.\nButter it.' })}
    </head><body></body></html>`);
    assert.deepEqual(extractRecipe(), { title: 'Toast', ingredients: [], steps: ['Toast the bread.', 'Butter it.'] });
  });

  it('falls back to lists under Ingredients and Method headings', () => {
    load(`<html><head><title>Grandma's soup</title></head><body>
      <h2>Ingredients</h2><ul><li>1 onion</li><li>2 carrots</li></ul>
      <section><h2>Method</h2></section>
      <div><ol><li>Chop everything.</li><li>Simmer for 20 minutes.</li></ol></div>
    </body></html>`);
    assert.deepEqual(extractRecipe(), {
      title: "Grandma's soup",
      ingredients: ['1 onion', '2 carrots'],
      steps: ['Chop everything.', 'Simmer for 20 minutes.'],
    });
  });

  it('reads the bundled sample recipe, which has a step timer to try', () => {
    load(readFileSync(new URL('../src/demo/lemon-drizzle.html', import.meta.url), 'utf8'));
    const recipe = extractRecipe();
    assert.equal(recipe.title, 'Lemon drizzle cake');
    assert.equal(recipe.steps.length, 7);
    assert.ok(recipe.ingredients.length >= 6);
    assert.ok(
      recipe.steps.some((step) => durations(step).some((time) => time.seconds === 1800)),
      'a step mentions 30 minutes, so the sample shows a Start the 30 mins timer button',
    );
    // The steps are also in the page body, so highlightStep can outline them.
    assert.equal(highlightStep(recipe.steps[0]), true);
  });

  it('finds the method list when its heading shares a section with the ingredients list', () => {
    load(`<html><head><title>Sheet-pan salmon</title></head><body>
      <section class="recipe">
        <h2>Ingredients</h2>
        <ul><li>2 salmon fillets</li><li>1 lemon</li></ul>
        <h2>Method</h2>
        <ol><li>Heat the oven to 200C.</li><li>Roast for 12 minutes.</li></ol>
      </section>
    </body></html>`);
    assert.deepEqual(extractRecipe(), {
      title: 'Sheet-pan salmon',
      ingredients: ['2 salmon fillets', '1 lemon'],
      steps: ['Heat the oven to 200C.', 'Roast for 12 minutes.'],
    });
  });

  it('does not turn a HowToSection without items into a step named after the section', () => {
    load(
      `<html><head>${jsonLd({
        '@type': 'Recipe',
        name: 'Two-part bake',
        recipeInstructions: [
          { '@type': 'HowToSection', name: 'For the base' },
          { '@type': 'HowToStep', text: 'Crush the biscuits.' },
          { '@type': 'HowToSection', name: 'For the filling', text: 'Beat the cheese with the sugar.' },
        ],
      })}</head><body></body></html>`,
    );
    assert.deepEqual(extractRecipe().steps, ['Crush the biscuits.', 'Beat the cheese with the sugar.']);
  });

  it('returns null on pages without a recipe', () => {
    load('<html><head><title>News</title></head><body><h1>Headlines</h1><p>Nothing to cook.</p></body></html>');
    assert.equal(extractRecipe(), null);
  });

  it('returns null for a Recipe without instructions', () => {
    load(`<html><head>${jsonLd({ '@type': 'Recipe', name: 'Empty' })}</head><body></body></html>`);
    assert.equal(extractRecipe(), null);
  });
});

describe('highlightStep', () => {
  const page = `<html><body><ol>
    <li id="one">Heat   the oven to 180C.</li>
    <li id="two">Cream the butter and sugar until light and fluffy.</li>
  </ol><p id="note">Tip: cream the butter and sugar until light and fluffy for the best rise.</p></body></html>`;

  it('outlines and scrolls to the smallest element containing the step', () => {
    load(page);
    assert.equal(highlightStep('Cream the butter and sugar until light and fluffy.'), true);
    const two = globalThis.document.getElementById('two');
    assert.match(two.style.outline, /4px solid/);
    assert.equal(globalThis.window.lastScrolledTo, two);
  });

  it('matches despite whitespace differences and clears the previous highlight', () => {
    load(page);
    highlightStep('Cream the butter and sugar until light and fluffy.');
    assert.equal(highlightStep('Heat the oven to 180C.'), true);
    assert.equal(globalThis.document.getElementById('two').style.outline, '');
    assert.match(globalThis.document.getElementById('one').style.outline, /4px solid/);
  });

  it('reads layout-forcing innerText only for the element it will outline', () => {
    load(page);
    const proto = globalThis.window.HTMLElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'innerText');
    const reads = [];
    Object.defineProperty(proto, 'innerText', {
      configurable: true,
      get() {
        reads.push(this.id);
        return this.textContent;
      },
    });
    try {
      assert.equal(highlightStep('Cream the butter and sugar until light and fluffy.'), true);
    } finally {
      if (original) Object.defineProperty(proto, 'innerText', original);
      else delete proto.innerText;
    }
    assert.ok(reads.length <= 1, `innerText read ${reads.length} times: ${reads.join(', ')}`);
  });

  it('clears the outline and puts back the inline one the page had', () => {
    load(page.replace('<li id="two">', '<li id="two" style="outline: 1px dotted green">'));
    highlightStep('Cream the butter and sugar until light and fluffy.');
    const two = globalThis.document.getElementById('two');
    assert.match(two.style.outline, /4px solid/);

    assert.equal(clearHighlight(), 1);
    assert.equal(two.style.outline, '1px dotted green');
    assert.equal(two.style.outlineOffset, '');
    assert.equal(two.hasAttribute('data-recipe-mode-outline'), false);
    assert.equal(clearHighlight(), 0, 'nothing left to clear');
  });

  it('reports steps that are not on the page', () => {
    load(page);
    assert.equal(highlightStep('Garnish with parsley.'), false);
  });
});

describe('canScan', () => {
  const own = 'chrome-extension://abcdefghijklmnop/';
  it("only injects into web pages and the extension's own sample recipe", () => {
    assert.equal(canScan('https://www.bbcgoodfood.com/recipes/lemon-drizzle', own), true);
    assert.equal(canScan('http://intranet.local/recipes', own), true);
    assert.equal(canScan(`${own}demo/lemon-drizzle.html`, own), true);
    for (const url of [
      'chrome://extensions',
      'chrome://newtab/',
      'about:blank',
      'file:///tmp/recipe.html',
      '',
      undefined,
    ]) {
      assert.equal(canScan(url, own), false, String(url));
    }
    assert.equal(canScan('chrome-extension://otherextension/page.html', own), false, "someone else's extension");
  });
});
