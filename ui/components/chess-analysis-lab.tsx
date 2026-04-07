'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
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

import type { AnalysisResult } from '@/lib/analysis-types';
import {
  analyzeGamePositions,
  analyzeSinglePosition,
  buildGameReview,
  buildChartOptions,
  buildMoveUciHistory,
  buildTimelineSequencePositions,
  classifyTimelineMoves,
  extractMetadataFromGame,
  filterReviewMoments,
  formatPrincipalVariation,
  formatScoreLabel,
  getAdvantageMeter,
  getBestMoveArrow,
  restoreGameFromHistory,
  toChartScore,
  toStoredMove,
  type GameMetadata,
  type ReviewSide,
  type StoredMove,
  reviewCategoryMeta,
  reviewCategoryOrder,
  summarizeTimelineReviews,
} from '@/lib/chess-analysis-client';
import styles from './chess-analysis-lab.module.css';

type LabMode = 'overview' | 'review' | 'analysis';

const Chessboard = dynamic(() => import('@/components/chessboard-client'), {
  ssr: false,
  loading: () => <div className={styles.boardFallback}>Loading board…</div>,
});

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

export function ChessAnalysisLab() {
  const [game, setGame] = useState(() => new Chess());
  const [initialFen, setInitialFen] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<StoredMove[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, CSSProperties>>({});
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [showArrow, setShowArrow] = useState(true);
  const [mode, setMode] = useState<LabMode>('overview');
  const [reviewSide, setReviewSide] = useState<ReviewSide>('both');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [metadata, setMetadata] = useState<GameMetadata | null>(null);
  const [fileName, setFileName] = useState('No PGN loaded');
  const [pgnDraft, setPgnDraft] = useState('');
  const [positionAnalysis, setPositionAnalysis] = useState<AnalysisResult | null>(null);
  const [preMoveAnalyses, setPreMoveAnalyses] = useState<AnalysisResult[]>([]);
  const [timelineAnalyses, setTimelineAnalyses] = useState<AnalysisResult[]>([]);
  const [positionLoading, setPositionLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [timelineError, setTimelineError] = useState('');
  const [boardWidth, setBoardWidth] = useState(640);

  const boardStageRef = useRef<HTMLDivElement | null>(null);
  const evalRailRef = useRef<HTMLDivElement | null>(null);
  const positionRequestIdRef = useRef(0);
  const timelineRequestIdRef = useRef(0);

  const currentFen = useMemo(() => game.fen(), [game]);
  const currentMoves = useMemo(() => moveHistory.slice(0, historyIndex), [moveHistory, historyIndex]);
  const currentMoveList = useMemo(() => buildMoveUciHistory(currentMoves), [currentMoves]);
  const currentLineKey = currentMoveList.join(' ');
  const whiteAdvantage = getAdvantageMeter(positionAnalysis);
  const bestMoveArrow = showArrow ? getBestMoveArrow(positionAnalysis?.bestMove ?? null) : [];
  const whiteReviewName = metadata?.whitePlayer ?? 'White';
  const blackReviewName = metadata?.blackPlayer ?? 'Black';
  const timelineReviews = useMemo(
    () => classifyTimelineMoves(moveHistory, preMoveAnalyses, timelineAnalyses, initialFen, metadata),
    [initialFen, metadata, moveHistory, preMoveAnalyses, timelineAnalyses],
  );
  const reviewSummary = useMemo(() => summarizeTimelineReviews(timelineReviews), [timelineReviews]);
  const gameReview = useMemo(() => buildGameReview(timelineReviews, metadata), [metadata, timelineReviews]);
  const reviewMoments = useMemo(
    () => filterReviewMoments(gameReview.keyMoments, reviewSide),
    [gameReview.keyMoments, reviewSide],
  );
  const activeReviewMoment = reviewMoments[reviewIndex] ?? null;
  const chartConfig = buildChartOptions(moveHistory, timelineReviews, ply => {
    const boundedIndex = Math.max(0, Math.min(ply, moveHistory.length));
    const nextGame = restoreGameFromHistory(moveHistory, initialFen, boundedIndex);

    setHistoryIndex(boundedIndex);
    setGame(nextGame);
    clearSelection();
  });

  const chartData = useMemo<ChartData<'line', number[], number>>(
    () => ({
      labels: timelineAnalyses.map((_, index) => index + 1),
      datasets: [
        {
          data: timelineAnalyses.map(analysis => toChartScore(analysis)),
          borderColor: '#9c84ff',
          backgroundColor: 'rgba(156, 132, 255, 0.16)',
          fill: true,
          borderWidth: 2,
          pointRadius: timelineReviews.map(review => (review.category ? 4.8 : 0)),
          pointHoverRadius: timelineReviews.map(review => (review.category ? 6.2 : 3.4)),
          pointBorderWidth: timelineReviews.map(review => (review.category ? 1.5 : 0)),
          pointBackgroundColor: timelineReviews.map(review => review.colorHex ?? '#8f75ff'),
          pointBorderColor: timelineReviews.map(review => review.colorHex ?? '#8f75ff'),
          pointStyle: timelineReviews.map(review => review.pointStyle),
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

  useEffect(() => {
    const stage = boardStageRef.current;

    if (!stage || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const railRect = evalRailRef.current?.getBoundingClientRect();
      const stageWidth = entry.contentRect.width;
      const stageHeight = entry.contentRect.height;
      const gap = 28;
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
    const controller = new AbortController();
    const requestId = ++positionRequestIdRef.current;

    setPositionLoading(true);
    setServerError('');

    analyzeSinglePosition(
      {
        fen: currentFen,
        initialFen,
        moves: currentMoveList,
        depth: 12,
      },
      controller.signal,
    )
      .then(analysis => {
        if (controller.signal.aborted || positionRequestIdRef.current !== requestId) {
          return;
        }

        setPositionAnalysis(analysis);
      })
      .catch(error => {
        if (error.name === 'AbortError' || positionRequestIdRef.current !== requestId) {
          return;
        }

        setPositionAnalysis(null);
        setServerError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted && positionRequestIdRef.current === requestId) {
          setPositionLoading(false);
        }
      });

    return () => controller.abort();
  }, [currentFen, currentLineKey, currentMoveList, initialFen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [historyIndex, initialFen, moveHistory]);

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
        boxShadow: 'inset 0 0 0 0.28vh rgba(143, 117, 255, 0.82)',
        backgroundColor: 'rgba(143, 117, 255, 0.16)',
      },
    };

    const moves = game.moves({ square: square as Square, verbose: true });

    for (const move of moves) {
      nextStyles[move.to] = game.get(move.to)
        ? {
            boxShadow: 'inset 0 0 0 0.18vh rgba(255, 255, 255, 0.28)',
            background:
              'radial-gradient(circle, rgba(143, 117, 255, 0.28) 0%, rgba(143, 117, 255, 0.08) 54%, transparent 56%)',
          }
        : {
            background:
              'radial-gradient(circle, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.22) 16%, transparent 18%)',
          };
    }

    setSquareStyles(nextStyles);
  }

  function commitMove(nextGame: Chess, move: StoredMove) {
    const nextHistory = [...moveHistory.slice(0, historyIndex), move];

    setMoveHistory(nextHistory);
    setHistoryIndex(nextHistory.length);
    setGame(nextGame);
    setTimelineAnalyses([]);
    setTimelineError('');
    clearSelection();
  }

  function tryMove(from: string, to: string) {
    const nextGame = new Chess(currentFen);
    const move = nextGame.move({
      from,
      to,
      promotion: 'q',
    });

    if (!move) {
      return false;
    }

    commitMove(nextGame, toStoredMove(move));
    return true;
  }

  function jumpToIndex(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, moveHistory.length));
    const nextGame = restoreGameFromHistory(moveHistory, initialFen, boundedIndex);

    setHistoryIndex(boundedIndex);
    setGame(nextGame);
    clearSelection();
  }

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
        depth: 10,
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
      setMode('overview');
      setReviewIndex(0);
      setPositionAnalysis(null);
      setPreMoveAnalyses([]);
      setTimelineAnalyses([]);
      setTimelineError('');
      setServerError('');
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

  return (
    <main className={styles.page}>
      <div className={styles.grid}>
        <aside className={`${styles.panel} ${styles.sidePanel}`}>
          <section className={`${styles.card} ${styles.pgnCard}`}>
            <div className={styles.pgnHeader}>
              <h2 className={styles.sectionTitle}>PGN</h2>
            </div>
            <div className={styles.pgnControls}>
              <label className={`${styles.action} ${styles.primary}`} htmlFor="pgn-upload">
                Load PGN
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
            <p className={styles.support}>{fileName}</p>
          </section>

          <section className={styles.modeTabs}>
            {(['overview', 'review', 'analysis'] satisfies LabMode[]).map(nextMode => (
              <button
                className={`${styles.modeTab} ${mode === nextMode ? styles.activeModeTab : ''}`}
                key={nextMode}
                onClick={() => {
                  if (nextMode === 'review') {
                    goToReviewMoment(reviewIndex);
                    return;
                  }

                  setMode(nextMode);
                }}
              >
                {nextMode}
              </button>
            ))}
          </section>

          <section className={styles.actions}>
            <button className={styles.action} onClick={() => jumpToIndex(historyIndex - 1)} disabled={historyIndex === 0}>
              Back
            </button>
            <button
              className={styles.action}
              onClick={() => jumpToIndex(historyIndex + 1)}
              disabled={historyIndex === moveHistory.length}
            >
              Forward
            </button>
            <button className={styles.action} onClick={() => setOrientation(value => (value === 'white' ? 'black' : 'white'))}>
              Flip board
            </button>
            <button className={styles.action} onClick={() => setShowArrow(value => !value)}>
              {showArrow ? 'Hide arrow' : 'Show arrow'}
            </button>
            <button className={styles.action} onClick={() => void runTimelineAnalysis()} disabled={timelineLoading}>
              {timelineLoading ? 'Refreshing' : 'Refresh line'}
            </button>
            <button
              className={styles.action}
              onClick={() => {
                positionRequestIdRef.current += 1;
                timelineRequestIdRef.current += 1;
                setGame(new Chess());
                setInitialFen(null);
                setMoveHistory([]);
                setHistoryIndex(0);
                setMetadata(null);
                setFileName('No PGN loaded');
                setMode('overview');
                setReviewIndex(0);
                setPositionAnalysis(null);
                setPreMoveAnalyses([]);
                setTimelineAnalyses([]);
                setPositionLoading(false);
                setTimelineLoading(false);
                setServerError('');
                setTimelineError('');
                clearSelection();
              }}
            >
              Reset
            </button>
          </section>

          <section className={`${styles.card} ${styles.metaList}`}>
            {[
              ['Event', metadata?.event ?? 'Manual board'],
              ['White', metadata ? `${metadata.whitePlayer} · ${metadata.whiteElo}` : 'White'],
              ['Black', metadata ? `${metadata.blackPlayer} · ${metadata.blackElo}` : 'Black'],
              ['Result', metadata?.result ?? '*'],
              ['Date', metadata?.date ?? 'Live board'],
            ].map(([label, value]) => (
              <div className={styles.metaRow} key={label}>
                <span className={styles.metaLabel}>{label}</span>
                <span className={styles.metaValue}>{value}</span>
              </div>
            ))}
          </section>
        </aside>

        <section className={`${styles.panel} ${styles.boardPanel}`}>
          <div className={styles.panelHeader}>
            <h2 className={styles.sectionTitle}>Position</h2>
            <span
              className={`${styles.statusPill} ${
                serverError ? styles.statusError : positionLoading ? styles.statusPending : styles.statusReady
              }`}
            >
              {serverError ? 'backend issue' : positionLoading ? 'analyzing' : 'ready'}
            </span>
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
                    borderRadius: '1.4vh',
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
                  arrows: bestMoveArrow,
                  lightSquareStyle: { backgroundColor: '#f2f2f0' },
                  darkSquareStyle: { backgroundColor: '#17131d' },
                  animationDurationInMs: 180,
                  showNotation: true,
                }}
              />
            </div>
          </div>

          <section className={`${styles.card} ${styles.analysis}`}>
            <p className={styles.copy}>{formatPrincipalVariation(currentFen, positionAnalysis?.pv ?? [])}</p>
            {serverError ? <p className={styles.error}>{serverError}</p> : null}
          </section>
        </section>

        <aside className={`${styles.panel} ${styles.infoPanel}`}>
          {mode === 'overview' ? (
            <>
              <section className={`${styles.card} ${styles.overviewCard}`}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.sectionTitle}>Overview</h2>
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
                moveHistoryLength={moveHistory.length}
                timelineAnalysesLength={timelineAnalyses.length}
                timelineError={timelineError}
                timelineLoading={timelineLoading}
              />
            </>
          ) : mode === 'review' ? (
            <>
              <section className={`${styles.card} ${styles.reviewCard}`}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.sectionTitle}>Review</h2>
                  <span className={styles.statusText}>
                    {reviewMoments.length ? `${reviewIndex + 1}/${reviewMoments.length}` : 'no moments'}
                  </span>
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
                      <span
                        className={styles.reviewBadge}
                        style={{ ['--review-color' as string]: activeReviewMoment.colorHex ?? '#8f75ff' }}
                      >
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
                  <p className={styles.empty}>Load a PGN and refresh the line to build key moments.</p>
                )}
              </section>
              <section className={`${styles.card} ${styles.momentListCard}`}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.sectionTitle}>Moments</h2>
                </div>
                <div className={styles.momentList}>
                  {reviewMoments.map((moment, index) => (
                    <button
                      className={`${styles.momentButton} ${index === reviewIndex ? styles.activeMoment : ''}`}
                      key={`${moment.ply}-${moment.category}`}
                      onClick={() => goToReviewMoment(index)}
                    >
                      <span>{moment.moveLabel}</span>
                      <strong>{moment.label}</strong>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <ChartSection
                chartConfig={chartConfig}
                chartData={chartData}
                historyIndex={historyIndex}
                moveHistoryLength={moveHistory.length}
                reviewSummary={reviewSummary}
                timelineAnalysesLength={timelineAnalyses.length}
                timelineError={timelineError}
                timelineLoading={timelineLoading}
                whiteReviewName={whiteReviewName}
                blackReviewName={blackReviewName}
              />
              <section className={`${styles.card} ${styles.movesCard}`}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.sectionTitle}>Moves</h2>
                </div>
                <div className={styles.moveList}>
                  {movePairs.length === 0 ? (
                    <p className={styles.empty}>No moves yet.</p>
                  ) : (
                    movePairs.map(pair => (
                      <div className={styles.moveRow} key={pair.moveNumber}>
                        <span className={styles.moveNumber}>{pair.moveNumber}</span>
                        <button
                          className={`${styles.moveChip} ${historyIndex === pair.whitePly ? styles.activeMove : ''}`}
                          onClick={() => jumpToIndex(pair.whitePly)}
                        >
                          {pair.white?.san ?? '...'}
                        </button>
                        <button
                          className={`${styles.moveChip} ${historyIndex === pair.blackPly ? styles.activeMove : ''}`}
                          onClick={() => jumpToIndex(pair.blackPly)}
                          disabled={!pair.black}
                        >
                          {pair.black?.san ?? ''}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

function ChartSection({
  chartConfig,
  chartData,
  historyIndex,
  moveHistoryLength,
  reviewSummary,
  timelineAnalysesLength,
  timelineError,
  timelineLoading,
  whiteReviewName,
  blackReviewName,
}: {
  chartConfig: ReturnType<typeof buildChartOptions>;
  chartData: ChartData<'line', number[], number>;
  historyIndex: number;
  moveHistoryLength: number;
  reviewSummary?: ReturnType<typeof summarizeTimelineReviews>;
  timelineAnalysesLength: number;
  timelineError: string;
  timelineLoading: boolean;
  whiteReviewName?: string;
  blackReviewName?: string;
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
          <div className={styles.boardFallback}>
            {timelineLoading ? 'Analyzing the whole line…' : 'Load a PGN or refresh the current line.'}
          </div>
        )}
      </div>
      {reviewSummary && whiteReviewName && blackReviewName ? (
        <div className={styles.reviewLegend}>
          {reviewCategoryOrder.map(category => {
            const meta = reviewCategoryMeta[category];
            const whiteCount = reviewSummary.white[category];
            const blackCount = reviewSummary.black[category];

            if (!whiteCount && !blackCount) {
              return null;
            }

            return (
              <div className={styles.reviewChip} key={category} style={{ ['--review-color' as string]: meta.color }}>
                <span className={styles.reviewDot} />
                <span className={styles.reviewLabel}>{meta.label}</span>
                <span className={styles.reviewCount}>
                  {whiteReviewName} {whiteCount}
                </span>
                <span className={styles.reviewCount}>
                  {blackReviewName} {blackCount}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {timelineError ? <p className={styles.error}>{timelineError}</p> : null}
    </section>
  );
}

function formatNullable(value: number | null) {
  return value == null ? '...' : `${value}`;
}

function formatExpectedLoss(value: number | null) {
  return value == null ? '...' : `${(value * 100).toFixed(1)}%`;
}
