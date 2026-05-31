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
const DEFAULT_MAX_PLY = 16;
const DEFAULT_CONCURRENCY = 2;
const DECK_ID = 'recent-blitz-trainer-v1';
const execFileAsync = promisify(execFile);

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function logProgress(message) {
  console.error(`[deck-build ${new Date().toISOString()}] ${message}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const username = options.username;

  if (!username) {
    throw new Error('Usage: node scripts/chesscom/build-recent-blitz-deck.mjs --username <chesscom-username> [--profile <training-profile>] [--count 10] [--write-supabase] [--set-active]');
  }

  const env = loadLocalEnv();
  const ownerUsername = (options.profile || env.CHESSCOM_DECK_PROFILE || username).trim().toLowerCase();
  const analyzeBaseUrl = env.ANALYZE_BASE_URL?.trim() || 'http://localhost:3000';
  const depth = Number(env.CHESSCOM_DECK_DEPTH || DEFAULT_DEPTH);
  const movetimeMs = Number(env.CHESSCOM_DECK_MOVETIME_MS || DEFAULT_MOVETIME_MS);
  const thresholdCp = Number(env.CHESSCOM_DECK_THRESHOLD_CP || DEFAULT_THRESHOLD_CP);
  const acceptableLossCp = Number(env.CHESSCOM_DECK_ACCEPTABLE_LOSS_CP || DEFAULT_ACCEPTABLE_LOSS_CP);
  const multipv = Number(env.CHESSCOM_DECK_MULTIPV || DEFAULT_MULTIPV);
  const maxPly = Number(env.CHESSCOM_DECK_MAX_PLY || options.maxPly || DEFAULT_MAX_PLY);
  const concurrency = Number(env.CHESSCOM_DECK_CONCURRENCY || options.concurrency || DEFAULT_CONCURRENCY);

  logProgress(
    `starting build username=${username} profile=${ownerUsername || 'global'} count=${options.count} time_class=${options.timeClass} max_ply=${maxPly} depth=${depth} movetime_ms=${movetimeMs} concurrency=${concurrency}`,
  );
  logProgress(`checking analyze API at ${analyzeBaseUrl}`);
  await assertAnalyzeApi(analyzeBaseUrl);

  logProgress(`fetching Chess.com archives for ${username}`);
  const archives = await fetchArchives(username);
  logProgress(`fetching ${options.count} recent ${options.timeClass} games`);
  const games = await fetchRecentGames({
    username,
    archives,
    count: options.count,
    timeClass: options.timeClass,
  });
  logProgress(`fetched ${games.length} games`);

  const results = await mapWithConcurrency(games, Math.max(1, concurrency), async (game, gameIndex) => {
    const line = buildLineRecord(game, username);
    logProgress(`[${gameIndex + 1}/${games.length}] analyzing ${line.name}`);
    const gameCards = await buildCardsForGame({
      game,
      line,
      username,
      analyzeBaseUrl,
      depth,
      movetimeMs,
      multipv,
      thresholdCp,
      acceptableLossCp,
      maxPly,
      gameIndex,
      totalGames: games.length,
    });
    logProgress(`[${gameIndex + 1}/${games.length}] done ${line.name}: +${gameCards.length} cards`);
    return { gameIndex, line, cards: gameCards };
  });
  results.sort((left, right) => left.gameIndex - right.gameIndex);

  const openingLines = results.map(result => result.line);
  const cards = results.flatMap(result => result.cards);

  if (options.writeSupabase) {
    logProgress('writing deck to Supabase');
    const supabaseUrl = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
    const adminKey = requireAdminKey(env);
    const supabase = createClient(supabaseUrl, adminKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const ownerProfileId = ownerUsername ? await findTrainingProfileId(supabase, ownerUsername) : null;
    const deck = {
      id: ownerProfileId ? `${DECK_ID}-${ownerUsername}` : DECK_ID,
      owner_profile_id: ownerProfileId,
      name: ownerProfileId ? `Recent Blitz Trainer · ${ownerUsername}` : 'Recent Blitz Trainer',
      description: `Personalized fix and punish cards built from recent public ${options.timeClass} games for ${username}.`,
      version: 1,
      is_active: true,
    };
    const deckCards = cards.map(card => ({ ...card, deck_id: deck.id }));
    const deckLines = openingLines.map(line => ({ ...line, deck_id: deck.id }));

    if (ownerProfileId) {
      logProgress(`using owner training profile ${ownerProfileId}`);
    } else {
      logProgress(`no training profile found for ${username}; writing global deck`);
    }

    if (options.setActive) {
      logProgress(`deactivating sibling decks before activating ${deck.id}`);
      await deactivateSiblingDecks(supabase, deck.id, ownerProfileId);
    }

    await upsertDeck(supabase, deck);
    logProgress(`upserted deck ${deck.id}`);
    await replaceDeckContents(supabase, deck.id);
    logProgress(`cleared previous contents for ${deck.id}`);
    await upsert(supabase, 'opening_lines', deckLines, 'id');
    logProgress(`upserted ${deckLines.length} opening lines`);
    await upsert(supabase, 'deck_cards', deckCards, 'id');
    logProgress(`upserted ${deckCards.length} deck cards`);
  }

  console.log(
    JSON.stringify(
      {
        username,
        profile: ownerUsername || null,
        analyzed_games: games.length,
        threshold_cp: thresholdCp,
        acceptable_loss_cp: acceptableLossCp,
        max_ply: maxPly,
        depth,
        movetime_ms: movetimeMs,
        concurrency,
        cards: cards.length,
        top_cards: cards.slice(0, 10).map(card => ({
          id: card.id,
          kind: card.kind,
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
    profile: '',
    count: DEFAULT_COUNT,
    timeClass: DEFAULT_TIME_CLASS,
    writeSupabase: false,
    setActive: false,
    maxPly: DEFAULT_MAX_PLY,
    concurrency: DEFAULT_CONCURRENCY,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--username' && value) {
      options.username = value.trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === '--profile' && value) {
      options.profile = value.trim().toLowerCase();
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
      continue;
    }

    if (arg === '--max-ply' && value) {
      options.maxPly = Math.max(1, Number.parseInt(value, 10) || DEFAULT_MAX_PLY);
      index += 1;
      continue;
    }

    if (arg === '--concurrency' && value) {
      options.concurrency = Math.max(1, Number.parseInt(value, 10) || DEFAULT_CONCURRENCY);
      index += 1;
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
  const lineId = `recent-${username.toLowerCase()}-${game.url.split('/').pop()}`;
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
  maxPly,
  gameIndex,
  totalGames,
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
  const candidates = [];

  for (const [index, move] of verboseMoves.entries()) {
    if (index + 1 > maxPly) {
      break;
    }

    const sideToMove = chess.turn() === 'w' ? 'white' : 'black';
    const fenBefore = chess.fen();
    const moveUci = `${move.from}${move.to}${move.promotion ?? ''}`;

    if (sideToMove === playerColor) {
      const contextBeforeMove = moveHistory.length > 0 ? moveHistory.join(' ') : 'starting position';

      chess.move(move);
      moveHistory.push(move.san);

      const fenAfter = chess.fen();
      candidates.push({
        index,
        move,
        moveUci,
        fenBefore,
        fenAfter,
        contextBeforeMove,
        contextAfterMove: moveHistory.join(' '),
      });
      continue;
    }

    chess.move(move);
    moveHistory.push(move.san);
  }

  if (candidates.length === 0) {
    return cards;
  }

  logProgress(`[${gameIndex + 1}/${totalGames}] batching ${candidates.length * 2} positions for ${candidates.length} candidate moves`);
  const positions = candidates.flatMap(candidate => [
    {
      fen: candidate.fenBefore,
      multipv,
    },
    {
      fen: candidate.fenAfter,
      multipv: 1,
    },
  ]);
  const analyses = await analyzePositions(analyzeBaseUrl, {
    positions,
    depth,
    movetimeMs,
  });

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const beforeAnalysis = analyses[candidateIndex * 2];
    const afterAnalysis = analyses[candidateIndex * 2 + 1];
    const { index, move, moveUci, fenBefore, fenAfter, contextBeforeMove, contextAfterMove } = candidate;
    logProgress(`[${gameIndex + 1}/${totalGames}] ply ${index + 1}: checking your move ${move.san}`);
    const bestScore = scoreToCpForSide(beforeAnalysis?.whitePerspective, playerColor);
    const afterScore = scoreToCpForSide(afterAnalysis?.whitePerspective, playerColor);
    const punishmentScore = scoreToCpForSide(afterAnalysis?.whitePerspective, trainingSide);

    if (bestScore == null || afterScore == null || punishmentScore == null || !beforeAnalysis?.bestMove || !afterAnalysis?.bestMove) {
      logProgress(`[${gameIndex + 1}/${totalGames}] ply ${index + 1}: skipped ${move.san} (missing eval/best move)`);
      continue;
    }

    const scoreSwingCp = Math.round(bestScore - afterScore);

    if (scoreSwingCp < thresholdCp) {
      logProgress(`[${gameIndex + 1}/${totalGames}] ply ${index + 1}: ok ${move.san} loss=${scoreSwingCp}cp`);
      continue;
    }

    logProgress(
      `[${gameIndex + 1}/${totalGames}] ply ${index + 1}: found mistake ${move.san} loss=${scoreSwingCp}cp -> +2 cards`,
    );

    cards.push({
      id: `${line.id}-ply-${index + 1}-fix`,
      deck_id: DECK_ID,
      line_id: line.id,
      kind: 'repertoire_choice',
      line_name: line.name,
      eco,
      side: playerColor,
      ply: index + 1,
      fen: fenBefore,
      answer_uci: beforeAnalysis.bestMove,
      answer_san: moveFromFen(fenBefore, beforeAnalysis.bestMove)?.san ?? beforeAnalysis.bestMove,
      prompt: `In your game vs ${opponent ?? 'opponent'}, before ${move.san}, find your best move.`,
      context: `${gameDate} · ${eco} · result ${gameResult} · line ${contextBeforeMove}`,
      source_type: 'recent_game',
      validation_mode: 'within_eval_loss',
      reference_eval_cp: Math.round(bestScore),
      max_eval_loss_cp: acceptableLossCp,
      opponent_move_uci: null,
      opponent_move_san: null,
      score_swing_cp: scoreSwingCp,
    });

    cards.push({
      id: `${line.id}-ply-${index + 1}-punish`,
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
      context: `${gameDate} · ${eco} · result ${gameResult} · line ${contextAfterMove}`,
      source_type: 'recent_game',
      validation_mode: 'within_eval_loss',
      reference_eval_cp: Math.round(punishmentScore),
      max_eval_loss_cp: acceptableLossCp,
      opponent_move_uci: moveUci,
      opponent_move_san: move.san,
      score_swing_cp: scoreSwingCp,
    });
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

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
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
  const response = await postAnalyzeRequest(baseUrl, '/api/analyze-position', payload);
  return JSON.parse(response);
}

async function analyzePositions(baseUrl, payload) {
  const response = await postAnalyzeRequest(baseUrl, '/api/analyze-game', payload);
  const parsed = JSON.parse(response);
  return Array.isArray(parsed.analyses) ? parsed.analyses : [];
}

async function postAnalyzeRequest(baseUrl, path, payload) {
  try {
    const { stdout } = await execFileAsync('curl', [
      '-sS',
      '-X',
      'POST',
      `${baseUrl}${path}`,
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

async function upsertDeck(supabase, deck) {
  const { error } = await supabase.from('decks').upsert(deck, { onConflict: 'id' });

  if (!error) {
    return;
  }

  if (!error.message.includes('owner_profile_id')) {
    throw new Error(`decks: ${error.message}`);
  }

  const legacyDeck = { ...deck };
  delete legacyDeck.owner_profile_id;
  logProgress('decks.owner_profile_id is missing; writing deck without profile ownership');
  const fallback = await supabase.from('decks').upsert(legacyDeck, { onConflict: 'id' });

  if (fallback.error) {
    throw new Error(`decks: ${fallback.error.message}`);
  }
}

async function replaceDeckContents(supabase, deckId) {
  const cardDelete = await supabase.from('deck_cards').delete().eq('deck_id', deckId);

  if (cardDelete.error) {
    throw new Error(`deck_cards delete: ${cardDelete.error.message}`);
  }

  const lineDelete = await supabase.from('opening_lines').delete().eq('deck_id', deckId);

  if (lineDelete.error) {
    throw new Error(`opening_lines delete: ${lineDelete.error.message}`);
  }
}

async function deactivateSiblingDecks(supabase, deckId, ownerProfileId) {
  const deactivateQuery = supabase.from('decks').update({ is_active: false }).neq('id', deckId);
  const { error } = ownerProfileId
    ? await deactivateQuery.eq('owner_profile_id', ownerProfileId)
    : await deactivateQuery.is('owner_profile_id', null);

  if (!error) {
    return;
  }

  if (!error.message.includes('owner_profile_id')) {
    throw new Error(`deactivate decks: ${error.message}`);
  }

  logProgress('decks.owner_profile_id is missing; deactivating other decks globally');
  const fallback = await supabase.from('decks').update({ is_active: false }).neq('id', deckId);

  if (fallback.error) {
    throw new Error(`deactivate decks: ${fallback.error.message}`);
  }
}

async function findTrainingProfileId(supabase, username) {
  const { data, error } = await supabase
    .from('training_profiles')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(`training_profiles: ${error.message}`);
  }

  return data?.id ?? null;
}
