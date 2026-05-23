import { Chess } from 'chess.js';

import type { AnalysisLine, AnalysisResult, PerspectiveScore } from '@/lib/analysis-types';

export type TrainingSide = 'white' | 'black';
export type DeckCardKind = 'punish_mistake' | 'repertoire_choice';

export type OpeningSeedLine = {
  id: string;
  name: string;
  eco: string;
  side: TrainingSide;
  moves: string[];
};

export type TrainingCandidate = {
  id: string;
  lineId: string;
  lineName: string;
  eco: string;
  side: TrainingSide;
  ply: number;
  fen: string;
  context: string;
  moveUci: string;
  moveSan: string;
  scoreCp: number | null;
};

export type PunishableReply = TrainingCandidate & {
  kind: 'punish_mistake';
  opponentMoveUci: string;
  opponentMoveSan: string;
  answerUci: string;
  answerSan: string;
  scoreSwingCp: number;
};

export type GeneratedDeckCard = {
  id: string;
  kind: DeckCardKind;
  lineId: string;
  lineName: string;
  eco: string;
  side: TrainingSide;
  ply: number;
  fen: string;
  answerUci: string;
  answerSan: string;
  prompt: string;
  context: string;
  opponentMoveUci?: string;
  opponentMoveSan?: string;
  scoreSwingCp?: number;
};

export type DeckCard = GeneratedDeckCard;

export type DeckFeedback = {
  correct: boolean;
  expectedSan: string;
  playedSan: string;
  scoreSwingCp?: number;
};

export const OPENING_REPERTOIRE: OpeningSeedLine[] = [
  { id: 'italian-main', name: 'Italian Game', eco: 'C50', side: 'white', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4'] },
  { id: 'ruy-lopez', name: 'Ruy Lopez', eco: 'C60', side: 'white', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'] },
  { id: 'queens-gambit', name: "Queen's Gambit Declined", eco: 'D30', side: 'white', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3'] },
  { id: 'london', name: 'London System', eco: 'D02', side: 'white', moves: ['d4', 'Nf6', 'Bf4', 'd5', 'e3', 'e6', 'Nf3', 'c5', 'c3'] },
  { id: 'sicilian-najdorf', name: 'Sicilian Najdorf', eco: 'B90', side: 'black', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  { id: 'french-advance', name: 'French Advance', eco: 'C02', side: 'black', moves: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3'] },
  { id: 'caro-kann', name: 'Caro-Kann Classical', eco: 'B18', side: 'black', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3'] },
  { id: 'kings-indian', name: "King's Indian Defense", eco: 'E60', side: 'black', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'] },
];

export function buildDeckCards(lines: OpeningSeedLine[]) {
  const cards: GeneratedDeckCard[] = [];

  for (const line of lines) {
    const chess = new Chess();
    const playedSan: string[] = [];

    for (const [index, san] of line.moves.entries()) {
      const sideToMove = chess.turn() === 'w' ? 'white' : 'black';
      const fen = chess.fen();
      const move = chess.move(san);

      if (!move) {
        break;
      }

      if (sideToMove === line.side) {
        cards.push({
          id: `${line.id}-${index + 1}`,
          kind: 'repertoire_choice',
          lineId: line.id,
          lineName: line.name,
          eco: line.eco,
          side: line.side,
          ply: index + 1,
          fen,
          answerUci: `${move.from}${move.to}${move.promotion ?? ''}`,
          answerSan: move.san,
          prompt: `${line.side === 'white' ? 'White' : 'Black'} to move: find ${line.name}`,
          context: playedSan.length > 0 ? playedSan.join(' ') : 'Starting position',
        });
      }

      playedSan.push(move.san);
    }
  }

  return cards;
}

export function buildTrainingCandidates(lines: OpeningSeedLine[]) {
  const candidates: TrainingCandidate[] = [];

  for (const line of lines) {
    const chess = new Chess();
    const playedSan: string[] = [];

    for (const [index, san] of line.moves.entries()) {
      const sideToMove = chess.turn() === 'w' ? 'white' : 'black';
      const fen = chess.fen();

      if (sideToMove !== line.side) {
        candidates.push({
          id: `${line.id}-candidate-${index + 1}`,
          lineId: line.id,
          lineName: line.name,
          eco: line.eco,
          side: line.side,
          ply: index + 1,
          fen,
          context: playedSan.length > 0 ? playedSan.join(' ') : 'Starting position',
          moveUci: '',
          moveSan: '',
          scoreCp: null,
        });
      }

      const move = chess.move(san);

      if (!move) {
        break;
      }

      playedSan.push(move.san);
    }
  }

  return candidates;
}

export function buildPunishCardsFromAnalysis(
  position: TrainingCandidate,
  opponentReplies: Array<{
    line: AnalysisLine;
    analysisAfterReply: AnalysisResult;
  }>,
  thresholdCp = 60,
) {
  const baseScore = position.scoreCp;

  if (baseScore == null) {
    return [];
  }

  const cards: GeneratedDeckCard[] = [];

  for (const { line, analysisAfterReply } of opponentReplies) {
    if (!line.bestMove || !analysisAfterReply.bestMove) {
      continue;
    }

    const afterScore = scoreToCpForSide(analysisAfterReply.whitePerspective, position.side);

    if (afterScore == null) {
      continue;
    }

    const scoreSwingCp = afterScore - baseScore;

    if (scoreSwingCp < thresholdCp) {
      continue;
    }

    const replyMove = getMoveFromFen(position.fen, line.bestMove);
    const answerMove = getMoveFromFen(analysisAfterReplyFen(position.fen, line.bestMove), analysisAfterReply.bestMove);

    if (!replyMove || !answerMove) {
      continue;
    }

    cards.push({
      id: `${position.id}-${line.bestMove}-${analysisAfterReply.bestMove}`,
      kind: 'punish_mistake',
      lineId: position.lineId,
      lineName: position.lineName,
      eco: position.eco,
      side: position.side,
      ply: position.ply,
      fen: analysisAfterReplyFen(position.fen, line.bestMove),
      answerUci: analysisAfterReply.bestMove,
      answerSan: answerMove.san,
      prompt: `Opponent played ${replyMove.san}; punish it`,
      context: position.context,
      opponentMoveUci: line.bestMove,
      opponentMoveSan: replyMove.san,
      scoreSwingCp,
    });
  }

  return cards;
}

export function buildLegitOptions(position: TrainingCandidate, analysis: AnalysisResult | null, maxScoreGapCp = 60) {
  const bestScore = scoreToCpForSide(analysis?.lines?.[0]?.whitePerspective ?? analysis?.whitePerspective ?? null, position.side);

  if (bestScore == null) {
    return [];
  }

  const options: TrainingCandidate[] = [];

  for (const line of analysis?.lines ?? []) {
    const scoreCp = scoreToCpForSide(line.whitePerspective, position.side);
    const move = line.bestMove ? getMoveFromFen(position.fen, line.bestMove) : null;

    if (!line.bestMove || !move || scoreCp == null || bestScore - scoreCp > maxScoreGapCp) {
      continue;
    }

    options.push({
      ...position,
      id: `${position.id}-legit-${line.bestMove}`,
      moveUci: line.bestMove,
      moveSan: move.san,
      scoreCp,
    });
  }

  return options;
}

export function scoreToCpForSide(score: PerspectiveScore | null | undefined, side: TrainingSide) {
  if (!score) {
    return null;
  }

  const whiteScore = score.type === 'mate' ? Math.sign(score.value) * 100000 : score.value;
  return side === 'white' ? whiteScore : -whiteScore;
}

function analysisAfterReplyFen(fen: string, moveUci: string) {
  const chess = new Chess(fen);
  chess.move({
    from: moveUci.slice(0, 2),
    to: moveUci.slice(2, 4),
    ...(moveUci[4] ? { promotion: moveUci[4] } : {}),
  });
  return chess.fen();
}

function getMoveFromFen(fen: string, moveUci: string) {
  const chess = new Chess(fen);

  try {
    return chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      ...(moveUci[4] ? { promotion: moveUci[4] } : {}),
    });
  } catch {
    return null;
  }
}
