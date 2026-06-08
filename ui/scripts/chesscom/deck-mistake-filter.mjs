import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const openingBookKeys = new Set(
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../lib/opening-book-keys.json'), 'utf8')),
);

export function normalizeOpeningBookFen(fen) {
  return fen.trim().split(' ').slice(0, 4).join(' ');
}

export function isMoveInOpeningBook(fenBefore, moveUci) {
  return openingBookKeys.has(`${normalizeOpeningBookFen(fenBefore)}|${moveUci}`);
}

export function qualifiesAsLineRootMistake({
  scoreSwingCp,
  thresholdCp,
  acceptableLossCp,
  inBook,
  playedUci,
  bestMoveUci,
}) {
  if (!bestMoveUci || scoreSwingCp == null || scoreSwingCp <= 0) {
    return false;
  }

  if (playedUci === bestMoveUci) {
    return false;
  }

  if (scoreSwingCp >= thresholdCp) {
    return true;
  }

  if (scoreSwingCp >= acceptableLossCp) {
    return true;
  }

  if (!inBook) {
    return true;
  }

  return false;
}
