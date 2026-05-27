import type { DeckCard } from '@/lib/opening-training';

export type DeckAttemptOutcome = 'correct' | 'miss';

export type DeckProgressEntry = {
  seenCount: number;
  correctCount: number;
  missCount: number;
  streak: number;
  reviewCount: number;
  lapseCount: number;
  ease: number;
  intervalDays: number;
  ignored: boolean;
  lastOutcome: DeckAttemptOutcome | null;
  dueAt: string | null;
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
  return normalizeDeckProgressEntry(progress[cardId]);
}

export function buildDefaultDeckProgressEntry(): DeckProgressEntry {
  return {
    seenCount: 0,
    correctCount: 0,
    missCount: 0,
    streak: 0,
    reviewCount: 0,
    lapseCount: 0,
    ease: 2.5,
    intervalDays: 0,
    ignored: false,
    lastOutcome: null,
    dueAt: null,
    lastSeenAt: null,
  };
}

export function normalizeDeckProgressEntry(entry: Partial<DeckProgressEntry> | null | undefined): DeckProgressEntry {
  const fallback = buildDefaultDeckProgressEntry();

  if (!entry) {
    return fallback;
  }

  return {
    seenCount: clampProgressNumber(entry.seenCount, fallback.seenCount),
    correctCount: clampProgressNumber(entry.correctCount, fallback.correctCount),
    missCount: clampProgressNumber(entry.missCount, fallback.missCount),
    streak: clampProgressNumber(entry.streak, fallback.streak),
    reviewCount: clampProgressNumber(entry.reviewCount, fallback.reviewCount),
    lapseCount: clampProgressNumber(entry.lapseCount, fallback.lapseCount),
    ease: Math.max(1.3, Math.min(3.2, Number.isFinite(Number(entry.ease)) ? Number(entry.ease) : fallback.ease)),
    intervalDays: clampProgressNumber(entry.intervalDays, fallback.intervalDays),
    ignored: Boolean(entry.ignored),
    lastOutcome: entry.lastOutcome === 'correct' || entry.lastOutcome === 'miss' ? entry.lastOutcome : null,
    dueAt: typeof entry.dueAt === 'string' ? entry.dueAt : null,
    lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : null,
  };
}

export function applyDeckAttempt(progress: DeckProgressMap, cardId: string, correct: boolean, seenAt: string): DeckProgressMap {
  const current = getDeckProgressEntry(progress, cardId);
  const nextSchedule = getNextSchedule(current, correct, seenAt);

  return {
    ...progress,
    [cardId]: {
      ...current,
      seenCount: current.seenCount + 1,
      correctCount: current.correctCount + (correct ? 1 : 0),
      missCount: current.missCount + (correct ? 0 : 1),
      streak: correct ? current.streak + 1 : 0,
      reviewCount: current.reviewCount + 1,
      lapseCount: current.lapseCount + (correct ? 0 : 1),
      ease: nextSchedule.ease,
      intervalDays: nextSchedule.intervalDays,
      lastOutcome: correct ? 'correct' : 'miss',
      dueAt: nextSchedule.dueAt,
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
    const entry = getDeckProgressEntry(progress, card.id);

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

export function sortCardsForReview(cards: DeckCard[], progress: DeckProgressMap, nowIso = new Date().toISOString()) {
  const now = Date.parse(nowIso);

  return [...cards].sort((left, right) => {
    const leftProgress = getDeckProgressEntry(progress, left.id);
    const rightProgress = getDeckProgressEntry(progress, right.id);
    const leftRank = getReviewRank(leftProgress, now);
    const rightRank = getReviewRank(rightProgress, now);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftDue = Date.parse(leftProgress.dueAt ?? '');
    const rightDue = Date.parse(rightProgress.dueAt ?? '');
    const leftDueValue = Number.isFinite(leftDue) ? leftDue : Number.MAX_SAFE_INTEGER;
    const rightDueValue = Number.isFinite(rightDue) ? rightDue : Number.MAX_SAFE_INTEGER;

    if (leftDueValue !== rightDueValue) {
      return leftDueValue - rightDueValue;
    }

    return (right.scoreSwingCp ?? 0) - (left.scoreSwingCp ?? 0);
  });
}

function getReviewRank(entry: DeckProgressEntry, now: number) {
  if (entry.ignored) {
    return 4;
  }

  if (entry.seenCount === 0) {
    return 1;
  }

  const due = Date.parse(entry.dueAt ?? '');

  if (!Number.isFinite(due) || due <= now) {
    return 0;
  }

  return 2;
}

function getNextSchedule(entry: DeckProgressEntry, correct: boolean, seenAt: string) {
  const seenTime = Date.parse(seenAt);
  const baseTime = Number.isFinite(seenTime) ? seenTime : Date.now();

  if (!correct) {
    return {
      dueAt: new Date(baseTime + 10 * 60 * 1000).toISOString(),
      ease: Math.max(1.3, Number((entry.ease - 0.2).toFixed(2))),
      intervalDays: 0,
    };
  }

  const ease = Math.min(3.2, Number((entry.ease + (entry.streak >= 2 ? 0.05 : 0)).toFixed(2)));
  const intervalDays =
    entry.reviewCount === 0 ? 1 : entry.intervalDays <= 1 ? 3 : Math.max(1, Math.round(entry.intervalDays * ease));

  return {
    dueAt: new Date(baseTime + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
    ease,
    intervalDays,
  };
}

function clampProgressNumber(value: unknown, fallback: number) {
  return Math.max(0, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);
}
