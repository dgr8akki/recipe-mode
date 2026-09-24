// Live evaluation against the real Jev model: checks that spoken requests map to
// the right intent. Needs AI_GATEWAY_API_KEY (see .env.example); not run in CI.
//
//   npm run eval
//
// TypeSafe rate-limits bursts and has brief outages, so each case waits and retries.
import { interpret, ingredientsForStep } from '../src/lib/assistant.js';
import { createJevClient } from '../src/lib/jev.js';

const MAX_ATTEMPTS = 6;

const recipe = {
  title: 'Banana bread',
  ingredients: [
    '140g butter, softened',
    '140g caster sugar',
    '2 large eggs',
    '140g self-raising flour',
    '1 tsp baking powder',
    '2 very ripe bananas, mashed',
    '50g icing sugar',
  ],
  steps: [
    'Heat oven to 180C/160C fan/gas 4. Butter a 2lb loaf tin and line with baking parchment.',
    'Cream the butter and the caster sugar until light and fluffy, then slowly add the eggs with a little of the flour.',
    'Fold in the remaining flour, baking powder and bananas.',
    'Pour into the tin and bake for about 30 mins until a skewer comes out clean.',
    'Cool in the tin for 10 mins, then remove to a wire rack. Mix the icing sugar with 2-3 tsp water and drizzle over the cake.',
  ],
};

// [what the cook said, final transcript?, current step (0-based), expectation]
const cases = [
  ['next step', true, 0, (r) => r?.action === 'next'],
  ['okay next', false, 0, (r) => r?.action === 'next'],
  ['how much', false, 0, (r) => r === null],
  ['how much butter do I need', true, 1, (r) => r?.action === 'amount' && r.ingredient === 0],
  ['wait what was that', true, 2, (r) => r?.action === 'repeat'],
  ['go to the step where I pour it into the tin', true, 0, (r) => r?.action === 'goto' && r.step === 3],
  ['start over', true, 3, (r) => r?.action === 'restart'],
  ['go back', false, 3, (r) => r === null],
  ['go back to step 2', true, 3, (r) => r?.action === 'goto' && r.step === 1],
  ['set a timer', true, 3, (r) => r?.action === 'timer' && r.time?.seconds === 1800],
  ['set a timer for 12 minutes', true, 0, (r) => r?.action === 'timer' && r.time?.seconds === 720],
  ['start the timer for the cooling', true, 4, (r) => r?.action === 'timer' && r.time?.seconds === 600],
  ['how long is left', true, 3, (r) => r?.action === 'timer_left'],
  ['what do I need for this step', true, 2, (r) => r?.action === 'step_ingredients'],
  ['honey can you pass me the salt', true, 1, (r) => r?.action === 'none'],
];

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error('Set AI_GATEWAY_API_KEY (see .env.example) to run the live evaluation.');
  process.exit(1);
}
const jev = createJevClient({ getKey: () => process.env.AI_GATEWAY_API_KEY });

/** Runs `fn`, waiting out rate limits and outages; other errors fail the case. */
async function withRetry(fn) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      // Rate limits and TypeSafe outages are infrastructure, not wrong answers: wait and retry.
      const outage = error.status >= 500;
      if (!(error.busy || outage) || attempt === MAX_ATTEMPTS) throw error;
      const wait = error.retryAfter || 5 * attempt;
      process.stdout.write(`  (${outage ? 'service unavailable' : 'rate-limited'}, waiting ${wait}s)\n`);
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
    const intent = await withRetry(() => interpret(jev, { transcript: said, final, recipe, step }));
    report(expect(intent), name, `${JSON.stringify(intent)} ${Math.round(performance.now() - started)}ms`);
  } catch (error) {
    report(false, name, error.message);
  }
}

try {
  const needed = await withRetry(() => ingredientsForStep(jev, recipe, 2));
  const expected = recipe.ingredients.slice(3, 6);
  report(JSON.stringify(needed) === JSON.stringify(expected), 'ingredients for step 3', JSON.stringify(needed));
} catch (error) {
  report(false, 'ingredients for step 3', error.message);
}

console.log(failures ? `\n${failures} failed` : `\nAll ${cases.length + 1} passed`);
process.exit(failures ? 1 : 0);
