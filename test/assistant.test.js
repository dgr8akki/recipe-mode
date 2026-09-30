import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACTIONS, buildQuestions, ingredientsForStep, interpret } from '../src/lib/assistant.js';
import { choice, fakeJev, yesNo } from './helpers.js';

const recipe = {
  title: 'Banana bread',
  ingredients: ['140g butter, softened', '140g caster sugar', '2 large eggs', '140g self-raising flour'],
  steps: [
    'Heat oven to 180C/160C fan/gas 4.',
    'Cream the butter and sugar, then add the eggs.',
    'Bake for about 30 mins until a skewer comes out clean.',
    'Cool in the tin for 10 mins, then drizzle with icing and leave for 1 hour to set.',
  ],
};

/** Answers for one call; unspecified questions answer "none". */
const answers = ({ action, confidence = 0.95, step = 'none', ingredient = 'none', time = 'd0', complete = 0.9 }) => ({
  action: choice(action, confidence),
  step: choice(step),
  ingredient: choice(ingredient),
  time: choice(time),
  complete: yesNo(complete),
});

describe('interpret', () => {
  it('returns the action with the step and ingredient Jev picked', async () => {
    const jev = fakeJev(() => answers({ action: 'amount', ingredient: 'i0' }));
    const intent = await interpret(jev, { transcript: 'how much butter', final: true, recipe, step: 1 });
    assert.deepEqual(intent, { action: 'amount', step: null, ingredient: 0, time: null, timeSpoken: false });
  });

  it('sends the current step as context', async () => {
    const jev = fakeJev(() => answers({ action: 'next' }));
    await interpret(jev, { transcript: 'next', final: true, recipe, step: 2 });
    assert.deepEqual(jev.calls[0].state, {
      command: 'next',
      currentStep: 3,
      totalSteps: 4,
      currentStepText: recipe.steps[2],
    });
  });

  it('maps low confidence to "none"', async () => {
    const jev = fakeJev(() => answers({ action: 'next', confidence: 0.4 }));
    const intent = await interpret(jev, { transcript: 'hmm', final: true, recipe, step: 0 });
    assert.equal(intent.action, 'none');
  });

  describe('timers', () => {
    it("uses the step's only time", async () => {
      const jev = fakeJev(() => answers({ action: 'timer' }));
      const intent = await interpret(jev, { transcript: 'set a timer', final: true, recipe, step: 2 });
      assert.deepEqual(intent.time, { label: '30 mins', seconds: 1800 });
    });

    it('lets Jev choose between several times in a step', async () => {
      const jev = fakeJev(() => answers({ action: 'timer', time: 'd1' }));
      const intent = await interpret(jev, { transcript: 'timer for the setting', final: true, recipe, step: 3 });
      assert.deepEqual(intent.time, { label: '1 hour', seconds: 3600 });
      assert.ok(jev.calls[0].questions.time, 'asks which time');
    });

    it('prefers a time said out loud, and says so', async () => {
      const jev = fakeJev(() => answers({ action: 'timer' }));
      const intent = await interpret(jev, { transcript: 'set a timer for 12 minutes', final: true, recipe, step: 2 });
      assert.equal(intent.time.seconds, 720);
      assert.equal(intent.timeSpoken, true);
      const fromStep = await interpret(jev, { transcript: 'set a timer', final: true, recipe, step: 2 });
      assert.equal(fromStep.timeSpoken, false);
    });

    it('returns no time when the step has none and none was said', async () => {
      const jev = fakeJev(() => answers({ action: 'timer' }));
      const intent = await interpret(jev, { transcript: 'set a timer', final: true, recipe, step: 0 });
      assert.equal(intent.time, null);
    });
  });

  describe('partial transcripts', () => {
    const partial = (a) =>
      interpret(
        fakeJev(() => answers(a)),
        { transcript: '…', final: false, recipe, step: 0 },
      );

    it('acts early on argument-free actions from confidence alone', async () => {
      assert.equal((await partial({ action: 'next', complete: 0.5 })).action, 'next');
    });

    it('waits when an argument-free action is not confident enough', async () => {
      assert.equal(await partial({ action: 'next', confidence: 0.85 }), null);
    });

    it('acts early on other safe actions once Jev says the request is complete', async () => {
      assert.equal((await partial({ action: 'prev', complete: 0.8 })).action, 'prev');
      assert.equal(await partial({ action: 'prev', complete: 0.5 }), null);
    });

    it('always waits for actions with arguments', async () => {
      assert.equal(await partial({ action: 'amount', complete: 0.99 }), null);
      assert.equal(await partial({ action: 'timer', complete: 0.99 }), null);
      assert.equal(await partial({ action: 'goto', complete: 0.99 }), null);
    });
  });
});

describe('robustness to odd answers', () => {
  it('treats a missing action or complete answer as "not for us" instead of throwing', async () => {
    const missingAll = await interpret(
      fakeJev(() => ({})),
      { transcript: 'next', final: true, recipe, step: 0 },
    );
    assert.equal(missingAll.action, 'none');
    const partial = await interpret(
      fakeJev(() => ({ action: choice('prev', 0.95) })),
      {
        transcript: 'go',
        final: false,
        recipe,
        step: 0,
      },
    );
    assert.equal(partial, null, 'no complete answer on a partial means wait');
  });

  it('ignores a step or ingredient choice that is not one of ours', async () => {
    const jev = fakeJev(() => answers({ action: 'goto', step: 'step-4', ingredient: 'butter' }));
    const intent = await interpret(jev, { transcript: 'go to step four', final: true, recipe, step: 0 });
    assert.equal(intent.action, 'goto');
    assert.equal(intent.step, null);
    assert.equal(intent.ingredient, null);
  });
});

describe('buildQuestions', () => {
  it('offers only the steps near the current one on a long recipe', () => {
    const long = { ...recipe, steps: Array.from({ length: 60 }, (_, i) => `Step text ${i + 1}`) };
    const middle = buildQuestions({ recipe: long, stepTimes: [], final: true, step: 30 });
    const keys = Object.keys(middle.step.criteria);
    assert.equal(keys.length, 21 + 1, '±10 around the current step, plus none');
    assert.ok(keys.includes('s20') && keys.includes('s40') && keys.includes('none'));
    assert.ok(!keys.includes('s19') && !keys.includes('s41'));

    const start = buildQuestions({ recipe: long, stepTimes: [], final: true, step: 0 });
    assert.deepEqual(Object.keys(start.step.criteria).slice(0, 2), ['s0', 's1']);
    assert.equal(Object.keys(start.step.criteria).length, 11 + 1);
  });

  it('caps the ingredient options like ingredientsForStep does', () => {
    const many = { ...recipe, ingredients: Array.from({ length: 70 }, (_, i) => `ingredient ${i}`) };
    const q = buildQuestions({ recipe: many, stepTimes: [], final: true, step: 0 });
    assert.equal(Object.keys(q.ingredient.criteria).length, 40 + 1);
  });

  it('describes every action, step and ingredient', () => {
    const q = buildQuestions({ recipe, stepTimes: [], final: true });
    assert.deepEqual(q.action.criteria, ACTIONS);
    assert.equal(q.step.criteria.s1, `Step 2: ${recipe.steps[1]}`);
    assert.equal(q.ingredient.criteria.i3, recipe.ingredients[3]);
    assert.ok(q.step.criteria.none && q.ingredient.criteria.none);
  });

  it('only asks about completeness for partial transcripts', () => {
    assert.equal(buildQuestions({ recipe, stepTimes: [], final: true }).complete, undefined);
    assert.ok(buildQuestions({ recipe, stepTimes: [], final: false }).complete);
  });

  it('clips long step text', () => {
    const long = { ...recipe, steps: ['x'.repeat(300)] };
    assert.equal(
      buildQuestions({ recipe: long, stepTimes: [], final: true }).step.criteria.s0.length,
      'Step 1: '.length + 141,
    );
  });
});

describe('ingredientsForStep', () => {
  it('asks one yes/no per ingredient and keeps the likely ones', async () => {
    const jev = fakeJev(() => ({ i0: yesNo(0.9), i1: yesNo(0.8), i2: yesNo(0.7), i3: yesNo(0.1) }));
    assert.deepEqual(await ingredientsForStep(jev, recipe, 1), recipe.ingredients.slice(0, 3));
    assert.equal(Object.keys(jev.calls[0].questions).length, 4);
  });

  it('skips the call when there are no ingredients', async () => {
    const jev = fakeJev(() => assert.fail('should not call Jev'));
    assert.deepEqual(await ingredientsForStep(jev, { ...recipe, ingredients: [] }, 0), []);
  });
});
