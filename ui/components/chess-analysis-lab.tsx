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
import { Line } from 'react-chartjs-2';

import type { AnalysisLine, AnalysisResult } from '@/lib/analysis-types';
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
  formatPrincipalVariation,
  formatScoreLabel,
  getAdvantageMeter,
  getBestMoveArrow,
  restoreGameFromHistory,
  reviewCategoryMeta,
  reviewCategoryOrder,
  toChartScore,
  toStoredMove,
  type GameMetadata,
  type ReviewSide,
  type StoredMove,
} from '@/lib/chess-analysis-client';
import styles from './chess-analysis-lab.module.css';

type WorkspaceMode = 'analyze' | 'gameReview' | 'learn' | 'deck';
type TrainingSide = 'white' | 'black';

type OpeningSeedLine = {
  id: string;
  name: string;
  eco: string;
  side: TrainingSide;
  moves: string[];
};

type DeckCard = {
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

type DeckFeedback = {
  correct: boolean;
  expectedSan: string;
  playedSan: string;
};

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
const OPENING_REPERTOIRE: OpeningSeedLine[] = [
  { id: 'italian-main', name: 'Italian Game', eco: 'C50', side: 'white', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4'] },
  { id: 'ruy-lopez', name: 'Ruy Lopez', eco: 'C60', side: 'white', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'] },
  { id: 'queens-gambit', name: "Queen's Gambit Declined", eco: 'D30', side: 'white', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3'] },
  { id: 'london', name: 'London System', eco: 'D02', side: 'white', moves: ['d4', 'Nf6', 'Bf4', 'd5', 'e3', 'e6', 'Nf3', 'c5', 'c3'] },
  { id: 'sicilian-najdorf', name: 'Sicilian Najdorf', eco: 'B90', side: 'black', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  { id: 'french-advance', name: 'French Advance', eco: 'C02', side: 'black', moves: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3'] },
  { id: 'caro-kann', name: 'Caro-Kann Classical', eco: 'B18', side: 'black', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3'] },
  { id: 'kings-indian', name: "King's Indian Defense", eco: 'E60', side: 'black', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'] },
];

export function ChessAnalysisLab() {
  const [game, setGame] = useState(() => new Chess());
  const [initialFen, setInitialFen] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<StoredMove[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, CSSProperties>>({});
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [showArrow, setShowArrow] = useState(true);
  const [mode, setMode] = useState<WorkspaceMode>('analyze');
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
  const [deckStats, setDeckStats] = useState({ correct: 0, misses: 0 });

  const boardStageRef = useRef<HTMLDivElement | null>(null);
  const evalRailRef = useRef<HTMLDivElement | null>(null);
  const positionRequestIdRef = useRef(0);
  const timelineRequestIdRef = useRef(0);
  const positionCacheRef = useRef(new Map<string, AnalysisResult>());
  const positionInFlightRef = useRef(new Map<string, Promise<AnalysisResult>>());

  const currentFen = useMemo(() => game.fen(), [game]);
  const currentMoves = useMemo(() => moveHistory.slice(0, historyIndex), [moveHistory, historyIndex]);
  const currentMoveList = useMemo(() => buildMoveUciHistory(currentMoves), [currentMoves]);
  const currentLineKey = currentMoveList.join(' ');
  const whiteAdvantage = getAdvantageMeter(positionAnalysis);
  const bestMoveArrow = showArrow ? getBestMoveArrow(positionAnalysis?.bestMove ?? null) : [];
  const deckAnswerArrow = deckFeedback && activeDeckCard ? getBestMoveArrow(activeDeckCard.answerUci) : [];
  const boardArrows = activeDeckCard ? deckAnswerArrow : bestMoveArrow;
  const whiteReviewName = metadata?.whitePlayer ?? 'White';
  const blackReviewName = metadata?.blackPlayer ?? 'Black';
  const hasLoadedGame = moveHistory.length > 0 && metadata !== null;
  const deckCards = useMemo(() => buildDeckCards(OPENING_REPERTOIRE), []);
  const nextDeckCard = deckCards[deckIndex % Math.max(1, deckCards.length)] ?? null;
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
        if (positionRequestIdRef.current !== requestId) {
          return;
        }

        setPositionAnalysis(analysis);
      })
      .catch(error => {
        if (positionRequestIdRef.current !== requestId) {
          return;
        }

        setPositionAnalysis(null);
        setServerError(error.message);
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
      setTimelineAnalyses([]);
      setTimelineError('');
      setSelectedSquare(null);
      setSquareStyles({});

      if (activeDeckCard) {
        const correct = move.uci === activeDeckCard.answerUci;

        setDeckFeedback({
          correct,
          expectedSan: activeDeckCard.answerSan,
          playedSan: move.san,
        });
        setDeckStats(stats => ({
          correct: stats.correct + (correct ? 1 : 0),
          misses: stats.misses + (correct ? 0 : 1),
        }));
      }
    },
    [activeDeckCard, historyIndex, moveHistory],
  );

  const tryMove = useCallback(
    (from: string, to: string, promotion = 'q') => {
      const nextGame = new Chess(currentFen);
      const move = (() => {
        try {
          return nextGame.move({
            from,
            to,
            promotion,
          });
        } catch {
          return null;
        }
      })();

      if (!move) {
        return false;
      }

      commitMove(nextGame, toStoredMove(move));
      return true;
    },
    [commitMove, currentFen],
  );

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

        setHistoryIndex(boundedIndex);
        setGame(nextGame);
        clearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyIndex, initialFen, moveHistory, pgnDialogOpen, positionAnalysis?.bestMove, tryMove]);

  function jumpToIndex(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, moveHistory.length));
    const nextGame = restoreGameFromHistory(moveHistory, initialFen, boundedIndex);

    setHistoryIndex(boundedIndex);
    setGame(nextGame);
    clearSelection();
  }

  function loadDeckCard(card: DeckCard | null) {
    if (!card) {
      return;
    }

    const nextGame = new Chess(card.fen);
    setInitialFen(card.fen);
    setMoveHistory([]);
    setHistoryIndex(0);
    setGame(nextGame);
    setMode('deck');
    setActiveDeckCard(card);
    setDeckFeedback(null);
    setShowArrow(false);
    setPositionAnalysis(null);
    setTimelineAnalyses([]);
    setTimelineError('');
    clearSelection();
  }

  function advanceDeckCard() {
    if (deckCards.length === 0) {
      return;
    }

    const nextIndex = (deckIndex + 1) % deckCards.length;
    setDeckIndex(nextIndex);
    loadDeckCard(deckCards[nextIndex]);
  }

  function repeatDeckCard() {
    loadDeckCard(activeDeckCard ?? nextDeckCard);
  }

  function goToReviewMoment(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, Math.max(0, reviewMoments.length - 1)));
    const moment = reviewMoments[boundedIndex] ?? null;

    setMode('gameReview');
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

  async function loadPgnText(name: string, content: string) {
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
      setMode('gameReview');
      setReviewIndex(0);
      setActiveDeckCard(null);
      setDeckFeedback(null);
      setPositionAnalysis(null);
      setPreMoveAnalyses([]);
      setTimelineAnalyses([]);
      setTimelineError('');
      setServerError('');
      setPgnDialogOpen(false);
      positionCacheRef.current.clear();
      positionInFlightRef.current.clear();
      clearSelection();

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

  function resetWorkspace() {
    positionRequestIdRef.current += 1;
    timelineRequestIdRef.current += 1;
    setGame(new Chess());
    setInitialFen(null);
    setMoveHistory([]);
    setHistoryIndex(0);
    setMetadata(null);
    setFileName('');
    setMode('analyze');
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
                F
              </button>
              <button className={styles.iconButton} onClick={() => setShowArrow(value => !value)} title={showArrow ? 'Hide best arrow' : 'Show best arrow'}>
                {showArrow ? 'A' : 'a'}
              </button>
              <button className={styles.iconButton} onClick={() => void runTimelineAnalysis()} disabled={timelineLoading || moveHistory.length === 0} title="Refresh line">
                R
              </button>
              <button className={styles.iconButton} onClick={resetWorkspace} title="Reset board">
                X
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
            </div>
          </div>

          <div className={styles.boardFooter}>
            <button className={styles.navButton} onClick={() => jumpToIndex(historyIndex - 1)} disabled={historyIndex === 0}>
              Prev
            </button>
            <span className={styles.footerCopy}>
              Ply {historyIndex}/{moveHistory.length}
              {activeDeckCard
                ? ` · ${activeDeckCard.prompt}`
                : positionAnalysis?.bestMove
                  ? ` · best ${formatBestMove(currentFen, positionAnalysis.bestMove)}`
                  : ''}
            </span>
            <button className={styles.navButton} onClick={() => jumpToIndex(historyIndex + 1)} disabled={historyIndex === moveHistory.length}>
              Next
            </button>
          </div>

          {serverError ? <p className={styles.error}>{serverError}</p> : null}
        </section>

        <aside className={`${styles.panel} ${styles.contextPanel}`}>
          <section className={styles.modeTabs}>
            {(['analyze', 'gameReview', 'learn', 'deck'] satisfies WorkspaceMode[]).map(nextMode => (
              <button
                className={`${styles.modeTab} ${mode === nextMode ? styles.activeModeTab : ''}`}
                key={nextMode}
                onClick={() => {
                  if (nextMode === 'gameReview' && reviewMoments.length > 0) {
                    goToReviewMoment(reviewIndex);
                    return;
                  }

                  setMode(nextMode);
                }}
              >
                {getModeLabel(nextMode)}
              </button>
            ))}
          </section>

          <div className={styles.panelScroll}>
            {mode === 'analyze' ? (
              <AnalyzePanel
                currentFen={currentFen}
                movePairs={movePairs}
                historyIndex={historyIndex}
                jumpToIndex={jumpToIndex}
                positionAnalysis={positionAnalysis}
                positionLoading={positionLoading}
              />
            ) : mode === 'gameReview' ? (
              <GameReviewPanel
                activeReviewMoment={activeReviewMoment}
                blackReviewName={blackReviewName}
                chartConfig={chartConfig}
                chartData={chartData}
                gameReview={gameReview}
                goToReviewMoment={goToReviewMoment}
                hasLoadedGame={hasLoadedGame}
                historyIndex={historyIndex}
                moveHistoryLength={moveHistory.length}
                openPgnDialog={() => setPgnDialogOpen(true)}
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
            ) : mode === 'learn' ? (
              <LearnPanel
                currentFen={currentFen}
                deckCards={deckCards}
                nextDeckCard={nextDeckCard}
                openingLines={OPENING_REPERTOIRE}
                startCard={loadDeckCard}
              />
            ) : (
              <DeckPanel
                activeCard={activeDeckCard}
                deckCards={deckCards}
                deckFeedback={deckFeedback}
                deckStats={deckStats}
                nextCard={nextDeckCard}
                onNext={advanceDeckCard}
                onRepeat={repeatDeckCard}
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

function AnalyzePanel({
  currentFen,
  historyIndex,
  jumpToIndex,
  movePairs,
  positionAnalysis,
  positionLoading,
}: {
  currentFen: string;
  historyIndex: number;
  jumpToIndex: (index: number) => void;
  movePairs: Array<{
    moveNumber: number;
    white: StoredMove | null;
    whitePly: number;
    black: StoredMove | null;
    blackPly: number;
  }>;
  positionAnalysis: AnalysisResult | null;
  positionLoading: boolean;
}) {
  return (
    <>
      <EngineLinesSection currentFen={currentFen} positionAnalysis={positionAnalysis} positionLoading={positionLoading} />
      <section className={`${styles.card} ${styles.movesCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Line</h2>
          <span className={styles.statusText}>{movePairs.length ? `${movePairs.length} moves` : 'manual board'}</span>
        </div>
        <div className={styles.moveList}>
          {movePairs.length === 0 ? (
            <p className={styles.empty}>Play on the board or import a PGN.</p>
          ) : (
            movePairs.map(pair => (
              <div className={styles.moveRow} key={pair.moveNumber}>
                <span className={styles.moveNumber}>{pair.moveNumber}</span>
                <button
                  className={`${styles.moveChip} ${historyIndex === pair.whitePly ? styles.activeMove : ''}`}
                  onClick={() => jumpToIndex(pair.whitePly)}
                >
                  {pair.white ? formatMoveFigurine(pair.white.san) : '...'}
                </button>
                <button
                  className={`${styles.moveChip} ${historyIndex === pair.blackPly ? styles.activeMove : ''}`}
                  onClick={() => jumpToIndex(pair.blackPly)}
                  disabled={!pair.black}
                >
                  {pair.black ? formatMoveFigurine(pair.black.san) : ''}
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function GameReviewPanel({
  activeReviewMoment,
  blackReviewName,
  chartConfig,
  chartData,
  gameReview,
  goToReviewMoment,
  hasLoadedGame,
  historyIndex,
  moveHistoryLength,
  openPgnDialog,
  reviewIndex,
  reviewMoments,
  reviewSide,
  setReviewIndex,
  setReviewSide,
  setShowArrow,
  timelineAnalysesLength,
  timelineError,
  timelineLoading,
  whiteReviewName,
}: {
  activeReviewMoment: ReturnType<typeof filterReviewMoments>[number] | null;
  blackReviewName: string;
  chartConfig: ReturnType<typeof buildChartOptions>;
  chartData: ChartData<'line', number[], number>;
  gameReview: ReturnType<typeof buildGameReview>;
  goToReviewMoment: (index: number) => void;
  hasLoadedGame: boolean;
  historyIndex: number;
  moveHistoryLength: number;
  openPgnDialog: () => void;
  reviewIndex: number;
  reviewMoments: ReturnType<typeof filterReviewMoments>;
  reviewSide: ReviewSide;
  setReviewIndex: (index: number) => void;
  setReviewSide: (side: ReviewSide) => void;
  setShowArrow: (value: boolean) => void;
  timelineAnalysesLength: number;
  timelineError: string;
  timelineLoading: boolean;
  whiteReviewName: string;
}) {
  if (!hasLoadedGame) {
    return (
      <section className={`${styles.card} ${styles.emptyStateCard}`}>
        <h2 className={styles.sectionTitle}>Game Review</h2>
        <p className={styles.copy}>Import a PGN only when you want full-game review. The workspace stays board-first otherwise.</p>
        <button className={`${styles.action} ${styles.primary}`} onClick={openPgnDialog}>
          Import PGN
        </button>
      </section>
    );
  }

  return (
    <>
      <section className={`${styles.card} ${styles.overviewCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Game</h2>
          <span className={styles.statusText}>{timelineLoading ? 'building' : `${gameReview.keyMoments.length} moments`}</span>
        </div>
        <div className={styles.accuracyGrid}>
          <div className={styles.accuracyCard}>
            <span className={styles.metaLabel}>{whiteReviewName}</span>
            <strong>{formatNullable(gameReview.accuracy.white)}%</strong>
            <span className={styles.statusText}>rating {formatNullable(gameReview.gameRating.white)}</span>
          </div>
          <div className={styles.accuracyCard}>
            <span className={styles.metaLabel}>{blackReviewName}</span>
            <strong>{formatNullable(gameReview.accuracy.black)}%</strong>
            <span className={styles.statusText}>rating {formatNullable(gameReview.gameRating.black)}</span>
          </div>
        </div>
        <div className={styles.openingBox}>
          <span className={styles.metaLabel}>Opening</span>
          <strong>{gameReview.opening.name}</strong>
          <span className={styles.statusText}>
            {gameReview.opening.eco !== '-' ? `${gameReview.opening.eco} · ` : ''}
            {gameReview.opening.lastBookPly ? `book through ply ${gameReview.opening.lastBookPly}` : 'book not detected'}
          </span>
        </div>
        <div className={styles.categoryGrid}>
          {reviewCategoryOrder.map(category => {
            const meta = reviewCategoryMeta[category];
            const whiteCount = gameReview.counts.white[category];
            const blackCount = gameReview.counts.black[category];

            if (!whiteCount && !blackCount) {
              return null;
            }

            return (
              <div className={styles.categoryTile} key={category} style={{ ['--review-color' as string]: meta.color }}>
                <span>{meta.label}</span>
                <strong>{whiteCount + blackCount}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <ChartSection
        chartConfig={chartConfig}
        chartData={chartData}
        historyIndex={historyIndex}
        moveHistoryLength={moveHistoryLength}
        timelineAnalysesLength={timelineAnalysesLength}
        timelineError={timelineError}
        timelineLoading={timelineLoading}
      />

      <section className={`${styles.card} ${styles.reviewCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Moment</h2>
          <span className={styles.statusText}>{reviewMoments.length ? `${reviewIndex + 1}/${reviewMoments.length}` : 'no moments'}</span>
        </div>
        <div className={styles.reviewSideTabs}>
          {[
            ['both', 'Both'],
            ['white', whiteReviewName],
            ['black', blackReviewName],
          ].map(([side, label]) => (
            <button
              className={`${styles.sideTab} ${reviewSide === side ? styles.activeSideTab : ''}`}
              key={side}
              onClick={() => {
                setReviewSide(side as ReviewSide);
                setReviewIndex(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {activeReviewMoment ? (
          <div className={styles.coachBox}>
            <div className={styles.coachHeader}>
              <span className={styles.reviewBadge} style={{ ['--review-color' as string]: activeReviewMoment.colorHex ?? '#8f75ff' }}>
                {activeReviewMoment.label}
              </span>
              <strong>{activeReviewMoment.moveLabel}</strong>
            </div>
            <p className={styles.copy}>{activeReviewMoment.coachText}</p>
            <div className={styles.reviewFacts}>
              <span>played {activeReviewMoment.san}</span>
              <span>best {activeReviewMoment.bestMoveSan ?? '...'}</span>
              <span>loss {formatExpectedLoss(activeReviewMoment.expectedPointsLost)}</span>
            </div>
            <div className={styles.reviewNav}>
              <button className={styles.action} onClick={() => goToReviewMoment(reviewIndex - 1)} disabled={reviewIndex === 0}>
                Prev
              </button>
              <button
                className={styles.action}
                onClick={() => {
                  setShowArrow(true);
                  goToReviewMoment(reviewIndex);
                }}
              >
                Show best
              </button>
              <button
                className={styles.action}
                onClick={() => goToReviewMoment(reviewIndex + 1)}
                disabled={reviewIndex >= reviewMoments.length - 1}
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.empty}>No key moments yet.</p>
        )}
      </section>
    </>
  );
}

function LearnPanel({ currentFen }: { currentFen: string }) {
  return (
    <>
      <section className={`${styles.card} ${styles.emptyStateCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Learn openings</h2>
          <span className={styles.statusText}>next</span>
        </div>
        <p className={styles.copy}>
          This panel is ready for the repertoire flow: known opening seed, cached explorer positions, and engine-ranked best moves.
        </p>
      </section>
      <section className={`${styles.card} ${styles.dataCard}`}>
        <span className={styles.metaLabel}>Current position</span>
        <p className={styles.monoLine}>{currentFen}</p>
      </section>
    </>
  );
}

function DeckPanel() {
  return (
    <section className={`${styles.card} ${styles.emptyStateCard}`}>
      <div className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>Deck</h2>
        <span className={styles.statusText}>FSRS next</span>
      </div>
      <p className={styles.copy}>
        The deck view will drill one or more board moves, stop on mistakes, and grade cards as best-or-nothing.
      </p>
    </section>
  );
}

function PgnImportDialog({
  fileName,
  handlePgnPaste,
  handleUpload,
  onClose,
  pgnDraft,
  setPgnDraft,
}: {
  fileName: string;
  handlePgnPaste: () => void;
  handleUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  pgnDraft: string;
  setPgnDraft: (value: string) => void;
}) {
  return (
    <div className={styles.modalLayer} role="presentation" onMouseDown={onClose}>
      <section className={styles.importDialog} role="dialog" aria-modal="true" aria-labelledby="pgn-import-title" onMouseDown={event => event.stopPropagation()}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.sectionTitle} id="pgn-import-title">
              Import PGN
            </h2>
            <p className={styles.support}>Use this only when you want full-game review.</p>
          </div>
          <button className={styles.iconButton} onClick={onClose} title="Close import">
            X
          </button>
        </div>
        <div className={styles.pgnControls}>
          <label className={`${styles.action} ${styles.primary}`} htmlFor="pgn-upload">
            Load file
          </label>
          <button className={`${styles.action} ${styles.secondary}`} onClick={() => void handlePgnPaste()} disabled={!pgnDraft.trim()}>
            Paste PGN
          </button>
        </div>
        <input className={styles.hiddenInput} id="pgn-upload" type="file" accept=".pgn" onChange={handleUpload} />
        <textarea
          className={styles.pgnInput}
          value={pgnDraft}
          onChange={event => setPgnDraft(event.target.value)}
          placeholder={'[Event "Live Chess"]\n[White "LosValettos"]\n[Black "rafaelpiresrj"]\n\n1. e4 e5 2. Nf3 Nc6'}
          spellCheck={false}
        />
        <p className={styles.support}>{fileName || 'No PGN loaded'}</p>
      </section>
    </div>
  );
}

function ChartSection({
  chartConfig,
  chartData,
  historyIndex,
  moveHistoryLength,
  timelineAnalysesLength,
  timelineError,
  timelineLoading,
}: {
  chartConfig: ReturnType<typeof buildChartOptions>;
  chartData: ChartData<'line', number[], number>;
  historyIndex: number;
  moveHistoryLength: number;
  timelineAnalysesLength: number;
  timelineError: string;
  timelineLoading: boolean;
}) {
  return (
    <section className={`${styles.card} ${styles.chartCard}`}>
      <div className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>Curve</h2>
        <span className={styles.statusText}>{timelineLoading ? 'refreshing' : `ply ${historyIndex}/${moveHistoryLength}`}</span>
      </div>
      <div className={styles.chartWrap}>
        {timelineAnalysesLength > 0 ? (
          <Line data={chartData} options={chartConfig} />
        ) : (
          <div className={styles.boardFallback}>{timelineLoading ? 'Analyzing the whole line...' : 'Import a PGN to build review.'}</div>
        )}
      </div>
      {timelineError ? <p className={styles.error}>{timelineError}</p> : null}
    </section>
  );
}

function EngineLinesSection({
  currentFen,
  positionAnalysis,
  positionLoading,
}: {
  currentFen: string;
  positionAnalysis: AnalysisResult | null;
  positionLoading: boolean;
}) {
  const lines = positionAnalysis?.lines?.slice(0, 3) ?? [];

  return (
    <section className={`${styles.card} ${styles.engineCard}`}>
      <div className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>Engine</h2>
        <span className={styles.statusText}>{positionLoading ? 'analyzing' : `depth ${positionAnalysis?.depth ?? '--'}`}</span>
      </div>
      <div className={styles.engineLines}>
        {lines.length > 0 ? (
          lines.map(line => (
            <div className={styles.engineLine} key={line.multipv}>
              <div className={styles.engineLineHead}>
                <span className={styles.engineRank}>#{line.multipv}</span>
                <strong>{line.bestMove ? formatBestMove(currentFen, line.bestMove) : '--'}</strong>
                <span>{formatLineScore(line)}</span>
              </div>
              <p className={styles.enginePv}>{formatPrincipalVariation(currentFen, line.pv)}</p>
            </div>
          ))
        ) : (
          <p className={styles.empty}>{positionLoading ? 'Analyzing candidate lines.' : 'No engine lines yet.'}</p>
        )}
      </div>
    </section>
  );
}

function getModeLabel(mode: WorkspaceMode) {
  switch (mode) {
    case 'analyze':
      return 'Analyze';
    case 'gameReview':
      return 'Game';
    case 'learn':
      return 'Learn';
    case 'deck':
      return 'Deck';
  }
}

function formatNullable(value: number | null) {
  return value == null ? '--' : `${value}`;
}

function formatExpectedLoss(value: number | null) {
  return value == null ? '--' : `${(value * 100).toFixed(1)}%`;
}

function formatLineScore(line: AnalysisLine) {
  const score = line.whitePerspective;

  if (!score) {
    return '--';
  }

  if (score.type === 'mate') {
    return score.value > 0 ? `#${score.value}` : `-#${Math.abs(score.value)}`;
  }

  const pawns = score.value / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

function formatMoveFigurine(san: string) {
  const pieces: Record<string, string> = {
    K: '♔',
    Q: '♕',
    R: '♖',
    B: '♗',
    N: '♘',
  };

  return san.replace(/^[KQRBN]/, piece => pieces[piece] ?? piece);
}

function getPositionCacheKey(initialFen: string | null, moves: string[]) {
  return `${initialFen ?? 'startpos'}|${moves.join(' ')}`;
}
