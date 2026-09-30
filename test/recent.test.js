import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRecentSet } from '../src/lib/recent.js';

describe('createRecentSet', () => {
  it('remembers the last N ids and forgets the oldest', () => {
    const seen = createRecentSet(3);
    for (const id of ['a', 'b', 'c']) seen.add(id);
    assert.equal(seen.has('a'), true);
    seen.add('d');
    assert.equal(seen.has('a'), false, 'oldest evicted');
    assert.equal(seen.has('d'), true);
    assert.equal(seen.size, 3);
  });

  it('refreshes an id that is added again, so a partial and its final stay deduped', () => {
    const seen = createRecentSet(2);
    seen.add('1:0');
    seen.add('1:1');
    seen.add('1:0'); // the final of the first phrase
    seen.add('1:2');
    assert.equal(seen.has('1:0'), true);
    assert.equal(seen.has('1:1'), false);
  });
});
