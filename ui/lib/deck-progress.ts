import type { DeckCard } from '@/lib/opening-training';

export type DeckAttemptOutcome = 'correct' | 'miss';
export type DeckCardState = 'new' | 'learning' | 'due' | 'review' | 'mature' | 'ignored';

export type DeckProgressEntry = {
  seenCount: number;
  correctCount: number;
  missCount: number;
  streak: number;
  reviewCount: number;
  lapseCount: number;
  learningStep: number;
  ease: number;
  intervalDays: number;
  ignored: boolean;
  lastOutcome: DeckAttemptOutcome | null;
  dueAt: string | null;
  lastSeenAt: string | null;
};

export type DeckProgressMap = Record<string, DeckProgressEntry>;

export type DeckProgressSummary = {
  reviews: number;
  reviewedCards: number;
  correct: number;
  misses: number;
  ignored: number;
  remaining: number;
  new: number;
  learning: number;
  due: number;
  review: number;
  mature: number;
  later: number;
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
    learningStep: 0,
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
    learningStep: clampProgressNumber(entry.learningStep, fallback.learningStep),
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
      learningStep: nextSchedule.learningStep,
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

export function summarizeDeckProgress(cards: DeckCard[], progress: DeckProgressMap, nowIso = new Date().toISOString()): DeckProgressSummary {
  let reviews = 0;
  let reviewedCards = 0;
  let correct = 0;
  let misses = 0;
  let ignored = 0;
  let newCount = 0;
  let learning = 0;
  let due = 0;
  let review = 0;
  let mature = 0;

  for (const card of cards) {
    const entry = getDeckProgressEntry(progress, card.id);
    const state = getDeckCardState(entry, nowIso);

    reviews += entry.seenCount;
    reviewedCards += entry.seenCount > 0 ? 1 : 0;
    correct += entry.correctCount;
    misses += entry.missCount;

    if (state === 'ignored') {
      ignored += 1;
    } else if (state === 'new') {
      newCount += 1;
    } else if (state === 'learning') {
      learning += 1;
    } else if (state === 'due') {
      due += 1;
    } else if (state === 'mature') {
      mature += 1;
    } else {
      review += 1;
    }
  }

  return {
    reviews,
    reviewedCards,
    correct,
    misses,
    ignored,
    remaining: Math.max(0, cards.length - ignored),
    new: newCount,
    learning,
    due,
    review,
    mature,
    later: learning + review + mature,
  };
}

export function shuffleDeckCards(cards: DeckCard[]): DeckCard[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const left = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = left;
  }

  return shuffled;
}

export function buildMixedTrainingQueue(cards: DeckCard[], progress: DeckProgressMap): DeckCard[] {
  const activeCards = cards.filter(card => !getDeckProgressEntry(progress, card.id).ignored);
  return shuffleDeckCards(activeCards);
}

export function getDeckStudyQueue(cards: DeckCard[], progress: DeckProgressMap, nowIso = new Date().toISOString()) {
  return sortCardsForReview(cards, progress, nowIso).filter(card => isDeckCardStudyable(getDeckProgressEntry(progress, card.id), nowIso));
}

export function isDeckCardStudyable(entry: DeckProgressEntry, nowIso = new Date().toISOString()) {
  if (entry.ignored) {
    return false;
  }

  const state = getDeckCardState(entry, nowIso);

  if (state === 'new' || state === 'due') {
    return true;
  }

  if (entry.lastOutcome === 'miss') {
    return true;
  }

  return false;
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

export function getDeckCardState(entry: DeckProgressEntry, nowIso = new Date().toISOString()): DeckCardState {
  if (entry.ignored) {
    return 'ignored';
  }

  if (entry.seenCount === 0) {
    return 'new';
  }

  const now = Date.parse(nowIso);
  const due = Date.parse(entry.dueAt ?? '');
  const isDue = !Number.isFinite(due) || !Number.isFinite(now) || due <= now;

  if (entry.intervalDays === 0) {
    return isDue ? 'due' : 'learning';
  }

  if (isDue) {
    return 'due';
  }

  return entry.intervalDays >= 21 ? 'mature' : 'review';
}

export function getDeckQueueCounts(cards: DeckCard[], progress: DeckProgressMap, nowIso = new Date().toISOString()) {
  const summary = summarizeDeckProgress(cards, progress, nowIso);

  return {
    new: summary.new,
    learning: summary.learning,
    due: summary.due,
  };
}

function getReviewRank(entry: DeckProgressEntry, now: number) {
  if (entry.ignored) {
    return 4;
  }

  if (entry.lastOutcome === 'miss') {
    return 0;
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

const LEARNING_STEP_DELAYS_MS = [60_000, 10 * 60_000];
const RELEARN_DELAY_MS = 60_000;
const GRADUATION_DAYS = 1;

function getNextSchedule(entry: DeckProgressEntry, correct: boolean, seenAt: string) {
  const seenTime = Date.parse(seenAt);
  const baseTime = Number.isFinite(seenTime) ? seenTime : Date.now();

  if (!correct) {
    return {
      dueAt: new Date(baseTime + RELEARN_DELAY_MS).toISOString(),
      ease: Math.max(1.3, Number((entry.ease - 0.2).toFixed(2))),
      intervalDays: 0,
      learningStep: 0,
    };
  }

  if (entry.intervalDays === 0) {
    const nextLearningStep = entry.learningStep + 1;

    if (nextLearningStep <= LEARNING_STEP_DELAYS_MS.length) {
      return {
        dueAt: new Date(baseTime + LEARNING_STEP_DELAYS_MS[nextLearningStep - 1]).toISOString(),
        ease: entry.ease,
        intervalDays: 0,
        learningStep: nextLearningStep,
      };
    }

    return {
      dueAt: new Date(baseTime + GRADUATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      ease: entry.ease,
      intervalDays: GRADUATION_DAYS,
      learningStep: 0,
    };
  }

  const ease = Math.min(3.2, Number((entry.ease + (entry.streak >= 2 ? 0.05 : 0)).toFixed(2)));
  const intervalDays =
    entry.intervalDays <= 1 ? 3 : Math.max(1, Math.round(entry.intervalDays * ease));

  return {
    dueAt: new Date(baseTime + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
    ease,
    intervalDays,
    learningStep: 0,
  };
}

function clampProgressNumber(value: unknown, fallback: number) {
  return Math.max(0, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);
}
