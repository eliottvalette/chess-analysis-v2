import { Chess } from 'chess.js';
import type { ChartOptions, PointStyle } from 'chart.js';

import type { AnalysisResult, AnalyzeRequest, PerspectiveWdl } from '@/lib/analysis-types';

export type StoredMove = {
  from: string;
  to: string;
  san: string;
  lan: string;
  promotion: string | null;
  piece: string;
  color: string;
  flags: string;
  captured: string | null;
  uci: string;
};

export type GameMetadata = {
  event: string;
  site: string;
  date: string;
  round: string;
  whitePlayer: string;
  whiteElo: string;
  blackPlayer: string;
  blackElo: string;
  result: string;
  eco: string;
  opening: string;
};

export type ReviewCategory =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'miss'
  | 'mistake'
  | 'blunder';

export type ReviewSide = 'white' | 'black' | 'both';

export type ReviewCounter = Record<ReviewCategory, number>;

export type TimelineReview = {
  ply: number;
  color: 'w' | 'b';
  category: ReviewCategory | null;
  label: string | null;
  colorHex: string | null;
  pointStyle: PointStyle;
  moveLabel: string;
  san: string;
  playedMove: string;
  bestMove: string | null;
  bestMoveSan: string | null;
  beforeExpected: number | null;
  afterExpected: number | null;
  expectedPointsLost: number | null;
  moveAccuracy: number | null;
  isKeyMoment: boolean;
  coachText: string;
  fenBefore: string;
  fenAfter: string;
};

export type GameReview = {
  accuracy: {
    white: number | null;
    black: number | null;
  };
  gameRating: {
    white: number | null;
    black: number | null;
  };
  counts: {
    white: ReviewCounter;
    black: ReviewCounter;
  };
  keyMoments: TimelineReview[];
  opening: {
    name: string;
    eco: string;
    lastBookPly: number | null;
  };
};

export const reviewCategoryOrder: ReviewCategory[] = [
  'book',
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'miss',
  'mistake',
  'blunder',
];

export const reviewCategoryMeta: Record<
  ReviewCategory,
  {
    label: string;
    color: string;
    pointStyle: PointStyle;
  }
> = {
  brilliant: {
    label: 'Brilliant',
    color: '#9fd7ff',
    pointStyle: 'star',
  },
  book: {
    label: 'Book',
    color: '#7d8797',
    pointStyle: 'rectRounded',
  },
  great: {
    label: 'Great',
    color: '#8f75ff',
    pointStyle: 'triangle',
  },
  best: {
    label: 'Best',
    color: '#f3f3ef',
    pointStyle: 'rectRounded',
  },
  excellent: {
    label: 'Excellent',
    color: '#cfd5dc',
    pointStyle: 'circle',
  },
  good: {
    label: 'Good',
    color: '#a8b1bd',
    pointStyle: 'circle',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    color: '#ffd66e',
    pointStyle: 'rect',
  },
  miss: {
    label: 'Miss',
    color: '#ffc07a',
    pointStyle: 'rectRot',
  },
  mistake: {
    label: 'Mistake',
    color: '#ff7b9b',
    pointStyle: 'crossRot',
  },
  blunder: {
    label: 'Blunder',
    color: '#ff456f',
    pointStyle: 'cross',
  },
};

export async function analyzeSinglePosition(payload: AnalyzeRequest, signal?: AbortSignal) {
  return requestJson<AnalysisResult>('/api/analyze-position', payload, signal);
}

export async function analyzeGamePositions(
  payload: {
    positions: AnalyzeRequest[];
    depth?: number;
  },
  signal?: AbortSignal,
) {
  return requestJson<{ analyses: AnalysisResult[] }>('/api/analyze-game', payload, signal);
}

export function toStoredMove(move: {
  from: string;
  to: string;
  san: string;
  lan: string;
  promotion?: string;
  piece: string;
  color: string;
  flags: string;
  captured?: string;
}) {
  return {
    from: move.from,
    to: move.to,
    san: move.san,
    lan: move.lan,
    promotion: move.promotion ?? null,
    piece: move.piece,
    color: move.color,
    flags: move.flags,
    captured: move.captured ?? null,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
  } satisfies StoredMove;
}

export function buildMoveUciHistory(moves: StoredMove[]) {
  return moves.map(move => move.uci ?? `${move.from}${move.to}${move.promotion ?? ''}`);
}

export function restoreGameFromHistory(moves: StoredMove[], initialFen: string | null, upto = moves.length) {
  const chess = initialFen ? new Chess(initialFen) : new Chess();

  for (const move of moves.slice(0, upto)) {
    chess.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });
  }

  return chess;
}

export function buildTimelinePositions(moves: StoredMove[], initialFen: string | null) {
  const positions: AnalyzeRequest[] = [];
  const chess = initialFen ? new Chess(initialFen) : new Chess();
  const appliedMoves: string[] = [];

  for (const move of moves) {
    appliedMoves.push(move.uci);
    chess.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });

    positions.push({
      fen: chess.fen(),
      initialFen,
      moves: [...appliedMoves],
    });
  }

  return positions;
}

export function buildTimelineSequencePositions(moves: StoredMove[], initialFen: string | null) {
  const positions: AnalyzeRequest[] = [];
  const chess = initialFen ? new Chess(initialFen) : new Chess();
  const appliedMoves: string[] = [];

  positions.push({
    fen: chess.fen(),
    initialFen,
    moves: [],
  });

  for (const move of moves) {
    appliedMoves.push(move.uci);
    chess.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });

    positions.push({
      fen: chess.fen(),
      initialFen,
      moves: [...appliedMoves],
    });
  }

  return positions;
}

export function extractMetadataFromGame(game: Chess) {
  const headers = game.header();

  return {
    event: headers.Event ?? 'Open analysis',
    site: headers.Site ?? 'Local PGN',
    date: headers.Date ?? 'Unknown',
    round: headers.Round ?? '-',
    whitePlayer: headers.White ?? 'White',
    whiteElo: headers.WhiteElo ?? '-',
    blackPlayer: headers.Black ?? 'Black',
    blackElo: headers.BlackElo ?? '-',
    result: headers.Result ?? '*',
    eco: headers.ECO ?? '-',
    opening: headers.Opening ?? headers.Variation ?? 'Opening phase',
  } satisfies GameMetadata;
}

export function formatScoreLabel(analysis: AnalysisResult | null) {
  const score = analysis?.whitePerspective;

  if (!score) {
    return '...';
  }

  if (score.type === 'mate') {
    if (analysis?.score?.type === 'mate' && analysis.score.value === 0) {
      return score.value >= 0 ? '#0' : '-#0';
    }

    return score.value > 0 ? `#${score.value}` : `-#${Math.abs(score.value)}`;
  }

  const pawns = score.value / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

export function formatBestMove(fen: string, move: string | null) {
  if (!move) {
    return 'waiting';
  }

  const chess = new Chess(fen);
  const parsed = applyUciMove(chess, move);
  return parsed?.san ?? move;
}

export function formatPrincipalVariation(fen: string, pv: string[]) {
  if (!pv.length) {
    return 'No principal variation yet.';
  }

  const chess = new Chess(fen);
  const sanMoves: string[] = [];

  for (const move of pv.slice(0, 8)) {
    const parsed = applyUciMove(chess, move);

    if (!parsed) {
      break;
    }

    sanMoves.push(parsed.san);
  }

  return sanMoves.length > 0 ? sanMoves.join(' ') : pv.join(' ');
}

export function getBestMoveArrow(bestMove: string | null) {
  if (!bestMove || bestMove.length < 4) {
    return [];
  }

  return [
    {
      startSquare: bestMove.slice(0, 2),
      endSquare: bestMove.slice(2, 4),
      color: '#8f75ff',
    },
  ];
}

export function getAdvantageMeter(analysis: AnalysisResult | null) {
  const score = analysis?.whitePerspective;

  if (!score) {
    return 50;
  }

  const normalized = score.type === 'mate' ? Math.sign(score.value) * 12 : score.value / 100;
  const percentage = 100 / (1 + Math.exp(-normalized / 1.35));

  return Math.max(0, Math.min(100, percentage));
}

export function toChartScore(analysis: AnalysisResult) {
  const score = analysis.whitePerspective;

  if (!score) {
    return 0;
  }

  if (score.type === 'mate') {
    return score.value > 0 ? 12 : -12;
  }

  return Number((score.value / 100).toFixed(2));
}

export function wdlToPercentages(wdl: PerspectiveWdl | null) {
  if (!wdl) {
    return null;
  }

  const total = wdl.white + wdl.draw + wdl.black;

  if (total <= 0) {
    return null;
  }

  return {
    white: Math.round((wdl.white / total) * 100),
    draw: Math.round((wdl.draw / total) * 100),
    black: Math.round((wdl.black / total) * 100),
  };
}

export function classifyTimelineMoves(
  moves: StoredMove[],
  preMoveAnalyses: AnalysisResult[],
  postMoveAnalyses: AnalysisResult[],
  initialFen: string | null,
  metadata?: GameMetadata | null,
) {
  if (moves.length === 0 || preMoveAnalyses.length !== moves.length || postMoveAnalyses.length !== moves.length) {
    return [] satisfies TimelineReview[];
  }

  const beforeGame = initialFen ? new Chess(initialFen) : new Chess();

  return moves.map((move, index) => {
    const color = move.color === 'b' ? 'b' : 'w';
    const beforeFen = beforeGame.fen();
    const afterGame = new Chess(beforeFen);
    afterGame.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });

    const beforeAnalysis = preMoveAnalyses[index];
    const afterAnalysis = postMoveAnalyses[index];
    const moveLabel = formatTimelineMoveLabel(index, move);
    const playerRating = parsePlayerRating(color === 'w' ? metadata?.whiteElo : metadata?.blackElo);
    const ratingFlex = getRatingFlex(playerRating);
    const beforeExpected = getExpectedPoints(beforeAnalysis, color);
    const afterExpected = getExpectedPoints(afterAnalysis, color);
    const expectedPointsLost =
      beforeExpected == null || afterExpected == null ? null : Math.max(0, beforeExpected - afterExpected);
    const bestMovePlayed = Boolean(beforeAnalysis?.bestMove && beforeAnalysis.bestMove === move.uci);
    const sacrifice = isPieceSacrifice(beforeFen, afterGame.fen(), color);
    const afterWinning = isWinningOutcome(afterAnalysis, color);
    const beforeCompletelyWinning = isCompletelyWinning(beforeAnalysis, color);
    const decisiveMove = move.san.includes('#') || move.san.includes('+') || isMateForColor(afterAnalysis, color);
    const bestMoveSan = beforeAnalysis?.bestMove ? formatBestMove(beforeFen, beforeAnalysis.bestMove) : null;

    let category: ReviewCategory | null = null;

    if (isBookCandidate(index, expectedPointsLost, move.san)) {
      category = 'book';
    } else if (
      bestMovePlayed &&
      sacrifice &&
      afterWinning &&
      !beforeCompletelyWinning &&
      (expectedPointsLost ?? 0) <= 0.025 + ratingFlex
    ) {
      category = 'brilliant';
    } else if (
      bestMovePlayed &&
      (expectedPointsLost ?? 0) <= 0.03 + ratingFlex &&
      (isMateForColor(afterAnalysis, color) ||
        (decisiveMove && afterWinning) ||
        ((beforeExpected ?? 0.5) <= 0.38 && (afterExpected ?? 0.5) >= 0.34))
    ) {
      category = 'great';
    } else if (
      !bestMovePlayed &&
      beforeExpected != null &&
      afterExpected != null &&
      beforeExpected >= 0.74 &&
      afterExpected >= 0.35 &&
      beforeExpected - afterExpected >= 0.14
    ) {
      category = 'miss';
    } else if (bestMovePlayed || ((expectedPointsLost ?? Infinity) <= 0.01 + ratingFlex / 2)) {
      category = 'best';
    } else if (expectedPointsLost == null) {
      category = null;
    } else if (expectedPointsLost <= 0.03 + ratingFlex) {
      category = 'excellent';
    } else if (expectedPointsLost <= 0.065 + ratingFlex) {
      category = 'good';
    } else if (expectedPointsLost < 0.1) {
      category = 'inaccuracy';
    } else if (expectedPointsLost >= 0.2) {
      category = 'blunder';
    } else {
      category = 'mistake';
    }

    const moveAccuracy = getMoveAccuracy(category, expectedPointsLost);
    const isKeyMoment = isReviewKeyMoment(category, expectedPointsLost);
    const coachText = buildCoachText({
      moveLabel,
      category,
      playedMove: move.san,
      bestMoveSan,
      beforeExpected,
      afterExpected,
      expectedPointsLost,
    });

    beforeGame.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });

    const meta = category ? reviewCategoryMeta[category] : null;

    return {
      ply: index + 1,
      color,
      category,
      label: meta?.label ?? null,
      colorHex: meta?.color ?? null,
      pointStyle: meta?.pointStyle ?? 'circle',
      moveLabel,
      san: move.san,
      playedMove: move.uci,
      bestMove: beforeAnalysis?.bestMove ?? null,
      bestMoveSan,
      beforeExpected: beforeExpected == null ? null : Number(beforeExpected.toFixed(3)),
      afterExpected: afterExpected == null ? null : Number(afterExpected.toFixed(3)),
      expectedPointsLost: expectedPointsLost == null ? null : Number(expectedPointsLost.toFixed(3)),
      moveAccuracy,
      isKeyMoment,
      coachText,
      fenBefore: beforeFen,
      fenAfter: afterGame.fen(),
    } satisfies TimelineReview;
  });
}

export function summarizeTimelineReviews(reviews: TimelineReview[]) {
  const white = createReviewCounter();
  const black = createReviewCounter();

  for (const review of reviews) {
    if (!review.category) {
      continue;
    }

    const bucket = review.color === 'b' ? black : white;
    bucket[review.category] += 1;
  }

  return { white, black };
}

export function buildGameReview(reviews: TimelineReview[], metadata: GameMetadata | null) {
  const counts = summarizeTimelineReviews(reviews);
  const keyMoments = extractKeyMoments(reviews);
  const whiteAccuracy = calculatePlayerAccuracy(reviews, 'w');
  const blackAccuracy = calculatePlayerAccuracy(reviews, 'b');
  const lastBookPly = [...reviews].reverse().find(review => review.category === 'book')?.ply ?? null;

  return {
    accuracy: {
      white: whiteAccuracy,
      black: blackAccuracy,
    },
    gameRating: {
      white: calculateGameRating(parsePlayerRating(metadata?.whiteElo), whiteAccuracy),
      black: calculateGameRating(parsePlayerRating(metadata?.blackElo), blackAccuracy),
    },
    counts,
    keyMoments,
    opening: {
      name: metadata?.opening ?? 'Opening phase',
      eco: metadata?.eco ?? '-',
      lastBookPly,
    },
  } satisfies GameReview;
}

export function filterReviewMoments(moments: TimelineReview[], side: ReviewSide) {
  if (side === 'both') {
    return moments;
  }

  const color = side === 'white' ? 'w' : 'b';
  return moments.filter(moment => moment.color === color);
}

export function buildChartOptions(
  moves: StoredMove[],
  reviews: TimelineReview[],
  onPointClick?: (ply: number) => void,
): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    onClick(_event, elements) {
      const index = elements[0]?.index;

      if (typeof index === 'number') {
        onPointClick?.(index + 1);
      }
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(8, 8, 10, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        titleColor: '#f8f8f8',
        bodyColor: '#d9d9df',
        displayColors: false,
        callbacks: {
          title(items) {
            const index = items[0]?.dataIndex ?? 0;
            return `Ply ${index + 1}`;
          },
          beforeBody(items) {
            const index = items[0]?.dataIndex ?? 0;
            const move = moves[index];

            if (!move) {
              return '';
            }

            return formatTimelineMoveLabel(index, move);
          },
          label(item) {
            const value = typeof item.raw === 'number' ? item.raw : Number(item.raw ?? 0);
            return `Eval ${formatChartAxisValue(value)}`;
          },
          afterBody(items) {
            const index = items[0]?.dataIndex ?? 0;
            const review = reviews[index];

            if (!review) {
              return [];
            }

            const lines: string[] = [];

            if (review.label) {
              lines.push(review.label);
            }

            if (review.expectedPointsLost != null) {
              lines.push(`EP loss ${(review.expectedPointsLost * 100).toFixed(1)}%`);
            }

            return lines;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: 'rgba(255, 255, 255, 0.58)',
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        border: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        title: {
          display: true,
          text: 'Half-move',
          color: 'rgba(255, 255, 255, 0.62)',
        },
      },
      y: {
        suggestedMin: -8,
        suggestedMax: 8,
        ticks: {
          color: 'rgba(255, 255, 255, 0.58)',
          callback(value) {
            return formatChartAxisValue(Number(value));
          },
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        border: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        title: {
          display: true,
          text: 'White edge',
          color: 'rgba(255, 255, 255, 0.62)',
        },
      },
    },
  };
}

async function requestJson<T>(url: string, payload: unknown, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  const data = (await response.json().catch(() => ({}))) as Partial<T> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with status ${response.status}.`);
  }

  return data as T;
}

function applyUciMove(chess: Chess, move: string) {
  if (move.length < 4) {
    return null;
  }

  try {
    return chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      ...(move.length > 4 ? { promotion: move[4] } : {}),
    });
  } catch {
    return null;
  }
}

function createReviewCounter() {
  return {
    book: 0,
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    miss: 0,
    mistake: 0,
    blunder: 0,
  } satisfies ReviewCounter;
}

function parsePlayerRating(value: string | number | null | undefined) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRatingFlex(rating: number | null) {
  if (rating == null) {
    return 0.01;
  }

  if (rating <= 900) {
    return 0.02;
  }

  if (rating <= 1400) {
    return 0.015;
  }

  return 0.008;
}

function getExpectedPoints(analysis: AnalysisResult | null | undefined, color: 'w' | 'b') {
  const wdl = analysis?.whitePerspectiveWdl;

  if (wdl) {
    const total = wdl.white + wdl.draw + wdl.black;

    if (total > 0) {
      const wins = color === 'w' ? wdl.white : wdl.black;
      return (wins + wdl.draw / 2) / total;
    }
  }

  const chartValue = analysis ? toChartScore(analysis) : null;

  if (chartValue == null) {
    return null;
  }

  const perspectiveValue = color === 'w' ? chartValue : -chartValue;
  return 1 / (1 + Math.exp(-perspectiveValue / 1.35));
}

function isBookCandidate(index: number, expectedPointsLost: number | null, san: string) {
  if (index > 9 || san.includes('+') || san.includes('#')) {
    return false;
  }

  return expectedPointsLost != null && expectedPointsLost <= 0.025;
}

function getMoveAccuracy(category: ReviewCategory | null, expectedPointsLost: number | null) {
  if (!category) {
    return null;
  }

  if (category === 'book' || category === 'brilliant' || category === 'great' || category === 'best') {
    return 100;
  }

  if (expectedPointsLost == null) {
    return null;
  }

  return Math.round(Math.max(0, Math.min(100, 100 - expectedPointsLost * 260)));
}

function isReviewKeyMoment(category: ReviewCategory | null, expectedPointsLost: number | null) {
  if (!category) {
    return false;
  }

  if (category === 'brilliant' || category === 'great' || category === 'miss' || category === 'mistake' || category === 'blunder') {
    return true;
  }

  return category === 'inaccuracy' && (expectedPointsLost ?? 0) >= 0.085;
}

function buildCoachText({
  moveLabel,
  category,
  playedMove,
  bestMoveSan,
  beforeExpected,
  afterExpected,
  expectedPointsLost,
}: {
  moveLabel: string;
  category: ReviewCategory | null;
  playedMove: string;
  bestMoveSan: string | null;
  beforeExpected: number | null;
  afterExpected: number | null;
  expectedPointsLost: number | null;
}) {
  const swing =
    beforeExpected == null || afterExpected == null
      ? ''
      : ` Expected score: ${formatExpected(beforeExpected)} -> ${formatExpected(afterExpected)}.`;
  const best = bestMoveSan ? ` Best was ${bestMoveSan}.` : '';
  const loss = expectedPointsLost == null ? '' : ` Loss: ${(expectedPointsLost * 100).toFixed(1)}%.`;

  switch (category) {
    case 'book':
      return `${moveLabel} ${playedMove} stays in the opening lane.`;
    case 'brilliant':
      return `${moveLabel} ${playedMove} is a strong sacrifice that keeps or increases the advantage.${swing}`;
    case 'great':
      return `${moveLabel} ${playedMove} is a key engine-aligned move.${swing}`;
    case 'best':
      return `${moveLabel} ${playedMove} matches the engine's top choice.`;
    case 'excellent':
      return `${moveLabel} ${playedMove} is accurate with only a tiny practical loss.${loss}`;
    case 'good':
      return `${moveLabel} ${playedMove} is playable, but it leaves a little more on the board.${loss}`;
    case 'inaccuracy':
      return `${moveLabel} ${playedMove} is an inaccuracy.${swing}${best}`;
    case 'miss':
      return `${moveLabel} ${playedMove} misses a chance to punish the previous move.${swing}${best}`;
    case 'mistake':
      return `${moveLabel} ${playedMove} is a mistake.${swing}${best}`;
    case 'blunder':
      return `${moveLabel} ${playedMove} is a blunder.${swing}${best}`;
    default:
      return `${moveLabel} ${playedMove}.`;
  }
}

function calculatePlayerAccuracy(reviews: TimelineReview[], color: 'w' | 'b') {
  const accuracies = reviews
    .filter(review => review.color === color)
    .map(review => review.moveAccuracy)
    .filter((value): value is number => typeof value === 'number');

  if (accuracies.length === 0) {
    return null;
  }

  return Number((accuracies.reduce((total, value) => total + value, 0) / accuracies.length).toFixed(1));
}

function calculateGameRating(rating: number | null, accuracy: number | null) {
  if (accuracy == null) {
    return null;
  }

  const base = rating ?? 800;
  const raw = base + (accuracy - 65) * 18;
  return Math.round(Math.max(100, Math.min(3200, raw)) / 50) * 50;
}

function extractKeyMoments(reviews: TimelineReview[]) {
  const directMoments = reviews.filter(review => review.isKeyMoment);
  const selected = directMoments.length > 0 ? directMoments : reviews.filter(review => review.category && review.category !== 'book');

  return selected
    .sort((left, right) => {
      const leftLoss = left.expectedPointsLost ?? 0;
      const rightLoss = right.expectedPointsLost ?? 0;

      if (left.isKeyMoment !== right.isKeyMoment) {
        return left.isKeyMoment ? -1 : 1;
      }

      return rightLoss - leftLoss;
    })
    .slice(0, 16)
    .sort((left, right) => left.ply - right.ply);
}

function formatExpected(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getMaterialCount(chess: Chess, color: 'w' | 'b') {
  let total = 0;

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== color) {
        continue;
      }

      total += getPieceValue(piece.type);
    }
  }

  return total;
}

function isPieceSacrifice(beforeFen: string, afterFen: string, color: 'w' | 'b') {
  const before = new Chess(beforeFen);
  const after = new Chess(afterFen);

  return getMaterialCount(after, color) <= getMaterialCount(before, color) - 3;
}

function getPieceValue(piece: string) {
  switch (piece) {
    case 'p':
      return 1;
    case 'n':
    case 'b':
      return 3;
    case 'r':
      return 5;
    case 'q':
      return 9;
    default:
      return 0;
  }
}

function isMateForColor(analysis: AnalysisResult | null | undefined, color: 'w' | 'b') {
  const score = analysis?.whitePerspective;

  if (!score || score.type !== 'mate') {
    return false;
  }

  return color === 'w' ? score.value > 0 : score.value < 0;
}

function isWinningOutcome(analysis: AnalysisResult | null | undefined, color: 'w' | 'b') {
  const expectedPoints = getExpectedPoints(analysis, color);

  if (expectedPoints != null) {
    return expectedPoints >= 0.67;
  }

  const chartValue = analysis ? toChartScore(analysis) : null;

  if (chartValue == null) {
    return false;
  }

  return color === 'w' ? chartValue >= 1.8 : chartValue <= -1.8;
}

function isCompletelyWinning(analysis: AnalysisResult | null | undefined, color: 'w' | 'b') {
  const expectedPoints = getExpectedPoints(analysis, color);

  if (expectedPoints != null) {
    return expectedPoints >= 0.95;
  }

  const chartValue = analysis ? toChartScore(analysis) : null;

  if (chartValue == null) {
    return false;
  }

  return color === 'w' ? chartValue >= 5 : chartValue <= -5;
}

function formatTimelineMoveLabel(index: number, move: StoredMove) {
  const moveNumber = Math.floor(index / 2) + 1;
  return move.color === 'b' ? `${moveNumber}... ${move.san}` : `${moveNumber}. ${move.san}`;
}

function formatChartAxisValue(value: number) {
  if (Math.abs(value) >= 11.95) {
    return value > 0 ? 'Mate' : '-Mate';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}
