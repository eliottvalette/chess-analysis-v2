import type { DeckCard } from '@/lib/opening-training';

export type DeckAttemptOutcome = 'correct' | 'miss';
export type DeckCardState = 'new' | 'learning' | 'due' | 'review' | 'mature' | 'ignored';
export type MasteryGrade = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export type DeckAttemptQuality = {
  responseMs?: number | null;
  exact?: boolean;
  evalLossCp?: number | null;
};

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
  masteryScore: number;
  lastResponseMs: number | null;
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
    masteryScore: 0,
    lastResponseMs: null,
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
    masteryScore: clampMasteryScore(entry.masteryScore, entry),
    lastResponseMs: clampNullableNumber(entry.lastResponseMs),
    ignored: Boolean(entry.ignored),
    lastOutcome: entry.lastOutcome === 'correct' || entry.lastOutcome === 'miss' ? entry.lastOutcome : null,
    dueAt: typeof entry.dueAt === 'string' ? entry.dueAt : null,
    lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : null,
  };
}

export function applyDeckAttempt(
  progress: DeckProgressMap,
  cardId: string,
  correct: boolean,
  seenAt: string,
  quality: DeckAttemptQuality = {},
): DeckProgressMap {
  const current = getDeckProgressEntry(progress, cardId);
  const performance = scoreAttemptPerformance(correct, quality);
  const nextMasteryScore = getNextMasteryScore(current, correct, performance, seenAt);
  const nextSchedule = getNextSchedule(current, correct, seenAt, performance, nextMasteryScore);

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
      masteryScore: nextMasteryScore,
      lastResponseMs: clampNullableNumber(quality.responseMs),
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
  void nowIso;
  return !entry.ignored;
}

export function sortCardsForReview(cards: DeckCard[], progress: DeckProgressMap, nowIso = new Date().toISOString()) {
  const now = Date.parse(nowIso);
  const openingMastery = new Map(summarizeLineMastery(cards, progress, nowIso).map(line => [line.id, line]));

  return [...cards].sort((left, right) => {
    const leftProgress = getDeckProgressEntry(progress, left.id);
    const rightProgress = getDeckProgressEntry(progress, right.id);
    const leftRank = getReviewRank(leftProgress, now, left);
    const rightRank = getReviewRank(rightProgress, now, right);

    if (leftRank === 0 || rightRank === 0) {
      return leftRank - rightRank;
    }

    const leftOpening = openingMastery.get(getDeckCardOpeningGroup(left).id);
    const rightOpening = openingMastery.get(getDeckCardOpeningGroup(right).id);
    const leftOpeningScore = leftOpening?.masteryScore ?? 0;
    const rightOpeningScore = rightOpening?.masteryScore ?? 0;

    if (leftOpeningScore !== rightOpeningScore) {
      return leftOpeningScore - rightOpeningScore;
    }

    const leftOpeningActive = (leftOpening?.dueCount ?? 0) + (leftOpening?.newCount ?? 0);
    const rightOpeningActive = (rightOpening?.dueCount ?? 0) + (rightOpening?.newCount ?? 0);

    if (leftOpeningActive !== rightOpeningActive) {
      return rightOpeningActive - leftOpeningActive;
    }

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftEffectiveScore = getEffectiveMasteryScore(leftProgress, now);
    const rightEffectiveScore = getEffectiveMasteryScore(rightProgress, now);

    if (leftEffectiveScore !== rightEffectiveScore) {
      return leftEffectiveScore - rightEffectiveScore;
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

export function getEffectiveMasteryScore(entry: DeckProgressEntry, nowIsoOrMs: string | number = new Date().toISOString()) {
  const now = typeof nowIsoOrMs === 'number' ? nowIsoOrMs : Date.parse(nowIsoOrMs);
  const currentScore = clampMasteryScore(entry.masteryScore, entry);
  const lastSeen = Date.parse(entry.lastSeenAt ?? '');

  if (entry.seenCount === 0 || !Number.isFinite(now) || !Number.isFinite(lastSeen) || now <= lastSeen) {
    return currentScore;
  }

  const elapsedDays = (now - lastSeen) / DAY_MS;
  const retentionDays = getRetentionDays(entry);
  const decayedScore = currentScore - elapsedDays * (100 / retentionDays);

  return Math.max(0, Math.min(100, Math.round(decayedScore)));
}

export function getMasteryGrade(entry: DeckProgressEntry, nowIsoOrMs: string | number = new Date().toISOString()): MasteryGrade {
  return scoreToMasteryGrade(getEffectiveMasteryScore(entry, nowIsoOrMs));
}

export function scoreToMasteryGrade(score: number): MasteryGrade {
  if (score >= 92) {
    return 'S';
  }

  if (score >= 80) {
    return 'A';
  }

  if (score >= 66) {
    return 'B';
  }

  if (score >= 50) {
    return 'C';
  }

  if (score >= 34) {
    return 'D';
  }

  if (score >= 18) {
    return 'E';
  }

  return 'F';
}

const ECO_NAME_FALLBACKS: Record<string, string> = {
  B13: 'Caro-Kann Defense: Exchange Variation',
};

export function getDeckCardOpeningGroup(card: DeckCard) {
  const eco = String(card.eco ?? '').trim().toUpperCase();
  const mappedName = ECO_NAME_FALLBACKS[eco];

  if (mappedName) {
    return {
      id: `eco:${eco}`,
      name: mappedName,
    };
  }

  const lineName = String(card.lineName ?? '').trim();
  const generatedLineMatch = lineName.match(/^(.+?)\s+·\s+\d{4}-\d{2}-\d{2}\s+vs\s+.+$/i);

  if (generatedLineMatch) {
    return {
      id: `name:${normalizeOpeningGroupId(generatedLineMatch[1])}`,
      name: generatedLineMatch[1],
    };
  }

  if (lineName && lineName !== card.eco && !/^.+?\s+vs\s+.+?$/i.test(lineName)) {
    const cleanName = lineName.replace(/\s+·\s+([A-E]\d{2}|GAME)$/i, '');

    return {
      id: `name:${normalizeOpeningGroupId(cleanName)}`,
      name: cleanName,
    };
  }

  if (eco && eco !== 'GAME') {
    return {
      id: `eco:${eco}`,
      name: `Unknown opening ${eco}`,
    };
  }

  return {
    id: 'opening:unknown',
    name: 'Unknown opening',
  };
}

export function summarizeLineMastery(cards: DeckCard[], progress: DeckProgressMap, nowIso = new Date().toISOString()) {
  const byLine = new Map<string, {
    id: string;
    name: string;
    eco: string;
    side: DeckCard['side'];
    cardCount: number;
    dueCount: number;
    newCount: number;
    scoreTotal: number;
    weakestScore: number;
  }>();
  const now = Date.parse(nowIso);

  for (const card of cards) {
    const entry = getDeckProgressEntry(progress, card.id);
    const state = getDeckCardState(entry, nowIso);
    const score = getEffectiveMasteryScore(entry, Number.isFinite(now) ? now : nowIso);
    const group = getDeckCardOpeningGroup(card);
    const current = byLine.get(group.id) ?? {
      id: group.id,
      name: group.name,
      eco: card.eco,
      side: card.side,
      cardCount: 0,
      dueCount: 0,
      newCount: 0,
      scoreTotal: 0,
      weakestScore: 100,
    };

    current.cardCount += 1;
    current.scoreTotal += score;
    current.weakestScore = Math.min(current.weakestScore, score);

    if (state === 'new') {
      current.newCount += 1;
    } else if (state === 'due') {
      current.dueCount += 1;
    }

    byLine.set(group.id, current);
  }

  return [...byLine.values()]
    .map(line => {
      const averageScore = line.cardCount > 0 ? Math.round(line.scoreTotal / line.cardCount) : 0;

      return {
        id: line.id,
        name: line.name,
        eco: line.eco,
        side: line.side,
        cardCount: line.cardCount,
        dueCount: line.dueCount,
        newCount: line.newCount,
        masteryScore: averageScore,
        weakestScore: line.cardCount > 0 ? Math.round(line.weakestScore) : 0,
        grade: scoreToMasteryGrade(averageScore),
      };
    })
    .sort((left, right) => {
      if (left.masteryScore !== right.masteryScore) {
        return left.masteryScore - right.masteryScore;
      }

      return right.dueCount - left.dueCount;
    });
}

function normalizeOpeningGroupId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
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

function getReviewRank(entry: DeckProgressEntry, now: number, card?: DeckCard) {
  void card;

  if (entry.ignored) {
    return 4;
  }

  if (entry.lastOutcome === 'miss') {
    return 0;
  }

  const effectiveScore = getEffectiveMasteryScore(entry, now);

  if (effectiveScore < 34) {
    return 1;
  }

  if (effectiveScore < 66) {
    return 2;
  }

  return 3;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_FLOOR_SCORE = 66;
const MASTERY_GRADE_CEILINGS: Record<MasteryGrade, number> = {
  F: 17,
  E: 33,
  D: 49,
  C: 65,
  B: 79,
  A: 91,
  S: 100,
};
const NEXT_MASTERY_GRADE: Record<MasteryGrade, MasteryGrade> = {
  F: 'E',
  E: 'D',
  D: 'C',
  C: 'B',
  B: 'A',
  A: 'S',
  S: 'S',
};

function getNextSchedule(entry: DeckProgressEntry, correct: boolean, seenAt: string, performance: number, masteryScore: number) {
  const seenTime = Date.parse(seenAt);
  const baseTime = Number.isFinite(seenTime) ? seenTime : Date.now();
  const easeDelta = correct ? performance * 0.14 - 0.03 : -0.24;
  const ease = Math.max(1.3, Math.min(3.4, Number((entry.ease + easeDelta).toFixed(2))));
  const nextEntry = {
    ...entry,
    masteryScore,
    ease,
    streak: correct ? entry.streak + 1 : 0,
    lapseCount: entry.lapseCount + (correct ? 0 : 1),
  };
  const retentionDays = getRetentionDays(nextEntry);
  const daysUntilWeak = correct ? Math.max(1, Math.round(((masteryScore - REVIEW_FLOOR_SCORE) / 100) * retentionDays)) : 0;

  return {
    dueAt: new Date(baseTime + daysUntilWeak * DAY_MS).toISOString(),
    ease,
    intervalDays: daysUntilWeak,
    learningStep: 0,
  };
}

function clampProgressNumber(value: unknown, fallback: number) {
  return Math.max(0, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);
}

function clampNullableNumber(value: unknown) {
  if (value == null) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

function clampMasteryScore(value: unknown, entry: Partial<DeckProgressEntry> | null | undefined) {
  const number = Number(value);

  if (Number.isFinite(number)) {
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  if (!entry || !entry.seenCount) {
    return 0;
  }

  const correct = Number(entry.correctCount ?? 0);
  const seen = Number(entry.seenCount ?? 0);
  const streak = Number(entry.streak ?? 0);
  const accuracy = seen > 0 ? correct / seen : 0;
  const base = accuracy * 58 + Math.min(22, streak * 6) + Math.min(20, Number(entry.intervalDays ?? 0) * 2);

  return Math.max(0, Math.min(100, Math.round(base)));
}

function scoreAttemptPerformance(correct: boolean, quality: DeckAttemptQuality) {
  if (!correct) {
    return 0;
  }

  const responseMs = Number(quality.responseMs);
  const speedScore = !Number.isFinite(responseMs)
    ? 0.68
    : responseMs <= 3_000
      ? 1
      : responseMs <= 5_000
        ? 1 - ((responseMs - 3_000) / 2_000) * 0.22
        : 0.78;
  const exactScore = quality.exact === false ? 0.72 : 1;
  const evalLoss = Number(quality.evalLossCp);
  const precisionScore = !Number.isFinite(evalLoss) ? 1 : Math.max(0.45, 1 - Math.max(0, evalLoss) / 180);

  return Math.max(0, Math.min(1, speedScore * 0.55 + exactScore * 0.25 + precisionScore * 0.2));
}

function getNextMasteryScore(entry: DeckProgressEntry, correct: boolean, performance: number, seenAt: string) {
  const effectiveScore = getEffectiveMasteryScore(entry, seenAt);

  if (!correct) {
    const penalty = 28 + (100 - effectiveScore) * 0.12;
    return Math.max(0, Math.round(effectiveScore - penalty));
  }

  const targetScore = 48 + performance * 52;
  const lift = effectiveScore < 50 ? 0.68 : effectiveScore < 80 ? 0.45 : 0.28;

  if (targetScore <= effectiveScore) {
    return clampMasteryGain(effectiveScore, effectiveScore + performance * 4);
  }

  return clampMasteryGain(effectiveScore, effectiveScore + (targetScore - effectiveScore) * lift);
}

function clampMasteryGain(previousScore: number, nextScore: number) {
  const currentGrade = scoreToMasteryGrade(previousScore);
  const nextGrade = NEXT_MASTERY_GRADE[currentGrade];
  const maxScore = MASTERY_GRADE_CEILINGS[nextGrade];

  return Math.max(0, Math.min(100, maxScore, Math.round(nextScore)));
}

function getRetentionDays(entry: Pick<DeckProgressEntry, 'masteryScore' | 'ease' | 'streak' | 'lapseCount'>) {
  const scoreFactor = 1 + Math.max(0, entry.masteryScore) / 18;
  const easeFactor = Math.max(0.65, entry.ease / 2.5);
  const streakFactor = 1 + Math.min(4, entry.streak) * 0.22;
  const lapsePenalty = 1 + Math.min(4, entry.lapseCount) * 0.35;

  return Math.max(1, Math.min(90, (scoreFactor * easeFactor * streakFactor) / lapsePenalty));
}
