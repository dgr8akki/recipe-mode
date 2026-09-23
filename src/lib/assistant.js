/**
 * Turns what the cook says into an intent, using one Jev call per transcript.
 *
 * Jev only picks from lists built here: an action, a step, an ingredient line
 * and (when a step mentions several) which cooking time a timer is for.
 *
 * @module lib/assistant
 */

import { durations } from './durations.js';

/** Every intent the assistant understands, described for Jev. */
export const ACTIONS = {
  next: 'Go to the next step',
  prev: 'Go back to the previous step',
  repeat: 'Read the current step again ("what was that?", "say again")',
  goto: 'Jump to a specific step, by number or by what happens in it',
  restart: 'Start over from the first step',
  amount: 'Ask how much of an ingredient is needed, or what an ingredient line says',
  step_ingredients: 'Ask which ingredients are needed for the current step',
  all_ingredients: 'Ask for the whole ingredient list',
  timer: 'Set or start a timer',
  timer_left: 'Ask how much time is left on a timer',
  timer_cancel: 'Stop or cancel a timer',
  stop_talking: 'Tell the assistant to stop talking or be quiet',
  none: 'Not a request to the assistant (talking to someone else, chatter, unclear)',
};

/** Safe to act on a partial transcript once Jev says the request is complete. */
const EARLY_OK = new Set([
  'next',
  'prev',
  'repeat',
  'restart',
  'all_ingredients',
  'timer_left',
  'timer_cancel',
  'stop_talking',
]);

/**
 * Never followed by an argument, so a confident action alone is enough ("okay next…").
 * Not `prev`: "go back" may continue as "go back to step 2".
 */
const NO_ARGUMENTS = new Set(['next', 'repeat', 'stop_talking']);

/** Hand-tuned against the eval suite; lower acts sooner but misfires more. */
export const THRESHOLDS = { act: 0.5, early: 0.8, earlyNoArgs: 0.9, complete: 0.7 };

const MAX_OPTION_CHARS = 140;
const MAX_INGREDIENT_QUESTIONS = 40;

/**
 * @typedef {object} Recipe
 * @property {string} title
 * @property {string[]} ingredients
 * @property {string[]} steps
 */

/**
 * @typedef {object} Intent
 * @property {keyof typeof ACTIONS} action
 * @property {number | null} step Zero-based step the cook referred to, if any.
 * @property {number | null} ingredient Index into `recipe.ingredients`, if any.
 * @property {import('./durations.js').Duration | null} time
 */

/**
 * @param {import('./jev.js').JevClient} jev
 * @param {{ transcript: string, final: boolean, recipe: Recipe, step: number }} input
 * @returns {Promise<Intent | null>} `null` while a partial transcript isn't safe to act on.
 */
export async function interpret(jev, { transcript, final, recipe, step }) {
  const currentStep = recipe.steps[step] ?? '';
  const stepTimes = durations(currentStep);
  const answers = await jev.evaluate({
    state: {
      command: transcript,
      currentStep: step + 1,
      totalSteps: recipe.steps.length,
      currentStepText: currentStep,
    },
    questions: buildQuestions({ recipe, stepTimes, final }),
  });

  const action = answers.action.choice;
  const confidence = answers.action.confidence;
  if (!final && !readyEarly(action, confidence, answers.complete.probability)) return null;
  if (action === 'none' || confidence < THRESHOLDS.act) {
    return { action: 'none', step: null, ingredient: null, time: null };
  }

  // A time said out loud wins; otherwise the step's own time (Jev picks when there are several).
  const spoken = durations(transcript)[0];
  const fromStep = stepTimes.length > 1 ? stepTimes[pick(answers.time)] : stepTimes[0];
  return {
    action,
    step: pick(answers.step),
    ingredient: pick(answers.ingredient),
    time: spoken ?? fromStep ?? null,
  };
}

/**
 * Which ingredients does a step use? One yes/no question per ingredient, in one call.
 *
 * @param {import('./jev.js').JevClient} jev
 * @param {Recipe} recipe
 * @param {number} step
 * @returns {Promise<string[]>}
 */
export async function ingredientsForStep(jev, recipe, step) {
  const candidates = recipe.ingredients.slice(0, MAX_INGREDIENT_QUESTIONS);
  if (!candidates.length) return [];
  const answers = await jev.evaluate({
    state: { step: recipe.steps[step] },
    questions: Object.fromEntries(
      candidates.map((ingredient, i) => [
        `i${i}`,
        { type: 'boolean', instructions: `Is this ingredient used in this step: "${ingredient}"?` },
      ]),
    ),
  });
  return candidates.filter((_, i) => answers[`i${i}`].probability >= 0.5);
}

/** @param {{ recipe: Recipe, stepTimes: import('./durations.js').Duration[], final: boolean }} input */
export function buildQuestions({ recipe, stepTimes, final }) {
  const clip = (text) => (text.length > MAX_OPTION_CHARS ? `${text.slice(0, MAX_OPTION_CHARS)}…` : text);
  return {
    action: {
      type: 'choice',
      instructions: 'The cook is following this recipe hands-free. What do they want?',
      criteria: ACTIONS,
    },
    step: {
      type: 'choice',
      instructions: 'Which step does the cook refer to, by number or by what happens in it?',
      criteria: {
        ...Object.fromEntries(recipe.steps.map((text, i) => [`s${i}`, `Step ${i + 1}: ${clip(text)}`])),
        none: 'No specific step',
      },
    },
    ingredient: {
      type: 'choice',
      instructions: 'Which ingredient does the cook ask about?',
      criteria: {
        ...Object.fromEntries(recipe.ingredients.map((line, i) => [`i${i}`, clip(line)])),
        none: 'No ingredient mentioned',
      },
    },
    ...(stepTimes.length > 1 && {
      time: {
        type: 'choice',
        instructions: "Which of the current step's times is the timer for?",
        criteria: Object.fromEntries(stepTimes.map((t, i) => [`d${i}`, t.label])),
      },
    }),
    ...(!final && {
      complete: {
        type: 'boolean',
        instructions:
          'This is a live partial speech transcript. Is the request already complete, with nothing important likely still to be said?',
        criteria: {
          true: 'Complete, e.g. "next step", "what was that"',
          false: 'Cut off, e.g. "how much", "set a timer for", "go to the step where"',
        },
      },
    }),
  };
}

function readyEarly(action, confidence, completeProbability) {
  if (NO_ARGUMENTS.has(action)) return confidence >= THRESHOLDS.earlyNoArgs;
  return EARLY_OK.has(action) && confidence >= THRESHOLDS.early && completeProbability >= THRESHOLDS.complete;
}

/** "s3" → 3; `null` for "none" or a question that wasn't asked. */
function pick(answer) {
  return answer && answer.choice !== 'none' ? Number(answer.choice.slice(1)) : null;
}
