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
  AnalyzePanel,
  DeckPanel,
  GameReviewPanel,
  LearnPanel,
  PgnImportDialog,
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
import { OPENING_REPERTOIRE, buildDeckCards, type DeckCard, type DeckFeedback } from '@/lib/opening-training';
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
  const currentMoves = useMemo(() => moveHistory.slice(0, historyIndex), [historyIndex, moveHistory]);
  const currentMoveList = useMemo(() => buildMoveUciHistory(currentMoves), [currentMoves]);
  const currentLineKey = currentMoveList.join(' ');
  const whiteAdvantage = getAdvantageMeter(positionAnalysis);
  const bestMoveArrow = showArrow && !activeDeckCard ? getBestMoveArrow(positionAnalysis?.bestMove ?? null) : [];
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
          return nextGame.move({ from, to, promotion });
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

    setInitialFen(card.fen);
    setMoveHistory([]);
    setHistoryIndex(0);
    setGame(new Chess(card.fen));
    setMode('deck');
    setActiveDeckCard(card);
    setDeckFeedback(null);
    setOrientation(card.side);
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
              <button
                className={styles.iconButton}
                onClick={() => setShowArrow(value => !value)}
                disabled={Boolean(activeDeckCard && !deckFeedback)}
                title={activeDeckCard ? 'Best arrow hidden during deck review' : showArrow ? 'Hide best arrow' : 'Show best arrow'}
              >
                {activeDeckCard ? '-' : showArrow ? 'A' : 'a'}
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

function getPositionCacheKey(initialFen: string | null, moves: string[]) {
  return `${initialFen ?? 'startpos'}|${moves.join(' ')}`;
}
