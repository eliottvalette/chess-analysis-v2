import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDeckAttempt,
  getDeckProgressEntry,
  summarizeDeckProgress,
  toggleDeckIgnored,
} from './deck-progress.ts';

test('applyDeckAttempt increments seen counts and resets streak on misses', () => {
  const first = applyDeckAttempt({}, 'card-1', true, '2026-05-24T10:00:00.000Z');
  const second = applyDeckAttempt(first, 'card-1', false, '2026-05-24T10:05:00.000Z');

  assert.deepEqual(getDeckProgressEntry(second, 'card-1'), {
    seenCount: 2,
    correctCount: 1,
    missCount: 1,
    streak: 0,
    ignored: false,
    lastOutcome: 'miss',
    lastSeenAt: '2026-05-24T10:05:00.000Z',
  });
});

test('toggleDeckIgnored flips ignored state without losing counters', () => {
  const initial = applyDeckAttempt({}, 'card-2', true, '2026-05-24T10:00:00.000Z');
  const toggled = toggleDeckIgnored(initial, 'card-2');

  assert.equal(getDeckProgressEntry(toggled, 'card-2').ignored, true);
  assert.equal(getDeckProgressEntry(toggled, 'card-2').correctCount, 1);
});

test('summarizeDeckProgress reports cumulative stats for known cards', () => {
  const progress = applyDeckAttempt(
    toggleDeckIgnored(applyDeckAttempt({}, 'card-1', true, '2026-05-24T10:00:00.000Z'), 'card-2'),
    'card-2',
    false,
    '2026-05-24T10:05:00.000Z',
  );

  const summary = summarizeDeckProgress(
    [
      { id: 'card-1' },
      { id: 'card-2' },
      { id: 'card-3' },
    ],
    progress,
  );

  assert.deepEqual(summary, {
    seen: 2,
    correct: 1,
    misses: 1,
    ignored: 1,
    remaining: 2,
  });
});
