import { Chess } from 'chess.js';
import type { ChartOptions } from 'chart.js';

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

export const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
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

  return chess.move({
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    ...(move.length > 4 ? { promotion: move[4] } : {}),
  });
}
