import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyReviewCategory, getCpLoss, getMateForColor, getScoreCpForColor, isBookCandidate } from './chess-analysis-client.ts';

test('isBookCandidate treats small early opening losses as book and stops after the opening window', () => {
  assert.equal(isBookCandidate(5, 60, 'd6'), true);
  assert.equal(isBookCandidate(6, 60, 'Nf6'), false);
  assert.equal(isBookCandidate(5, 90, 'd6'), false);
});

test('cp helpers normalize centipawns and mate from the player perspective', () => {
  const before = { whitePerspective: { type: 'cp', value: 33 } };
  const after = { whitePerspective: { type: 'cp', value: -164 } };
  const mate = { whitePerspective: { type: 'mate', value: 12 } };

  assert.equal(getScoreCpForColor(before, 'w'), 33);
  assert.equal(getScoreCpForColor(before, 'b'), -33);
  assert.equal(getCpLoss(before, after, 'w'), 197);
  assert.equal(getMateForColor(mate, 'w'), 12);
  assert.equal(getMateForColor(mate, 'b'), -12);
});

test('classifyReviewCategory uses expected points loss for mistakes and blunders', () => {
  assert.equal(
    classifyReviewCategory({
      index: 23,
      san: 'Qg5',
      bestMovePlayed: false,
      sacrifice: false,
      afterWinning: false,
      beforeCompletelyWinning: false,
      decisiveMove: false,
      expectedPointsLost: 0.491,
      beforeExpected: 0.55,
      afterExpected: 0.06,
      cpLossCp: 197,
      beforeMate: null,
      afterMate: null,
      secondBestGapCp: 20,
      ratingFlex: 0.02,
    }),
    'blunder',
  );

  assert.equal(
    classifyReviewCategory({
      index: 43,
      san: 'Nxb1',
      bestMovePlayed: false,
      sacrifice: false,
      afterWinning: false,
      beforeCompletelyWinning: false,
      decisiveMove: false,
      expectedPointsLost: 0.343,
      beforeExpected: 0.2,
      afterExpected: 0.01,
      cpLossCp: 305,
      beforeMate: null,
      afterMate: null,
      secondBestGapCp: 40,
      ratingFlex: 0.02,
    }),
    'blunder',
  );

  assert.equal(
    classifyReviewCategory({
      index: 43,
      san: 'Qh4',
      bestMovePlayed: false,
      sacrifice: false,
      afterWinning: false,
      beforeCompletelyWinning: false,
      decisiveMove: false,
      expectedPointsLost: 0.5,
      beforeExpected: 0.2,
      afterExpected: 0,
      cpLossCp: 420,
      beforeMate: null,
      afterMate: null,
      secondBestGapCp: 40,
      ratingFlex: 0.02,
    }),
    'blunder',
  );
});

test('classifyReviewCategory falls back to cp loss when expected points are unavailable', () => {
  assert.equal(
    classifyReviewCategory({
      index: 23,
      san: 'Qg5',
      bestMovePlayed: false,
      sacrifice: false,
      afterWinning: false,
      beforeCompletelyWinning: false,
      decisiveMove: false,
      expectedPointsLost: null,
      beforeExpected: null,
      afterExpected: null,
      cpLossCp: 197,
      beforeMate: null,
      afterMate: null,
      secondBestGapCp: 20,
      ratingFlex: 0.02,
    }),
    'mistake',
  );
});

test('classifyReviewCategory treats mate swings against the player as blunders', () => {
  assert.equal(
    classifyReviewCategory({
      index: 45,
      san: 'Rxc2',
      bestMovePlayed: true,
      sacrifice: false,
      afterWinning: false,
      beforeCompletelyWinning: false,
      decisiveMove: false,
      expectedPointsLost: 0,
      beforeExpected: 0.98,
      afterExpected: 0,
      cpLossCp: 99616,
      beforeMate: null,
      afterMate: -12,
      secondBestGapCp: 0,
      ratingFlex: 0.02,
    }),
    'blunder',
  );
});
