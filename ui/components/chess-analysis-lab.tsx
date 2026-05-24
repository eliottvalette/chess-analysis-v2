'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
} from 'chart.js';

import type { AnalysisResult } from '@/lib/analysis-types';
import {
  PgnImportDialog,
  ReviewPanel,
  TrainPanel,
  getModeLabel,
  type WorkspaceMode,
} from '@/components/chess-lab-panels';
import {
  analyzeGamePositions,
  analyzeSinglePosition,
  buildChartOptions,
  buildGameReview,
  buildMoveUciHistory,
  buildTimelineSequencePositions,
  classifyTimelineMoves,
  extractMetadataFromGame,
  filterReviewMoments,
  formatBestMove,
  formatScoreLabel,
  getAdvantageMeter,
  getBestMoveArrow,
  restoreGameFromHistory,
  toChartScore,
  toStoredMove,
  type GameMetadata,
  type ReviewSide,
  type StoredMove,
} from '@/lib/chess-analysis-client';
import { CHESS_SOUND_URLS, getMoveSoundSequence, type ChessSoundKey } from '@/lib/chess-sounds';
import {
  buildPendingDeckFeedback,
  finalizeDeckFeedback,
  type DeckCard,
  type DeckFeedback,
  type OpeningSeedLine,
  scoreToCpForSide,
} from '@/lib/opening-training';
import {
  applyDeckAttempt,
  getDeckProgressEntry,
  summarizeDeckProgress,
  toggleDeckIgnored,
  type DeckProgressMap,
} from '@/lib/deck-progress';
import type { ChessComRecentGameSummary } from '@/lib/chesscom';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';
import styles from './chess-analysis-lab.module.css';

const Chessboard = dynamic(() => import('@/components/chessboard-client'), {
  ssr: false,
  loading: () => <div className={styles.boardFallback}>Loading board...</div>,
});

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const POSITION_DEPTH = 24;
const POSITION_MOVETIME_MS = 500;
const TIMELINE_MOVETIME_MS = 80;
const POSITION_MULTIPV = 3;
const PRELOAD_AHEAD = 1;
const DECK_CARD_SELECT =
  'id,kind,line_id,line_name,eco,side,ply,fen,answer_uci,answer_san,prompt,context,source_type,validation_mode,reference_eval_cp,max_eval_loss_cp,opponent_move_uci,opponent_move_san,score_swing_cp';
const CHESSCOM_USERNAME_COOKIE = 'chesscom_username';
const CHESSCOM_TIME_CLASS_COOKIE = 'chesscom_time_class';
const DECK_PROGRESS_STORAGE_KEY = 'chess-lab-deck-progress-v1';

export function ChessAnalysisLab() {
  const [game, setGame] = useState(() => new Chess());
  const [initialFen, setInitialFen] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<StoredMove[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, CSSProperties>>({});
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [showArrow, setShowArrow] = useState(true);
  const [mode, setMode] = useState<WorkspaceMode>('review');
  const [reviewSide, setReviewSide] = useState<ReviewSide>('both');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [metadata, setMetadata] = useState<GameMetadata | null>(null);
  const [fileName, setFileName] = useState('');
  const [pgnDraft, setPgnDraft] = useState('');
  const [pgnDialogOpen, setPgnDialogOpen] = useState(false);
  const [positionAnalysis, setPositionAnalysis] = useState<AnalysisResult | null>(null);
  const [preMoveAnalyses, setPreMoveAnalyses] = useState<AnalysisResult[]>([]);
  const [timelineAnalyses, setTimelineAnalyses] = useState<AnalysisResult[]>([]);
  const [positionLoading, setPositionLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [timelineError, setTimelineError] = useState('');
  const [boardWidth, setBoardWidth] = useState(640);
  const [deckIndex, setDeckIndex] = useState(0);
  const [activeDeckCard, setActiveDeckCard] = useState<DeckCard | null>(null);
  const [deckFeedback, setDeckFeedback] = useState<DeckFeedback | null>(null);
  const [openingLines, setOpeningLines] = useState<OpeningSeedLine[]>([]);
  const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
  const [deckLoading, setDeckLoading] = useState(true);
  const [deckLoadError, setDeckLoadError] = useState('');
  const [deckProgress, setDeckProgress] = useState<DeckProgressMap>({});
  const [chesscomUsername, setChesscomUsername] = useState('');
  const [recentGameTimeClass, setRecentGameTimeClass] = useState<'bullet' | 'blitz' | 'rapid'>('blitz');
  const [recentChessGames, setRecentChessGames] = useState<ChessComRecentGameSummary[]>([]);
  const [recentChessGamesLoading, setRecentChessGamesLoading] = useState(false);
  const [recentChessGamesError, setRecentChessGamesError] = useState('');

  const boardStageRef = useRef<HTMLDivElement | null>(null);
  const evalRailRef = useRef<HTMLDivElement | null>(null);
  const positionRequestIdRef = useRef(0);
  const timelineRequestIdRef = useRef(0);
  const suppressSpaceKeyUpRef = useRef(false);
  const soundPlayersRef = useRef<Partial<Record<ChessSoundKey, HTMLAudioElement>>>({});
  const positionCacheRef = useRef(new Map<string, AnalysisResult>());
  const positionInFlightRef = useRef(new Map<string, Promise<AnalysisResult>>());

  const currentFen = useMemo(() => game.fen(), [game]);
  const currentMoves = useMemo(() => moveHistory.slice(0, historyIndex), [historyIndex, moveHistory]);
  const currentMoveList = useMemo(() => buildMoveUciHistory(currentMoves), [currentMoves]);
  const currentLineKey = currentMoveList.join(' ');
  const whiteAdvantage = getAdvantageMeter(positionAnalysis);
  const isViewingDeckFailurePosition =
    activeDeckCard != null &&
    deckFeedback != null &&
    !deckFeedback.pending &&
    !deckFeedback.correct &&
    historyIndex === moveHistory.length &&
    isOpponentTurnFromFen(currentFen, activeDeckCard.side);
  const bestMoveArrow = showArrow && !activeDeckCard ? getBestMoveArrow(positionAnalysis?.bestMove ?? null) : [];
  const deckAnswerArrow =
    deckFeedback && activeDeckCard && !deckFeedback.pending && !deckFeedback.correct ? getBestMoveArrow(activeDeckCard.answerUci) : [];
  const deckOpponentArrow =
    isViewingDeckFailurePosition && !positionLoading && positionAnalysis?.bestMove
      ? getBestMoveArrow(positionAnalysis?.bestMove ?? null, '#ff456f')
      : [];
  const deckOpponentBestSan =
    isViewingDeckFailurePosition && !positionLoading && positionAnalysis?.bestMove
      ? formatBestMove(currentFen, positionAnalysis.bestMove)
      : null;
  const boardArrows = activeDeckCard ? dedupeBoardArrows([...deckAnswerArrow, ...deckOpponentArrow]) : bestMoveArrow;
  const whiteReviewName = metadata?.whitePlayer ?? 'White';
  const blackReviewName = metadata?.blackPlayer ?? 'Black';
  const hasLoadedGame = moveHistory.length > 0 && metadata !== null;
  const availableDeckCards = useMemo(
    () => deckCards.filter(card => !getDeckProgressEntry(deckProgress, card.id).ignored),
    [deckCards, deckProgress],
  );
  const deckStats = useMemo(() => summarizeDeckProgress(deckCards, deckProgress), [deckCards, deckProgress]);
  const nextDeckCard = availableDeckCards[deckIndex % Math.max(1, availableDeckCards.length)] ?? null;
  const viewedDeckCard = activeDeckCard ?? nextDeckCard;
  const activeDeckProgress = useMemo(
    () => (viewedDeckCard ? getDeckProgressEntry(deckProgress, viewedDeckCard.id) : null),
    [deckProgress, viewedDeckCard],
  );
  const reviewPlayerSide = useMemo(() => {
    if (!metadata) {
      return null;
    }

    const username = chesscomUsername.trim().toLowerCase();

    if (!username) {
      return null;
    }

    if (metadata.whitePlayer.trim().toLowerCase() === username) {
      return 'white' as const;
    }

    if (metadata.blackPlayer.trim().toLowerCase() === username) {
      return 'black' as const;
    }

    return null;
  }, [chesscomUsername, metadata]);

  const timelineReviews = useMemo(
    () => classifyTimelineMoves(moveHistory, preMoveAnalyses, timelineAnalyses, initialFen, metadata),
    [initialFen, metadata, moveHistory, preMoveAnalyses, timelineAnalyses],
  );
  const gameReview = useMemo(() => buildGameReview(timelineReviews, metadata), [metadata, timelineReviews]);
  const reviewMoments = useMemo(
    () => filterReviewMoments(gameReview.keyMoments, reviewSide),
    [gameReview.keyMoments, reviewSide],
  );
  const activeReviewMoment = reviewMoments[reviewIndex] ?? null;
  const chartConfig = buildChartOptions(moveHistory, timelineReviews, ply => {
    jumpToIndex(ply);
  });

  const chartData = useMemo<ChartData<'line', number[], number>>(
    () => ({
      labels: timelineAnalyses.map((_, index) => index + 1),
      datasets: [
        {
          data: timelineAnalyses.map(analysis => toChartScore(analysis)),
          borderColor: '#98b8ff',
          backgroundColor: 'rgba(152, 184, 255, 0.14)',
          fill: true,
          borderWidth: 2,
          pointRadius: timelineReviews.map(review => (review.isKeyMoment ? 4.4 : 0)),
          pointHoverRadius: timelineReviews.map(review => (review.isKeyMoment ? 6 : 3)),
          pointBorderWidth: timelineReviews.map(review => (review.isKeyMoment ? 1.5 : 0)),
          pointBackgroundColor: timelineReviews.map(review => (review.isKeyMoment ? (review.colorHex ?? '#98b8ff') : '#98b8ff')),
          pointBorderColor: timelineReviews.map(review => (review.isKeyMoment ? (review.colorHex ?? '#98b8ff') : '#98b8ff')),
          pointStyle: timelineReviews.map(review => (review.isKeyMoment ? review.pointStyle : 'circle')),
          tension: 0.28,
        },
      ],
    }),
    [timelineAnalyses, timelineReviews],
  );

  const movePairs = useMemo(() => {
    const pairs: Array<{
      moveNumber: number;
      white: StoredMove | null;
      whitePly: number;
      black: StoredMove | null;
      blackPly: number;
    }> = [];

    for (let index = 0; index < moveHistory.length; index += 2) {
      pairs.push({
        moveNumber: index / 2 + 1,
        white: moveHistory[index] ?? null,
        whitePly: index + 1,
        black: moveHistory[index + 1] ?? null,
        blackPly: index + 2,
      });
    }

    return pairs;
  }, [moveHistory]);

  const fetchCachedPositionAnalysis = useCallback(
    (cacheKey: string, fen: string, moves: string[]) => {
      const cachedAnalysis = positionCacheRef.current.get(cacheKey);

      if (cachedAnalysis) {
        return Promise.resolve(cachedAnalysis);
      }

      const inFlight = positionInFlightRef.current.get(cacheKey);

      if (inFlight) {
        return inFlight;
      }

      const request = analyzeSinglePosition({
        fen,
        initialFen,
        moves,
        depth: POSITION_DEPTH,
        movetimeMs: POSITION_MOVETIME_MS,
        multipv: POSITION_MULTIPV,
      })
        .then(analysis => {
          positionCacheRef.current.set(cacheKey, analysis);
          return analysis;
        })
        .finally(() => {
          positionInFlightRef.current.delete(cacheKey);
        });

      positionInFlightRef.current.set(cacheKey, request);
      return request;
    },
    [initialFen],
  );

  useEffect(() => {
    const stage = boardStageRef.current;

    if (!stage || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const railRect = evalRailRef.current?.getBoundingClientRect();
      const stageWidth = entry.contentRect.width;
      const stageHeight = entry.contentRect.height;
      const gap = 26;
      const railWidth = railRect?.width ?? 0;
      const railHeight = railRect?.height ?? 0;
      const isHorizontalRail = railWidth > railHeight * 1.6;
      const availableWidth = isHorizontalRail ? stageWidth - 12 : stageWidth - railWidth - gap;
      const availableHeight = isHorizontalRail ? stageHeight - railHeight - gap : stageHeight - 12;

      setBoardWidth(Math.max(188, Math.floor(Math.min(availableWidth, availableHeight))));
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const fetchRecentChessGames = useCallback(
    async (usernameOverride?: string, timeClassOverride?: 'bullet' | 'blitz' | 'rapid') => {
      const username = (usernameOverride ?? chesscomUsername).trim().toLowerCase();
      const timeClass = timeClassOverride ?? recentGameTimeClass;

      if (!username) {
        setRecentChessGames([]);
        setRecentChessGamesError('Enter a Chess.com username.');
        return;
      }

      setRecentChessGamesLoading(true);
      setRecentChessGamesError('');

      try {
        writeCookie(CHESSCOM_USERNAME_COOKIE, username);
        writeCookie(CHESSCOM_TIME_CLASS_COOKIE, timeClass);
        const response = await fetch(`/api/chesscom/recent-games?username=${encodeURIComponent(username)}&timeClass=${encodeURIComponent(timeClass)}&count=6`);
        const payload = (await response.json()) as { error?: string; games?: ChessComRecentGameSummary[] };

        if (!response.ok) {
          throw new Error(payload.error ?? `Chess.com fetch failed: HTTP ${response.status}`);
        }

        setRecentChessGames(Array.isArray(payload.games) ? payload.games : []);
      } catch (error) {
        setRecentChessGames([]);
        setRecentChessGamesError(error instanceof Error ? error.message : 'Unable to fetch Chess.com games.');
      } finally {
        setRecentChessGamesLoading(false);
      }
    },
    [chesscomUsername, recentGameTimeClass],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(DECK_PROGRESS_STORAGE_KEY);

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as DeckProgressMap;
      setDeckProgress(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setDeckProgress({});
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(DECK_PROGRESS_STORAGE_KEY, JSON.stringify(deckProgress));
  }, [deckProgress]);

  useEffect(() => {
    const savedUsername = readCookie(CHESSCOM_USERNAME_COOKIE);
    const savedTimeClass = readCookie(CHESSCOM_TIME_CLASS_COOKIE);

    if (savedTimeClass === 'bullet' || savedTimeClass === 'blitz' || savedTimeClass === 'rapid') {
      setRecentGameTimeClass(savedTimeClass);
    }

    if (!savedUsername) {
      return;
    }

    setChesscomUsername(savedUsername);
    void fetchRecentChessGames(savedUsername, savedTimeClass === 'bullet' || savedTimeClass === 'blitz' || savedTimeClass === 'rapid' ? savedTimeClass : 'blitz');
  }, [fetchRecentChessGames]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const players = Object.fromEntries(
      Object.entries(CHESS_SOUND_URLS).map(([key, url]) => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        return [key, audio];
      }),
    ) as Partial<Record<ChessSoundKey, HTMLAudioElement>>;

    soundPlayersRef.current = players;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDeck() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !publishableKey) {
        if (!cancelled) {
          setOpeningLines([]);
          setDeckCards([]);
          setDeckLoadError('Supabase deck is not configured in this deployment.');
          setDeckLoading(false);
        }
        return;
      }

      setDeckLoading(true);
      setDeckLoadError('');

      try {
        const supabase = createSupabaseClient();
        const { data: activeDeck, error: deckError } = await supabase
          .from('decks')
          .select('id')
          .eq('is_active', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (deckError) {
          throw new Error(deckError.message);
        }

        if (!activeDeck) {
          if (!cancelled) {
            setOpeningLines([]);
            setDeckCards([]);
          }
          return;
        }

        const [{ data: lines, error: linesError }, { data: cards, error: cardsError }] = await Promise.all([
          supabase.from('opening_lines').select('id,name,eco,side,moves').eq('deck_id', activeDeck.id).order('id'),
          supabase
            .from('deck_cards')
            .select(DECK_CARD_SELECT)
            .eq('deck_id', activeDeck.id)
            .eq('kind', 'punish_mistake')
            .order('score_swing_cp', { ascending: false, nullsFirst: false }),
        ]);

        if (linesError) {
          throw new Error(linesError.message);
        }

        if (cardsError) {
          throw new Error(cardsError.message);
        }

        if (cancelled) {
          return;
        }

        setOpeningLines(
          (lines ?? []).map((line: { id: string; name: string; eco: string; side: string; moves: string[] | null }) => ({
            id: String(line.id),
            name: String(line.name),
            eco: String(line.eco),
            side: line.side === 'black' ? 'black' : 'white',
            moves: Array.isArray(line.moves) ? line.moves.map(move => String(move)) : [],
          })),
        );
        setDeckCards(
          (
            cards ?? []
          ).map(
            (card: {
              id: string;
              line_id: string | null;
              line_name: string;
              eco: string;
              side: string;
              ply: number;
              fen: string;
              answer_uci: string;
              answer_san: string;
              prompt: string;
              context: string;
              source_type?: string | null;
              validation_mode?: string | null;
              reference_eval_cp?: number | null;
              max_eval_loss_cp?: number | null;
              opponent_move_uci?: string | null;
              opponent_move_san?: string | null;
              score_swing_cp?: number | null;
            }) => ({
            id: String(card.id),
            kind: 'punish_mistake',
            lineId: card.line_id ? String(card.line_id) : '',
            lineName: String(card.line_name),
            eco: String(card.eco),
            side: card.side === 'black' ? 'black' : 'white',
            ply: Number(card.ply),
            fen: String(card.fen),
            answerUci: String(card.answer_uci),
            answerSan: String(card.answer_san),
            prompt: String(card.prompt),
            context: String(card.context),
            sourceType: card.source_type === 'recent_game' ? 'recent_game' : 'opening_seed',
            validationMode: card.validation_mode === 'within_eval_loss' ? 'within_eval_loss' : 'strict_best',
            referenceEvalCp: typeof card.reference_eval_cp === 'number' ? card.reference_eval_cp : undefined,
            maxEvalLossCp: typeof card.max_eval_loss_cp === 'number' ? card.max_eval_loss_cp : undefined,
            opponentMoveUci: card.opponent_move_uci ? String(card.opponent_move_uci) : undefined,
            opponentMoveSan: card.opponent_move_san ? String(card.opponent_move_san) : undefined,
            scoreSwingCp: typeof card.score_swing_cp === 'number' ? card.score_swing_cp : undefined,
            }),
          ),
        );
        setDeckIndex(0);
      } catch (error) {
        if (!cancelled) {
          setOpeningLines([]);
          setDeckCards([]);
          setDeckLoadError(normalizeDeckLoadError(error instanceof Error ? error.message : 'Unable to load Supabase deck.'));
        }
      } finally {
        if (!cancelled) {
          setDeckLoading(false);
        }
      }
    }

    void loadDeck();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const requestId = ++positionRequestIdRef.current;
    const cacheKey = getPositionCacheKey(initialFen, currentMoveList);
    const cachedAnalysis = positionCacheRef.current.get(cacheKey);

    if (cachedAnalysis) {
      setPositionAnalysis(cachedAnalysis);
      setPositionLoading(false);
      setServerError('');
      return undefined;
    }

    setPositionLoading(true);
    setServerError('');
    setPositionAnalysis(null);

    fetchCachedPositionAnalysis(cacheKey, currentFen, currentMoveList)
      .then(analysis => {
        if (positionRequestIdRef.current === requestId) {
          setPositionAnalysis(analysis);
        }
      })
      .catch(error => {
        if (positionRequestIdRef.current === requestId) {
          setPositionAnalysis(null);
          setServerError(error.message);
        }
      })
      .finally(() => {
        if (positionRequestIdRef.current === requestId) {
          setPositionLoading(false);
        }
      });

    return undefined;
  }, [currentFen, currentLineKey, currentMoveList, fetchCachedPositionAnalysis, initialFen]);

  useEffect(() => {
    if (moveHistory.length === 0 || historyIndex >= moveHistory.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      for (let index = historyIndex + 1; index <= Math.min(moveHistory.length, historyIndex + PRELOAD_AHEAD); index += 1) {
        const moves = buildMoveUciHistory(moveHistory.slice(0, index));
        const cacheKey = getPositionCacheKey(initialFen, moves);

        if (positionCacheRef.current.has(cacheKey) || positionInFlightRef.current.has(cacheKey)) {
          continue;
        }

        const nextGame = restoreGameFromHistory(moveHistory, initialFen, index);
        void fetchCachedPositionAnalysis(cacheKey, nextGame.fen(), moves).catch(() => undefined);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [fetchCachedPositionAnalysis, historyIndex, initialFen, moveHistory]);

  useEffect(() => {
    if (!activeDeckCard || !deckFeedback?.pending || positionLoading || historyIndex !== moveHistory.length) {
      return;
    }

    const resultingEvalCp = scoreToCpForSide(positionAnalysis?.whitePerspective, activeDeckCard.side);

    if (resultingEvalCp == null) {
      return;
    }

    const gradedFeedback = finalizeDeckFeedback(activeDeckCard, deckFeedback, resultingEvalCp);

    setDeckFeedback(gradedFeedback);
    setDeckProgress(progress => applyDeckAttempt(progress, activeDeckCard.id, gradedFeedback.correct, new Date().toISOString()));
  }, [activeDeckCard, deckFeedback, historyIndex, moveHistory.length, positionAnalysis, positionLoading]);

  useEffect(() => {
    setReviewIndex(value => Math.max(0, Math.min(value, Math.max(0, reviewMoments.length - 1))));
  }, [reviewMoments.length]);

  function clearSelection() {
    setSelectedSquare(null);
    setSquareStyles({});
  }

  function highlightMoves(square: string) {
    const nextStyles: Record<string, CSSProperties> = {
      [square]: {
        boxShadow: 'inset 0 0 0 3px rgba(152, 184, 255, 0.9)',
        backgroundColor: 'rgba(152, 184, 255, 0.18)',
      },
    };

    const moves = game.moves({ square: square as Square, verbose: true });

    for (const move of moves) {
      nextStyles[move.to] = game.get(move.to)
        ? {
            boxShadow: 'inset 0 0 0 2px rgba(242, 243, 245, 0.34)',
            background:
              'radial-gradient(circle, rgba(152, 184, 255, 0.28) 0%, rgba(152, 184, 255, 0.08) 54%, transparent 56%)',
          }
        : {
            background:
              'radial-gradient(circle, rgba(242, 243, 245, 0.5) 0%, rgba(242, 243, 245, 0.32) 16%, transparent 18%)',
          };
    }

    setSquareStyles(nextStyles);
  }

  const commitMove = useCallback(
    (nextGame: Chess, move: StoredMove) => {
      const nextHistory = [...moveHistory.slice(0, historyIndex), move];

      setMoveHistory(nextHistory);
      setHistoryIndex(nextHistory.length);
      setGame(nextGame);
      setPositionAnalysis(null);
      setTimelineAnalyses([]);
      setServerError('');
      setTimelineError('');
      setSelectedSquare(null);
      setSquareStyles({});
      playSoundSequence(
        getMoveSoundSequence({
          move,
          isSelfMove: true,
          isCheck: nextGame.isCheck(),
          isCheckmate: nextGame.isCheckmate(),
          isGameOver: nextGame.isGameOver(),
        }),
      );

      if (activeDeckCard && deckFeedback == null) {
        const nextFeedback = buildPendingDeckFeedback(activeDeckCard, move.uci, move.san);

        if (nextFeedback.pending) {
          setDeckFeedback(nextFeedback);
        } else {
          const gradedFeedback = finalizeDeckFeedback(activeDeckCard, nextFeedback, null);
          setDeckFeedback(gradedFeedback);
          setDeckProgress(progress => applyDeckAttempt(progress, activeDeckCard.id, gradedFeedback.correct, new Date().toISOString()));
        }
      }
    },
    [activeDeckCard, deckFeedback, historyIndex, moveHistory],
  );

  const tryMove = useCallback(
    (from: string, to: string, promotion = 'q') => {
      const nextGame = new Chess(currentFen);
      const move = (() => {
        try {
          return nextGame.move({ from, to, promotion });
        } catch {
          return null;
        }
      })();

      if (!move) {
        playSound('illegal');
        return false;
      }

      commitMove(nextGame, toStoredMove(move));
      return true;
    },
    [commitMove, currentFen],
  );

  function jumpToIndex(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, moveHistory.length));
    const nextGame = restoreGameFromHistory(moveHistory, initialFen, boundedIndex);

    setHistoryIndex(boundedIndex);
    setGame(nextGame);
    clearSelection();
  }

  const loadDeckCard = useCallback((card: DeckCard | null) => {
    if (!card) {
      return;
    }

    const deckState = buildDeckCardState(card, openingLines);

    setInitialFen(deckState.initialFen);
    setMoveHistory(deckState.moveHistory);
    setHistoryIndex(deckState.historyIndex);
    setGame(deckState.game);
    setMetadata(null);
    setFileName('');
    setPreMoveAnalyses([]);
    setMode('train');
    setActiveDeckCard(card);
    setDeckFeedback(null);
    setOrientation(card.side);
    setShowArrow(false);
    setPositionAnalysis(null);
    setTimelineAnalyses([]);
    setTimelineError('');
    clearSelection();
    playSound('game-start');
  }, [openingLines]);

  const advanceDeckCard = useCallback(() => {
    if (availableDeckCards.length === 0) {
      return;
    }

    const currentCardId = activeDeckCard?.id ?? nextDeckCard?.id ?? null;
    const currentIndex = currentCardId ? availableDeckCards.findIndex(card => card.id === currentCardId) : -1;
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % availableDeckCards.length : deckIndex % availableDeckCards.length;

    setDeckIndex(nextIndex);
    loadDeckCard(availableDeckCards[nextIndex]);
  }, [activeDeckCard, availableDeckCards, deckIndex, loadDeckCard, nextDeckCard]);

  const repeatDeckCard = useCallback(() => {
    loadDeckCard(activeDeckCard ?? nextDeckCard);
  }, [activeDeckCard, loadDeckCard, nextDeckCard]);

  function toggleActiveDeckCardIgnored() {
    const card = activeDeckCard ?? nextDeckCard;

    if (!card) {
      return;
    }

    setDeckProgress(progress => toggleDeckIgnored(progress, card.id));
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isTyping || pgnDialogOpen) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        event.stopPropagation();
        suppressSpaceKeyUpRef.current = true;

        if (mode === 'train' && activeDeckCard) {
          if (activeDeckCard && deckFeedback && !deckFeedback.pending) {
            advanceDeckCard();
          }

          return;
        }

        const bestMove = positionAnalysis?.bestMove;

        if (bestMove && bestMove.length >= 4) {
          tryMove(bestMove.slice(0, 2), bestMove.slice(2, 4), bestMove[4]);
        }

        return;
      }

      if (event.key === 'ArrowLeft') {
        const boundedIndex = Math.max(0, Math.min(historyIndex - 1, moveHistory.length));
        const nextGame = restoreGameFromHistory(moveHistory, initialFen, boundedIndex);

        setHistoryIndex(boundedIndex);
        setGame(nextGame);
        clearSelection();
      }

      if (event.key === 'ArrowRight') {
        const boundedIndex = Math.max(0, Math.min(historyIndex + 1, moveHistory.length));
        const nextGame = restoreGameFromHistory(moveHistory, initialFen, boundedIndex);

        if (boundedIndex === historyIndex + 1) {
          const replayedMove = moveHistory[historyIndex];

          if (replayedMove) {
            const playerSide = activeDeckCard?.side ?? reviewPlayerSide;
            const isSelfMove =
              playerSide == null
                ? orientation === 'white'
                : (playerSide === 'white' && replayedMove.color === 'w') || (playerSide === 'black' && replayedMove.color === 'b');

            playSoundSequence(
              getMoveSoundSequence({
                move: replayedMove,
                isSelfMove,
                isCheck: nextGame.isCheck(),
                isCheckmate: nextGame.isCheckmate(),
                isGameOver: nextGame.isGameOver(),
              }),
            );
          }
        }

        setHistoryIndex(boundedIndex);
        setGame(nextGame);
        clearSelection();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !suppressSpaceKeyUpRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressSpaceKeyUpRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [activeDeckCard, advanceDeckCard, deckFeedback, historyIndex, initialFen, mode, moveHistory, orientation, pgnDialogOpen, positionAnalysis?.bestMove, reviewPlayerSide, tryMove]);

  function goToReviewMoment(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, Math.max(0, reviewMoments.length - 1)));
    const moment = reviewMoments[boundedIndex] ?? null;

    setMode('review');
    setReviewIndex(boundedIndex);

    if (moment) {
      jumpToIndex(Math.max(0, moment.ply - 1));
    }
  }

  async function runTimelineAnalysis(nextMoves = moveHistory, nextInitialFen = initialFen) {
    const requestId = ++timelineRequestIdRef.current;

    if (nextMoves.length === 0) {
      setPreMoveAnalyses([]);
      setTimelineAnalyses([]);
      setTimelineError('');
      setTimelineLoading(false);
      return;
    }

    setTimelineLoading(true);
    setTimelineError('');

    try {
      const response = await analyzeGamePositions({
        positions: buildTimelineSequencePositions(nextMoves, nextInitialFen),
        depth: 12,
        movetimeMs: TIMELINE_MOVETIME_MS,
      });

      if (timelineRequestIdRef.current !== requestId) {
        return;
      }

      const sequence = response.analyses ?? [];
      setPreMoveAnalyses(sequence.slice(0, -1));
      setTimelineAnalyses(sequence.slice(1));
    } catch (error) {
      if (timelineRequestIdRef.current !== requestId) {
        return;
      }

      setPreMoveAnalyses([]);
      setTimelineAnalyses([]);
      setTimelineError(error instanceof Error ? error.message : 'Unable to analyze the line.');
    } finally {
      if (timelineRequestIdRef.current === requestId) {
        setTimelineLoading(false);
      }
    }
  }

  async function loadPgnText(name: string, content: string, preferredOrientation?: 'white' | 'black') {
    try {
      const loadedGame = new Chess();
      loadedGame.loadPgn(content);

      const nextInitialFen = loadedGame.header().FEN ?? null;
      const nextHistory = loadedGame.history({ verbose: true }).map(toStoredMove);
      const nextGame = restoreGameFromHistory(nextHistory, nextInitialFen);

      setInitialFen(nextInitialFen);
      setMoveHistory(nextHistory);
      setHistoryIndex(nextHistory.length);
      setGame(nextGame);
      setMetadata(extractMetadataFromGame(loadedGame));
      setFileName(name);
      setMode('review');
      setReviewIndex(0);
      setActiveDeckCard(null);
      setDeckFeedback(null);
      setPositionAnalysis(null);
      setPreMoveAnalyses([]);
      setTimelineAnalyses([]);
      setTimelineError('');
      setServerError('');
      setPgnDialogOpen(false);
      if (preferredOrientation) {
        setOrientation(preferredOrientation);
      }
      positionCacheRef.current.clear();
      positionInFlightRef.current.clear();
      clearSelection();
      playSound('game-start');

      await runTimelineAnalysis(nextHistory, nextInitialFen);
    } catch (error) {
      setTimelineAnalyses([]);
      setTimelineError('Invalid PGN file.');
      setServerError(error instanceof Error ? error.message : 'Unable to load PGN.');
    }
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async loadEvent => {
      await loadPgnText(file.name, String(loadEvent.target?.result ?? ''));
    };

    reader.readAsText(file);
    event.target.value = '';
  }

  async function handlePgnPaste() {
    if (!pgnDraft.trim()) {
      return;
    }

    await loadPgnText('Pasted PGN', pgnDraft.trim());
  }

  async function loadRecentChessGame(gameSummary: ChessComRecentGameSummary) {
    await loadPgnText(gameSummary.link, gameSummary.pgn, gameSummary.playerColor === 'black' ? 'black' : 'white');
  }

  function resetWorkspace() {
    positionRequestIdRef.current += 1;
    timelineRequestIdRef.current += 1;
    setGame(new Chess());
    setInitialFen(null);
    setMoveHistory([]);
    setHistoryIndex(0);
    setMetadata(null);
    setFileName('');
    setMode('review');
    setReviewIndex(0);
    setPositionAnalysis(null);
    setPreMoveAnalyses([]);
    setTimelineAnalyses([]);
    setPositionLoading(false);
    setTimelineLoading(false);
    setServerError('');
    setTimelineError('');
    setActiveDeckCard(null);
    setDeckFeedback(null);
    positionCacheRef.current.clear();
    positionInFlightRef.current.clear();
    clearSelection();
    playSound('game-start');
  }

  function playSound(soundKey: ChessSoundKey) {
    const base = soundPlayersRef.current[soundKey];

    if (!base) {
      return;
    }

    const player = base.cloneNode(true) as HTMLAudioElement;
    player.currentTime = 0;
    void player.play().catch(() => undefined);
  }

  function playSoundSequence(soundKeys: ChessSoundKey[]) {
    soundKeys.forEach((soundKey, index) => {
      window.setTimeout(() => playSound(soundKey), index * 110);
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.appShell}>
        <section className={`${styles.panel} ${styles.boardPanel}`}>
          <div className={styles.topBar}>
            <div className={styles.titleBlock}>
              <h1 className={styles.appTitle}>Chess Lab</h1>
              <span className={styles.contextLine}>
                {hasLoadedGame
                  ? `${whiteReviewName} vs ${blackReviewName} · ${moveHistory.length} plies`
                  : 'Analyze, learn openings, and drill best moves'}
              </span>
            </div>
            <div className={styles.topActions}>
              <button className={`${styles.action} ${styles.compactAction}`} onClick={() => setPgnDialogOpen(true)}>
                Import PGN
              </button>
              <span
                className={`${styles.statusPill} ${
                  serverError ? styles.statusError : positionLoading ? styles.statusPending : styles.statusReady
                }`}
              >
                {serverError ? 'engine issue' : positionLoading ? 'analyzing' : 'ready'}
              </span>
            </div>
          </div>

          <div className={styles.boardWorkspace}>
            <div className={styles.boardTools} aria-label="Board tools">
              <button className={styles.iconButton} onClick={() => setOrientation(value => (value === 'white' ? 'black' : 'white'))} title="Flip board">
                <FlipIcon />
              </button>
              <button
                className={styles.iconButton}
                onClick={() => setShowArrow(value => !value)}
                disabled={Boolean(activeDeckCard && !deckFeedback)}
                title={activeDeckCard ? 'Best arrow hidden during deck review' : showArrow ? 'Hide best arrow' : 'Show best arrow'}
              >
                <ArrowIcon off={!showArrow || Boolean(activeDeckCard)} />
              </button>
              <button className={styles.iconButton} onClick={() => void runTimelineAnalysis()} disabled={timelineLoading || moveHistory.length === 0} title="Refresh analysis">
                <RefreshIcon />
              </button>
              <button className={styles.iconButton} onClick={resetWorkspace} title="Reset board">
                <ResetIcon />
              </button>
            </div>

            <div className={styles.boardStage} ref={boardStageRef}>
              <div className={styles.evalRail} ref={evalRailRef}>
                <div className={styles.evalShell} style={{ ['--white-share' as string]: `${whiteAdvantage}%` }}>
                  <div className={styles.evalBlack} />
                  <div className={styles.evalWhite} />
                  <div className={styles.evalDivider} />
                </div>
                <div className={styles.evalCopy}>
                  <span className={styles.score}>{formatScoreLabel(positionAnalysis)}</span>
                </div>
              </div>

              <div className={styles.boardFrame} style={{ width: `${boardWidth}px`, height: `${boardWidth}px` }}>
                <Chessboard
                  options={{
                    id: 'analysis-board',
                    position: currentFen,
                    boardOrientation: orientation,
                    boardStyle: {
                      width: `${boardWidth}px`,
                      maxWidth: '100%',
                      height: `${boardWidth}px`,
                      borderRadius: '10px',
                    },
                    onPieceDrop: ({ sourceSquare, targetSquare }) =>
                      targetSquare ? tryMove(sourceSquare, targetSquare) : false,
                    onSquareClick: ({ square }) => {
                      if (selectedSquare) {
                        const movePlayed = tryMove(selectedSquare, square);

                        if (!movePlayed) {
                          clearSelection();
                        }

                        return;
                      }

                      const piece = game.get(square as Square);

                      if (!piece || piece.color !== game.turn()) {
                        return;
                      }

                      setSelectedSquare(square);
                      highlightMoves(square);
                    },
                    onSquareRightClick: () => clearSelection(),
                    squareStyles,
                    arrows: boardArrows,
                    lightSquareStyle: { backgroundColor: '#728092' },
                    darkSquareStyle: { backgroundColor: '#253140' },
                    animationDurationInMs: 180,
                    showNotation: true,
                  }}
                />
              </div>
              <div className={styles.boardStageSpacer} aria-hidden="true" />
            </div>
          </div>

          {serverError ? <p className={styles.error}>{serverError}</p> : null}
        </section>

        <aside className={`${styles.panel} ${styles.contextPanel}`}>
          <section className={styles.modeTabs}>
            {(['review', 'train'] satisfies WorkspaceMode[]).map(nextMode => (
              <button
                className={`${styles.modeTab} ${mode === nextMode ? styles.activeModeTab : ''}`}
                key={nextMode}
                onClick={() => setMode(nextMode)}
              >
                {getModeLabel(nextMode)}
              </button>
            ))}
          </section>

          <div className={styles.panelScroll}>
            {mode === 'review' ? (
              <ReviewPanel
                activeReviewMoment={activeReviewMoment}
                blackReviewName={blackReviewName}
                chesscomUsername={chesscomUsername}
                chartConfig={chartConfig}
                chartData={chartData}
                currentFen={currentFen}
                gameReview={gameReview}
                goToReviewMoment={goToReviewMoment}
                hasLoadedGame={hasLoadedGame}
                historyIndex={historyIndex}
                jumpToIndex={jumpToIndex}
                loadRecentGame={loadRecentChessGame}
                metadata={metadata}
                moveHistoryLength={moveHistory.length}
                movePairs={movePairs}
                onBack={() => {
                  positionRequestIdRef.current += 1;
                  timelineRequestIdRef.current += 1;
                  setGame(new Chess());
                  setInitialFen(null);
                  setMoveHistory([]);
                  setHistoryIndex(0);
                  setMetadata(null);
                  setFileName('');
                  setReviewIndex(0);
                  setPositionAnalysis(null);
                  setPreMoveAnalyses([]);
                  setTimelineAnalyses([]);
                  setPositionLoading(false);
                  setTimelineLoading(false);
                  setServerError('');
                  setTimelineError('');
                  positionCacheRef.current.clear();
                  positionInFlightRef.current.clear();
                  clearSelection();
                }}
                onChesscomUsernameChange={setChesscomUsername}
                onRecentGameTimeClassChange={timeClass => {
                  setRecentGameTimeClass(timeClass);
                  writeCookie(CHESSCOM_TIME_CLASS_COOKIE, timeClass);

                  if (chesscomUsername.trim()) {
                    void fetchRecentChessGames(undefined, timeClass);
                  }
                }}
                onFetchRecentGames={() => void fetchRecentChessGames()}
                openPgnDialog={() => setPgnDialogOpen(true)}
                positionAnalysis={positionAnalysis}
                positionLoading={positionLoading}
                recentGames={recentChessGames}
                recentGamesError={recentChessGamesError}
                recentGamesLoading={recentChessGamesLoading}
                recentGameTimeClass={recentGameTimeClass}
                reviewIndex={reviewIndex}
                reviewMoments={reviewMoments}
                reviewSide={reviewSide}
                setReviewIndex={setReviewIndex}
                setReviewSide={setReviewSide}
                setShowArrow={setShowArrow}
                timelineAnalysesLength={timelineAnalyses.length}
                timelineError={timelineError}
                timelineLoading={timelineLoading}
                whiteReviewName={whiteReviewName}
              />
            ) : (
              <TrainPanel
                activeCard={activeDeckCard}
                activeCardProgress={activeDeckProgress}
                currentFen={currentFen}
                deckCards={deckCards}
                deckCounterSan={deckOpponentBestSan}
                deckLoadError={deckLoadError}
                deckLoading={deckLoading}
                deckFeedback={deckFeedback}
                deckStats={deckStats}
                nextCard={nextDeckCard}
                onBack={() => {
                  positionRequestIdRef.current += 1;
                  timelineRequestIdRef.current += 1;
                  setGame(new Chess());
                  setInitialFen(null);
                  setMoveHistory([]);
                  setHistoryIndex(0);
                  setMetadata(null);
                  setFileName('');
                  setPositionAnalysis(null);
                  setPreMoveAnalyses([]);
                  setTimelineAnalyses([]);
                  setPositionLoading(false);
                  setTimelineLoading(false);
                  setServerError('');
                  setTimelineError('');
                  setActiveDeckCard(null);
                  setDeckFeedback(null);
                  positionCacheRef.current.clear();
                  positionInFlightRef.current.clear();
                  clearSelection();
                }}
                onNext={advanceDeckCard}
                onRepeat={repeatDeckCard}
                onToggleIgnore={toggleActiveDeckCardIgnored}
                openingLines={openingLines}
                positionAnalysis={positionAnalysis}
                startCard={loadDeckCard}
              />
            )}
          </div>
        </aside>
      </div>

      {pgnDialogOpen ? (
        <PgnImportDialog
          fileName={fileName}
          handlePgnPaste={handlePgnPaste}
          handleUpload={handleUpload}
          onClose={() => setPgnDialogOpen(false)}
          pgnDraft={pgnDraft}
          setPgnDraft={setPgnDraft}
        />
      ) : null}
    </main>
  );
}

function getPositionCacheKey(initialFen: string | null, moves: string[]) {
  return `${initialFen ?? 'startpos'}|${moves.join(' ')}`;
}

function buildDeckCardState(card: DeckCard, openingLines: OpeningSeedLine[]) {
  const line = openingLines.find(candidate => candidate.id === card.lineId);

  if (!line || !card.opponentMoveUci) {
    return {
      initialFen: card.fen,
      moveHistory: [] as StoredMove[],
      historyIndex: 0,
      game: new Chess(card.fen),
    };
  }

  try {
    const baseGame = new Chess();

    for (const san of line.moves.slice(0, Math.max(0, card.ply - 1))) {
      baseGame.move(san);
    }

    const initialFen = baseGame.fen();
    const replayGame = new Chess(initialFen);
    const move = replayGame.move({
      from: card.opponentMoveUci.slice(0, 2),
      to: card.opponentMoveUci.slice(2, 4),
      ...(card.opponentMoveUci[4] ? { promotion: card.opponentMoveUci[4] } : {}),
    });

    if (!move) {
      throw new Error('Invalid opponent move');
    }

    return {
      initialFen,
      moveHistory: [toStoredMove(move)],
      historyIndex: 1,
      game: replayGame,
    };
  } catch {
    return {
      initialFen: card.fen,
      moveHistory: [] as StoredMove[],
      historyIndex: 0,
      game: new Chess(card.fen),
    };
  }
}

function dedupeBoardArrows(arrows: Array<{ startSquare: string; endSquare: string; color: string }>) {
  const unique = new Map<string, { startSquare: string; endSquare: string; color: string }>();

  for (const arrow of arrows) {
    unique.set(`${arrow.startSquare}-${arrow.endSquare}`, arrow);
  }

  return [...unique.values()];
}

function isOpponentTurnFromFen(fen: string, side: 'white' | 'black') {
  const turn = fen.trim().split(/\s+/)[1];
  const playerTurn = turn === 'b' ? 'black' : 'white';
  return playerTurn !== side;
}

function normalizeDeckLoadError(message: string) {
  if (
    message.includes('deck_cards.source_type') ||
    message.includes('deck_cards.validation_mode') ||
    message.includes('deck_cards.reference_eval_cp') ||
    message.includes('deck_cards.max_eval_loss_cp')
  ) {
    return 'Supabase deck schema is outdated. Recreate the canonical deck tables and reseed.';
  }

  return message;
}

function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return '';
  }

  const prefix = `${name}=`;
  const entry = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));

  return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function FlipIcon() {
  return (
    <svg className={styles.toolIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7h8.5a4.5 4.5 0 0 1 4.5 4.5v0A4.5 4.5 0 0 1 15.5 16H9" />
      <path d="M7 7l3-3M7 7l3 3M17 17H8.5A4.5 4.5 0 0 1 4 12.5v0A4.5 4.5 0 0 1 8.5 8H15" />
      <path d="M17 17l-3-3M17 17l-3 3" />
    </svg>
  );
}

function ArrowIcon({ off }: { off: boolean }) {
  return (
    <svg className={styles.toolIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19 18 6" />
      <path d="M10 6h8v8" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className={styles.toolIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.5-4.6L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.5 4.6L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg className={styles.toolIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}
