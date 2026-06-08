import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Chess } from 'chess.js';

const ECO_VOLUME_URLS = [
  'https://raw.githubusercontent.com/lichess-org/chess-openings/master/a.tsv',
  'https://raw.githubusercontent.com/lichess-org/chess-openings/master/b.tsv',
  'https://raw.githubusercontent.com/lichess-org/chess-openings/master/c.tsv',
  'https://raw.githubusercontent.com/lichess-org/chess-openings/master/d.tsv',
  'https://raw.githubusercontent.com/lichess-org/chess-openings/master/e.tsv',
];

function normalizeOpeningBookFen(fen) {
  return fen.trim().split(' ').slice(0, 4).join(' ');
}

function buildKeysFromPgn(pgn) {
  const chess = new Chess();
  const sans = pgn.replace(/\d+\./g, ' ').replace(/\./g, ' ').trim().split(/\s+/).filter(Boolean);
  const keys = [];

  for (const san of sans) {
    const fenBefore = chess.fen();
    let move;

    try {
      move = chess.move(san);
    } catch {
      break;
    }

    if (!move) {
      break;
    }

    keys.push(`${normalizeOpeningBookFen(fenBefore)}|${move.from}${move.to}${move.promotion ?? ''}`);
  }

  return keys;
}

async function loadEcoOpeningBookKeys() {
  const keys = new Set();

  for (const url of ECO_VOLUME_URLS) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status}`);
    }

    const tsv = await response.text();

    for (const line of tsv.split('\n').slice(1)) {
      const pgn = line.split('\t')[2];

      if (!pgn) {
        continue;
      }

      for (const key of buildKeysFromPgn(pgn)) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort();
}

const keys = await loadEcoOpeningBookKeys();
const outputPath = join(dirname(fileURLToPath(import.meta.url)), '../lib/opening-book-keys.json');
writeFileSync(outputPath, `${JSON.stringify(keys, null, 2)}\n`);
console.log(`Wrote ${keys.length} opening book keys to ${outputPath}`);
