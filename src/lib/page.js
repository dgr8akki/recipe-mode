/**
 * Functions injected into the recipe tab with `chrome.scripting.executeScript`. Chrome serialises
 * each one on its own, so nothing here may import anything or reach into module scope.
 */

/**
 * Whether the panel should look for a recipe on a tab at all. Not injected:
 * the panel calls this before `executeScript`, so chrome://, file:// and
 * other extensions' pages are skipped up front rather than by catching the
 * rejection. The extension's own sample recipe is the one non-web page allowed.
 *
 * @param {string | undefined} url The tab's URL.
 * @param {string} ownOrigin `chrome.runtime.getURL('')`.
 */
export function canScan(url, ownOrigin) {
  if (!url) return false;
  return /^https?:\/\//.test(url) || url.startsWith(ownOrigin);
}

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
      // A section with no items is a heading ("For the base"), not something to do, unless it carries text.
      else if ([].concat(item['@type']).includes('HowToSection')) item.text && steps.push(clean(item.text));
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
 * Removes the step outline, restoring whatever inline outline the page had.
 * The panel runs this when it closes or moves to another recipe tab, so a
 * page is not left with a red box on it. Same loop as in `highlightStep`;
 * injected functions cannot share code.
 *
 * @returns {number} How many elements were cleared.
 */
export function clearHighlight() {
  const ATTR = 'data-recipe-mode-outline';
  const marked = document.querySelectorAll(`[${ATTR}]`);
  for (const el of marked) {
    el.style.outline = el.getAttribute(ATTR);
    el.style.outlineOffset = '';
    el.removeAttribute(ATTR);
  }
  return marked.length;
}

/** Outlines the element holding a step and scrolls it into view. @returns {boolean} found */
export function highlightStep(stepText) {
  const ATTR = 'data-recipe-mode-outline';
  for (const el of document.querySelectorAll(`[${ATTR}]`)) {
    el.style.outline = el.getAttribute(ATTR);
    el.style.outlineOffset = '';
    el.removeAttribute(ATTR);
  }

  const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const needle = normalize(stepText).slice(0, 50);
  // The smallest element containing the step's opening words is the step itself. textContent, read
  // once per element: innerText forces layout, and recipe pages carry hundreds of comment paragraphs.
  const target = [...document.querySelectorAll('li, p')]
    .map((el) => {
      const text = normalize(el.textContent);
      return { el, length: text.length, hit: text.includes(needle) };
    })
    .filter((c) => c.hit)
    .sort((a, b) => a.length - b.length)[0]?.el;
  if (!target) return false;

  target.setAttribute(ATTR, target.style.outline);
  target.style.outline = '4px solid #ec3013';
  target.style.outlineOffset = '6px';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  return true;
}
