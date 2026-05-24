import type { StoredMove } from '@/lib/chess-analysis-client';

export type ChessSoundKey =
  | 'game-start'
  | 'game-end'
  | 'capture'
  | 'castle'
  | 'premove'
  | 'move-self'
  | 'move-opponent'
  | 'move-check'
  | 'promote'
  | 'notify'
  | 'illegal';

export const CHESS_SOUND_URLS: Record<ChessSoundKey, string> = {
  'game-start': 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-start.mp3',
  'game-end': 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3',
  capture: 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3',
  castle: 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/castle.mp3',
  premove: 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/premove.mp3',
  'move-self': 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3',
  'move-opponent': 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-opponent.mp3',
  'move-check': 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-check.mp3',
  promote: 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/promote.mp3',
  notify: 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/notify.mp3',
  illegal: 'http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/illegal.mp3',
};

export function getMoveSoundSequence({
  move,
  isSelfMove,
  isCheck,
  isCheckmate,
  isGameOver,
}: {
  move: StoredMove;
  isSelfMove: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isGameOver: boolean;
}): ChessSoundKey[] {
  const sounds: ChessSoundKey[] = [getPrimaryMoveSound(move, isSelfMove)];

  if (isCheck || isCheckmate) {
    sounds.push('move-check');
  }

  if (isCheckmate || isGameOver) {
    sounds.push('game-end');
  }

  return sounds;
}

export function getPrimaryMoveSound(move: StoredMove, isSelfMove: boolean): ChessSoundKey {
  if (isCastleMove(move)) {
    return 'castle';
  }

  if (move.promotion) {
    return 'promote';
  }

  if (Boolean(move.captured) || move.flags.includes('c') || move.flags.includes('e')) {
    return 'capture';
  }

  return isSelfMove ? 'move-self' : 'move-opponent';
}

function isCastleMove(move: StoredMove) {
  return move.flags.includes('k') || move.flags.includes('q');
}
