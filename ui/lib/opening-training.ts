import { Chess } from 'chess.js';

export type TrainingSide = 'white' | 'black';

export type OpeningSeedLine = {
  id: string;
  name: string;
  eco: string;
  side: TrainingSide;
  moves: string[];
};

export type DeckCard = {
  id: string;
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
};

export type DeckFeedback = {
  correct: boolean;
  expectedSan: string;
  playedSan: string;
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
  const cards: DeckCard[] = [];

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
