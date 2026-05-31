import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDeckAttempt,
  getDeckCardState,
  getDeckQueueCounts,
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
    reviewCount: 2,
    lapseCount: 1,
    ease: 2.3,
    intervalDays: 0,
    ignored: false,
    lastOutcome: 'miss',
    dueAt: '2026-05-24T10:15:00.000Z',
    lastSeenAt: '2026-05-24T10:05:00.000Z',
  });
});

test('toggleDeckIgnored flips ignored state without losing counters', () => {
  const initial = applyDeckAttempt({}, 'card-2', true, '2026-05-24T10:00:00.000Z');
  const toggled = toggleDeckIgnored(initial, 'card-2');

  assert.equal(getDeckProgressEntry(toggled, 'card-2').ignored, true);
  assert.equal(getDeckProgressEntry(toggled, 'card-2').correctCount, 1);
});

test('summarizeDeckProgress reports review totals and SRS state buckets', () => {
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
    '2026-05-24T10:06:00.000Z',
  );

  assert.deepEqual(summary, {
    reviews: 2,
    reviewedCards: 2,
    correct: 1,
    misses: 1,
    ignored: 1,
    remaining: 2,
    new: 1,
    learning: 0,
    due: 0,
    review: 1,
    mature: 0,
    later: 1,
  });
});

test('getDeckCardState classifies new, learning, due, review, mature, and ignored cards', () => {
  const now = '2026-05-24T10:00:00.000Z';

  assert.equal(getDeckCardState(getDeckProgressEntry({}, 'new'), now), 'new');
  assert.equal(
    getDeckCardState(
      {
        ...getDeckProgressEntry({}, 'learning'),
        seenCount: 1,
        intervalDays: 0,
        dueAt: '2026-05-24T10:10:00.000Z',
      },
      now,
    ),
    'learning',
  );
  assert.equal(
    getDeckCardState(
      {
        ...getDeckProgressEntry({}, 'due'),
        seenCount: 1,
        intervalDays: 3,
        dueAt: '2026-05-24T09:00:00.000Z',
      },
      now,
    ),
    'due',
  );
  assert.equal(
    getDeckCardState(
      {
        ...getDeckProgressEntry({}, 'review'),
        seenCount: 1,
        intervalDays: 12,
        dueAt: '2026-06-05T10:00:00.000Z',
      },
      now,
    ),
    'review',
  );
  assert.equal(
    getDeckCardState(
      {
        ...getDeckProgressEntry({}, 'mature'),
        seenCount: 1,
        intervalDays: 21,
        dueAt: '2026-06-14T10:00:00.000Z',
      },
      now,
    ),
    'mature',
  );
  assert.equal(
    getDeckCardState(
      {
        ...getDeckProgressEntry({}, 'ignored'),
        ignored: true,
      },
      now,
    ),
    'ignored',
  );
});

test('getDeckQueueCounts exposes Anki-style new learning due queues', () => {
  const progress = {
    learning: {
      ...getDeckProgressEntry({}, 'learning'),
      seenCount: 1,
      intervalDays: 0,
      dueAt: '2026-05-24T10:10:00.000Z',
    },
    due: {
      ...getDeckProgressEntry({}, 'due'),
      seenCount: 1,
      intervalDays: 3,
      dueAt: '2026-05-24T09:00:00.000Z',
    },
  };

  assert.deepEqual(
    getDeckQueueCounts([{ id: 'new' }, { id: 'learning' }, { id: 'due' }], progress, '2026-05-24T10:00:00.000Z'),
    {
      new: 1,
      learning: 1,
      due: 1,
    },
  );
});
