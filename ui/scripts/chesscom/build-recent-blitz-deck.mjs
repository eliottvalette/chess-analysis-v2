import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { fetchArchives, fetchRecentGames, extractTag } from './api.mjs';
import { loadLocalEnv, requireAdminKey, requireEnv } from '../supabase/env.mjs';

const DEFAULT_COUNT = 10;
const DEFAULT_TIME_CLASS = 'blitz';
const DEFAULT_THRESHOLD_CP = 90;
const DEFAULT_ACCEPTABLE_LOSS_CP = 35;
const DEFAULT_DEPTH = 12;
const DEFAULT_MOVETIME_MS = 250;
const DEFAULT_MULTIPV = 1;
const DECK_ID = 'recent-blitz-punishments-v1';
const execFileAsync = promisify(execFile);

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const username = options.username;

  if (!username) {
    throw new Error('Usage: node scripts/chesscom/build-recent-blitz-deck.mjs --username <chesscom-username> [--count 10] [--write-supabase] [--set-active]');
  }

  const env = loadLocalEnv();
  const analyzeBaseUrl = env.ANALYZE_BASE_URL?.trim() || 'http://localhost:3000';
  const depth = Number(env.CHESSCOM_DECK_DEPTH || DEFAULT_DEPTH);
  const movetimeMs = Number(env.CHESSCOM_DECK_MOVETIME_MS || DEFAULT_MOVETIME_MS);
  const thresholdCp = Number(env.CHESSCOM_DECK_THRESHOLD_CP || DEFAULT_THRESHOLD_CP);
  const acceptableLossCp = Number(env.CHESSCOM_DECK_ACCEPTABLE_LOSS_CP || DEFAULT_ACCEPTABLE_LOSS_CP);
  const multipv = Number(env.CHESSCOM_DECK_MULTIPV || DEFAULT_MULTIPV);

  await assertAnalyzeApi(analyzeBaseUrl);

  const archives = await fetchArchives(username);
  const games = await fetchRecentGames({
    username,
    archives,
    count: options.count,
    timeClass: options.timeClass,
  });

  const deck = {
    id: DECK_ID,
    name: 'Recent Blitz Punishments',
    description: `Personalized punish cards built from recent public ${options.timeClass} games for ${username}.`,
    version: 1,
    is_active: options.setActive,
  };

  const openingLines = [];
  const cards = [];

  for (const game of games) {
    const line = buildLineRecord(game, username);
    openingLines.push(line);
    cards.push(
      ...(await buildCardsForGame({
        game,
        line,
        username,
        analyzeBaseUrl,
        depth,
        movetimeMs,
        multipv,
        thresholdCp,
        acceptableLossCp,
      })),
    );
  }

  if (options.writeSupabase) {
    const supabaseUrl = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
    const adminKey = requireAdminKey(env);
    const supabase = createClient(supabaseUrl, adminKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (options.setActive) {
      const { error: deactivateError } = await supabase.from('decks').update({ is_active: false }).neq('id', DECK_ID);

      if (deactivateError) {
        throw new Error(`deactivate decks: ${deactivateError.message}`);
      }
    }

    await upsert(supabase, 'decks', deck, 'id');
    await upsert(supabase, 'opening_lines', openingLines, 'id');
    await upsert(supabase, 'deck_cards', cards, 'id');
  }

  console.log(
    JSON.stringify(
      {
        username,
        analyzed_games: games.length,
        threshold_cp: thresholdCp,
        acceptable_loss_cp: acceptableLossCp,
        depth,
        movetime_ms: movetimeMs,
        cards: cards.length,
        top_cards: cards.slice(0, 10).map(card => ({
          id: card.id,
          line_name: card.line_name,
          prompt: card.prompt,
          score_swing_cp: card.score_swing_cp,
          source: card.context,
        })),
        wrote_supabase: options.writeSupabase,
        set_active: options.setActive,
      },
      null,
      2,
    ),
  );
}

function parseArgs(args) {
  const options = {
    username: '',
    count: DEFAULT_COUNT,
    timeClass: DEFAULT_TIME_CLASS,
    writeSupabase: false,
    setActive: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--username' && value) {
      options.username = value.trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === '--count' && value) {
      options.count = Math.max(1, Number.parseInt(value, 10) || DEFAULT_COUNT);
      index += 1;
      continue;
    }

    if (arg === '--time-class' && value) {
      options.timeClass = value.trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === '--write-supabase') {
      options.writeSupabase = true;
      continue;
    }

    if (arg === '--set-active') {
      options.setActive = true;
    }
  }

  return options;
}

function buildLineRecord(game, username) {
  const playerColor = inferPlayerColor(game, username);
  const trainingSide = oppositeSide(playerColor);
  const opponent = playerColor === 'white' ? game.black?.username : game.white?.username;
  const eco = extractTag(game.pgn, 'ECO') ?? 'GAME';
  const date = extractTag(game.pgn, 'UTCDate') ?? 'recent';
  const lineId = `recent-${game.url.split('/').pop()}`;
  const lineName = `${date} vs ${opponent ?? 'opponent'} · ${eco}`;
  const moves = extractSanMoves(game.pgn);

  return {
    id: lineId,
    deck_id: DECK_ID,
    name: lineName,
    eco,
    side: trainingSide,
    moves,
  };
}

async function buildCardsForGame({
  game,
  line,
  username,
  analyzeBaseUrl,
  depth,
  movetimeMs,
  multipv,
  thresholdCp,
  acceptableLossCp,
}) {
  const cards = [];
  const playerColor = inferPlayerColor(game, username);
  const trainingSide = oppositeSide(playerColor);
  const gameDate = extractTag(game.pgn, 'UTCDate') ?? '';
  const opponent = playerColor === 'white' ? game.black?.username : game.white?.username;
  const eco = extractTag(game.pgn, 'ECO') ?? line.eco;
  const gameResult = extractTag(game.pgn, 'Result') ?? '';
  const chess = new Chess();
  const verboseMoves = loadVerboseMoves(game.pgn);
  const moveHistory = [];

  for (const [index, move] of verboseMoves.entries()) {
    const sideToMove = chess.turn() === 'w' ? 'white' : 'black';
    const fenBefore = chess.fen();
    const moveUci = `${move.from}${move.to}${move.promotion ?? ''}`;

    if (sideToMove === playerColor) {
      const beforeAnalysis = await analyzePosition(analyzeBaseUrl, {
        fen: fenBefore,
        depth,
        movetimeMs,
        multipv,
      });
      const bestScore = scoreToCpForSide(beforeAnalysis.whitePerspective, playerColor);

      chess.move(move);
      moveHistory.push(move.san);

      const fenAfter = chess.fen();
      const afterAnalysis = await analyzePosition(analyzeBaseUrl, {
        fen: fenAfter,
        depth,
        movetimeMs,
        multipv: 1,
      });
      const afterScore = scoreToCpForSide(afterAnalysis.whitePerspective, playerColor);
      const punishmentScore = scoreToCpForSide(afterAnalysis.whitePerspective, trainingSide);

      if (bestScore == null || afterScore == null || punishmentScore == null || !afterAnalysis.bestMove) {
        continue;
      }

      const scoreSwingCp = Math.round(bestScore - afterScore);

      if (scoreSwingCp < thresholdCp) {
        continue;
      }

      cards.push({
        id: `${line.id}-ply-${index + 1}`,
        deck_id: DECK_ID,
        line_id: line.id,
        kind: 'punish_mistake',
        line_name: line.name,
        eco,
        side: trainingSide,
        ply: index + 1,
        fen: fenAfter,
        answer_uci: afterAnalysis.bestMove,
        answer_san: moveFromFen(fenAfter, afterAnalysis.bestMove)?.san ?? afterAnalysis.bestMove,
        prompt: `In your game vs ${opponent ?? 'opponent'}, you played ${move.san}. Find the opponent's best punishment.`,
        context: `${gameDate} · ${eco} · result ${gameResult} · line ${moveHistory.join(' ')}`,
        source_type: 'recent_game',
        validation_mode: 'within_eval_loss',
        reference_eval_cp: Math.round(punishmentScore),
        max_eval_loss_cp: acceptableLossCp,
        opponent_move_uci: moveUci,
        opponent_move_san: move.san,
        score_swing_cp: scoreSwingCp,
      });
      continue;
    }

    chess.move(move);
    moveHistory.push(move.san);
  }

  return cards.sort((left, right) => (right.score_swing_cp ?? 0) - (left.score_swing_cp ?? 0));
}

function loadVerboseMoves(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.history({ verbose: true });
}

function extractSanMoves(pgn) {
  return loadVerboseMoves(pgn).map(move => move.san);
}

function inferPlayerColor(game, username) {
  return game.white?.username?.toLowerCase() === username.toLowerCase() ? 'white' : 'black';
}

function oppositeSide(side) {
  return side === 'white' ? 'black' : 'white';
}

async function assertAnalyzeApi(baseUrl) {
  const response = await analyzePosition(baseUrl, {
    fen: new Chess().fen(),
    depth: 1,
    movetimeMs: 10,
    multipv: 1,
  });

  if (!response?.bestMove) {
    throw new Error(`Analyze API is not ready at ${baseUrl}.`);
  }
}

async function analyzePosition(baseUrl, payload) {
  const response = await postAnalyzeRequest(baseUrl, payload);
  return JSON.parse(response);
}

async function postAnalyzeRequest(baseUrl, payload) {
  try {
    const { stdout } = await execFileAsync('curl', [
      '-sS',
      '-X',
      'POST',
      `${baseUrl}/api/analyze-position`,
      '-H',
      'content-type: application/json',
      '--data-binary',
      JSON.stringify(payload),
    ]);

    return stdout;
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    throw new Error(`Analyze API is unreachable at ${baseUrl}.${detail}`);
  }
}

function scoreToCpForSide(score, side) {
  if (!score) {
    return null;
  }

  const whiteScore = score.type === 'mate' ? Math.sign(score.value) * 100000 : score.value;
  return side === 'white' ? whiteScore : -whiteScore;
}

function moveFromFen(fen, uci) {
  const chess = new Chess(fen);

  try {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] } : {}),
    });

    return {
      san: move.san,
      afterFen: chess.fen(),
    };
  } catch {
    return null;
  }
}

async function upsert(supabase, table, rows, onConflict) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict });

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
}
