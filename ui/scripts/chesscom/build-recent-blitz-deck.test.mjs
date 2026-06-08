import assert from 'node:assert/strict';
import test from 'node:test';

import { qualifiesAsLineRootMistake } from './deck-mistake-filter.mjs';

test('qualifiesAsLineRootMistake accepts the first non-book suboptimal move', () => {
  assert.equal(
    qualifiesAsLineRootMistake({
      scoreSwingCp: 18,
      thresholdCp: 90,
      acceptableLossCp: 35,
      inBook: false,
      playedUci: 'g1f3',
      bestMoveUci: 'b1c3',
    }),
    true,
  );
});

test('qualifiesAsLineRootMistake rejects the engine best move', () => {
  assert.equal(
    qualifiesAsLineRootMistake({
      scoreSwingCp: 0,
      thresholdCp: 90,
      acceptableLossCp: 35,
      inBook: true,
      playedUci: 'e2e4',
      bestMoveUci: 'e2e4',
    }),
    false,
  );
});

test('qualifiesAsLineRootMistake accepts a later big blunder threshold', () => {
  assert.equal(
    qualifiesAsLineRootMistake({
      scoreSwingCp: 120,
      thresholdCp: 90,
      acceptableLossCp: 35,
      inBook: true,
      playedUci: 'd1h5',
      bestMoveUci: 'd1e2',
    }),
    true,
  );
});
