/**
 * Functions injected into the recipe tab with `chrome.scripting.executeScript`.
 *
 * Chrome serialises each function on its own, so every function here must be
 * self-contained: no imports, no references to module scope.
 *
 * @module lib/page
 */

/**
 * Reads the recipe on the current page.
 *
 * Uses schema.org `Recipe` JSON-LD first (most recipe sites publish it for
 * search engines), then falls back to lists under "Ingredients" and
 * "Method" / "Instructions" / "Directions" headings.
 *
 * @returns {{ title: string, ingredients: string[], steps: string[] } | null}
 */
export function extractRecipe() {
  const clean = (value) =>
    new DOMParser().parseFromString(String(value), 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
  const textOf = (el) => el.innerText ?? el.textContent;

  const nodes = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      nodes.push(node);
      if (node['@graph']) walk(node['@graph']);
    }
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(script.textContent));
    } catch {
      // Sites sometimes ship invalid JSON-LD; ignore that block.
    }
  }

  const recipe = nodes.find((node) => [].concat(node['@type']).includes('Recipe'));
  if (recipe) {
    const steps = [];
    const addSteps = (item) => {
      if (!item) return;
      if (typeof item === 'string') {
        item
          .split(/\n+/)
          .map(clean)
          .filter(Boolean)
          .forEach((text) => steps.push(text));
      } else if (Array.isArray(item)) item.forEach(addSteps);
      else if (item.itemListElement)
        addSteps(item.itemListElement); // HowToSection
      else if (item.text || item.name) steps.push(clean(item.text || item.name)); // HowToStep
    };
    addSteps(recipe.recipeInstructions);
    const ingredients = []
      .concat(recipe.recipeIngredient ?? recipe.ingredients ?? [])
      .map(clean)
      .filter(Boolean);
    return steps.length ? { title: clean(recipe.name || document.title), ingredients, steps } : null;
  }

  const listAfterHeading = (pattern) => {
    const heading = [...document.querySelectorAll('h1, h2, h3, h4')].find((h) => pattern.test(h.textContent));
    let el = heading;
    for (let hops = 0; el && hops < 10; hops += 1) {
      el = el.nextElementSibling ?? el.parentElement?.nextElementSibling;
      const list = el?.matches?.('ul, ol') ? el : el?.querySelector?.('ul, ol');
      if (list) return [...list.querySelectorAll('li')].map((li) => clean(textOf(li))).filter(Boolean);
    }
    return [];
  };
  const steps = listAfterHeading(/method|instructions|directions|steps/i);
  if (!steps.length) return null;
  return { title: document.title, ingredients: listAfterHeading(/ingredients/i), steps };
}

/**
 * Outlines the element holding a step and scrolls it into view.
 *
 * @param {string} stepText
 * @returns {boolean} Whether the step was found on the page.
 */
export function highlightStep(stepText) {
  const ATTR = 'data-recipe-mode-outline';
  for (const el of document.querySelectorAll(`[${ATTR}]`)) {
    el.style.outline = el.getAttribute(ATTR);
    el.style.outlineOffset = '';
    el.removeAttribute(ATTR);
  }

  const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const needle = normalize(stepText).slice(0, 50);
  const textOf = (el) => normalize(el.innerText ?? el.textContent);
  // The smallest element containing the step's opening words is the step itself.
  const target = [...document.querySelectorAll('li, p')]
    .filter((el) => textOf(el).includes(needle))
    .sort((a, b) => textOf(a).length - textOf(b).length)[0];
  if (!target) return false;

  target.setAttribute(ATTR, target.style.outline);
  target.style.outline = '3px solid #4d7c5a';
  target.style.outlineOffset = '4px';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  return true;
}
