import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clock, durations, quantity, speakDuration } from '../src/lib/durations.js';

const seconds = (text) => durations(text).map((d) => d.seconds);

describe('durations', () => {
  const cases = [
    ['Bake for 25-30 minutes until golden.', [1500]],
    ['Cook noodles for 8 to 10 minutes.', [480]],
    ['Simmer for 1 hour 15 minutes, then rest 10 mins.', [4500, 600]],
    ['Simmer for 1 hour and 15 minutes.', [4500]],
    ['Cook for half an hour.', [1800]],
    ['Rest for an hour and a half.', [5400]],
    ['Cook for one and a half hours.', [5400]],
    ['Whisk for a minute, then chill for two hours.', [60, 7200]],
    ['set a timer for twenty-five minutes', [1500]],
    ['Simmer, covered, for about 1 ½ hours, stirring occasionally.', [5400]],
    ['Simmer for 1 1/2 hours.', [5400]],
    ['Rest for 1½ hours, then bake 1/2 hour.', [5400, 1800]],
    ['Microwave for 90 seconds.', [90]],
    ['Add 1/2 cup water and simmer 5 mins.', [300]],
    ['Preheat the oven to 180C/160C fan.', []],
    ['Serves 4.', []],
  ];

  for (const [text, expected] of cases) {
    it(`reads "${text}"`, () => assert.deepEqual(seconds(text), expected));
  }

  it('keeps the matched wording as the label', () => {
    assert.deepEqual(durations('Bake for 25-30 minutes.'), [{ label: '25-30 minutes', seconds: 1500 }]);
    assert.equal(durations('Simmer for 1 hour 15 minutes.')[0].label, '1 hour 15 minutes');
  });
});

describe('quantity', () => {
  it('parses digits, fractions and words', () => {
    assert.equal(quantity('3'), 3);
    assert.equal(quantity('1.5'), 1.5);
    assert.equal(quantity('1 1/2'), 1.5);
    assert.equal(quantity('1 ½'), 1.5);
    assert.equal(quantity('¾'), 0.75);
    assert.equal(quantity('twenty-five'), 25);
  });
});

describe('speakDuration', () => {
  it('reads naturally', () => {
    assert.equal(speakDuration(1800), '30 minutes');
    assert.equal(speakDuration(3661), '1 hour 1 minute 1 second');
    assert.equal(speakDuration(0), '0 seconds');
  });
});

describe('clock', () => {
  it('formats minutes and hours', () => {
    assert.equal(clock(65), '1:05');
    assert.equal(clock(3723), '1:02:03');
    assert.equal(clock(-5), '0:00');
  });
});
