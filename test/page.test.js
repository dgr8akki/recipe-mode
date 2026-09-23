import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { extractRecipe, highlightStep } from '../src/lib/page.js';
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
    assert.match(two.style.outline, /3px solid/);
    assert.equal(globalThis.window.lastScrolledTo, two);
  });

  it('matches despite whitespace differences and clears the previous highlight', () => {
    load(page);
    highlightStep('Cream the butter and sugar until light and fluffy.');
    assert.equal(highlightStep('Heat the oven to 180C.'), true);
    assert.equal(globalThis.document.getElementById('two').style.outline, '');
    assert.match(globalThis.document.getElementById('one').style.outline, /3px solid/);
  });

  it('reports steps that are not on the page', () => {
    load(page);
    assert.equal(highlightStep('Garnish with parsley.'), false);
  });
});
