import type { DeckCard } from '@/lib/opening-training';

export type DeckAttemptOutcome = 'correct' | 'miss';

export type DeckProgressEntry = {
  seenCount: number;
  correctCount: number;
  missCount: number;
  streak: number;
  ignored: boolean;
  lastOutcome: DeckAttemptOutcome | null;
  lastSeenAt: string | null;
};

export type DeckProgressMap = Record<string, DeckProgressEntry>;

export type DeckProgressSummary = {
  seen: number;
  correct: number;
  misses: number;
  ignored: number;
  remaining: number;
};

export function getDeckProgressEntry(progress: DeckProgressMap, cardId: string): DeckProgressEntry {
  return progress[cardId] ?? buildDefaultDeckProgressEntry();
}

export function buildDefaultDeckProgressEntry(): DeckProgressEntry {
  return {
    seenCount: 0,
    correctCount: 0,
    missCount: 0,
    streak: 0,
    ignored: false,
    lastOutcome: null,
    lastSeenAt: null,
  };
}

export function applyDeckAttempt(progress: DeckProgressMap, cardId: string, correct: boolean, seenAt: string): DeckProgressMap {
  const current = getDeckProgressEntry(progress, cardId);

  return {
    ...progress,
    [cardId]: {
      ...current,
      seenCount: current.seenCount + 1,
      correctCount: current.correctCount + (correct ? 1 : 0),
      missCount: current.missCount + (correct ? 0 : 1),
      streak: correct ? current.streak + 1 : 0,
      lastOutcome: correct ? 'correct' : 'miss',
      lastSeenAt: seenAt,
    },
  };
}

export function toggleDeckIgnored(progress: DeckProgressMap, cardId: string): DeckProgressMap {
  const current = getDeckProgressEntry(progress, cardId);

  return {
    ...progress,
    [cardId]: {
      ...current,
      ignored: !current.ignored,
    },
  };
}

export function summarizeDeckProgress(cards: DeckCard[], progress: DeckProgressMap): DeckProgressSummary {
  let seen = 0;
  let correct = 0;
  let misses = 0;
  let ignored = 0;

  for (const card of cards) {
    const entry = progress[card.id];

    if (!entry) {
      continue;
    }

    seen += entry.seenCount;
    correct += entry.correctCount;
    misses += entry.missCount;
    ignored += entry.ignored ? 1 : 0;
  }

  return {
    seen,
    correct,
    misses,
    ignored,
    remaining: Math.max(0, cards.length - ignored),
  };
}
