// Sends real phrases to the real model and checks the intent that comes back. Needs a key in .env
// (TYPESAFE_API_KEY, or AI_GATEWAY_API_KEY to go through Vercel); CI never runs this.
//
//   npm run live
//
// TypeSafe answers bursts with 429 and now and then a 5xx; a case is only wrong if it answers.
import { interpret, ingredientsForStep } from '../../src/lib/assistant.js';
import { createJevClient } from '../../src/lib/jev.js';

const GIVE_UP_AFTER = 6;

// A weeknight dal, the recipe this gets tested against most.
const recipe = {
  title: 'Red lentil dal',
  ingredients: [
    '200g red lentils',
    '750ml water',
    '1 tsp turmeric',
    '1 onion, finely chopped',
    '2 tbsp ghee',
    '3 garlic cloves, crushed',
    'A thumb of ginger, grated',
    '1 tsp cumin seeds',
    '1 tsp salt',
    'Juice of half a lemon',
  ],
  steps: [
    'Rinse the lentils and put them in a pan with the water and the turmeric.',
    'Bring to the boil, then simmer for 20 minutes until the lentils are soft.',
    'Fry the onion in the ghee for 8 minutes until golden, then add the garlic, ginger and cumin seeds for 1 minute.',
    'Stir the onion mix into the lentils with the salt and the lemon juice.',
    'Rest for 5 minutes, then serve with rice.',
  ],
};

// [what the cook said, final transcript?, current step (0-based), what should come back]
const cases = [
  ['next step', true, 0, (r) => r?.action === 'next'],
  ['okay next', false, 0, (r) => r?.action === 'next'],
  ['how much', false, 0, (r) => r === null],
  ['how much ghee do I need', true, 2, (r) => r?.action === 'amount' && r.ingredient === 4],
  ['wait what was that', true, 2, (r) => r?.action === 'repeat'],
  ['go to the step where I fry the onion', true, 0, (r) => r?.action === 'goto' && r.step === 2],
  ['start over', true, 3, (r) => r?.action === 'restart'],
  ['go back', false, 3, (r) => r === null],
  ['go back to step 2', true, 3, (r) => r?.action === 'goto' && r.step === 1],
  ['set a timer', true, 1, (r) => r?.action === 'timer' && r.time?.seconds === 1200],
  ['set a timer for 12 minutes', true, 0, (r) => r?.action === 'timer' && r.time?.seconds === 720],
  ['start the timer for the onion', true, 2, (r) => r?.action === 'timer' && r.time?.seconds === 480],
  ['how long is left', true, 3, (r) => r?.action === 'timer_left'],
  ['what do I need for this step', true, 2, (r) => r?.action === 'step_ingredients'],
  ['honey can you pass me the salt', true, 1, (r) => r?.action === 'none'],
];

const provider = process.env.TYPESAFE_API_KEY ? 'typesafe' : 'vercel';
const key = process.env.TYPESAFE_API_KEY || process.env.AI_GATEWAY_API_KEY;
if (!key) {
  console.error('Put TYPESAFE_API_KEY or AI_GATEWAY_API_KEY in .env to run this.');
  process.exit(1);
}
console.log(`Provider: ${provider}\n`);
const jev = createJevClient({ getKey: () => key, getProvider: () => provider });

/** Waits out rate limits and outages, up to GIVE_UP_AFTER tries; any other error is the case's own. */
async function patiently(fn) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const outage = error.status >= 500;
      if (!(error.busy || outage) || attempt === GIVE_UP_AFTER) throw error;
      const wait = error.retryAfter || 5 * attempt;
      process.stdout.write(`  (${outage ? 'provider down' : 'rate-limited'}, waiting ${wait}s)\n`);
      await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
    }
  }
}

let failures = 0;
const report = (ok, name, detail) => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(56)} ${detail}`);
};

for (const [said, final, step, expect] of cases) {
  const name = `${final ? '' : '(partial) '}"${said}" at step ${step + 1}`;
  try {
    const started = performance.now();
    const intent = await patiently(() => interpret(jev, { transcript: said, final, recipe, step }));
    report(expect(intent), name, `${JSON.stringify(intent)} ${Math.round(performance.now() - started)}ms`);
  } catch (error) {
    report(false, name, error.message);
  }
}

try {
  const needed = await patiently(() => ingredientsForStep(jev, recipe, 2));
  const expected = recipe.ingredients.slice(3, 8);
  report(JSON.stringify(needed) === JSON.stringify(expected), 'ingredients for step 3', JSON.stringify(needed));
} catch (error) {
  report(false, 'ingredients for step 3', error.message);
}

console.log(failures ? `\n${failures} failed` : `\nAll ${cases.length + 1} passed`);
process.exit(failures ? 1 : 0);
