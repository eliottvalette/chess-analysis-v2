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
};

export type ReviewCategory = 'brilliant' | 'great' | 'best' | 'miss' | 'mistake' | 'blunder';

export type TimelineReview = {
  ply: number;
  color: 'w' | 'b';
  category: ReviewCategory | null;
  label: string | null;
  colorHex: string | null;
  pointStyle: PointStyle;
  expectedPointsLost: number | null;
};

export const reviewCategoryOrder: ReviewCategory[] = ['brilliant', 'great', 'best', 'miss', 'mistake', 'blunder'];

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
  great: {
    label: 'Great',
    color: '#8f75ff',
    pointStyle: 'triangle',
  },
  best: {
    label: 'Best',
    color: '#f3f3ef00',
    pointStyle: 'rectRounded',
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

    let category: ReviewCategory | null = null;

    if (
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
    } else if ((expectedPointsLost ?? 0) >= 0.2) {
      category = 'blunder';
    } else if ((expectedPointsLost ?? 0) >= 0.1) {
      category = 'mistake';
    }

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
      expectedPointsLost: expectedPointsLost == null ? null : Number(expectedPointsLost.toFixed(3)),
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

export function buildChartOptions(moves: StoredMove[], reviews: TimelineReview[]): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
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
    brilliant: 0,
    great: 0,
    best: 0,
    miss: 0,
    mistake: 0,
    blunder: 0,
  } satisfies Record<ReviewCategory, number>;
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
