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
} from 'chart.js';
import { Line } from 'react-chartjs-2';

import type { AnalysisResult } from '@/lib/analysis-types';
import {
  analyzeGamePositions,
  analyzeSinglePosition,
  buildMoveUciHistory,
  buildTimelinePositions,
  chartOptions,
  extractMetadataFromGame,
  formatBestMove,
  formatPrincipalVariation,
  formatScoreLabel,
  getAdvantageMeter,
  getBestMoveArrow,
  restoreGameFromHistory,
  toChartScore,
  toStoredMove,
  wdlToPercentages,
  type GameMetadata,
  type StoredMove,
} from '@/lib/chess-analysis-client';
import styles from './chess-analysis-lab.module.css';

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
  const [metadata, setMetadata] = useState<GameMetadata | null>(null);
  const [fileName, setFileName] = useState('No PGN loaded');
  const [positionAnalysis, setPositionAnalysis] = useState<AnalysisResult | null>(null);
  const [timelineAnalyses, setTimelineAnalyses] = useState<AnalysisResult[]>([]);
  const [positionLoading, setPositionLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [timelineError, setTimelineError] = useState('');
  const [boardWidth, setBoardWidth] = useState(640);

  const boardFrameRef = useRef<HTMLDivElement | null>(null);

  const currentFen = useMemo(() => game.fen(), [game]);
  const currentMoves = useMemo(() => moveHistory.slice(0, historyIndex), [moveHistory, historyIndex]);
  const currentMoveList = useMemo(() => buildMoveUciHistory(currentMoves), [currentMoves]);
  const currentLineKey = currentMoveList.join(' ');
  const whiteAdvantage = getAdvantageMeter(positionAnalysis);
  const bestMoveArrow = showArrow ? getBestMoveArrow(positionAnalysis?.bestMove ?? null) : [];
  const wdl = wdlToPercentages(positionAnalysis?.whitePerspectiveWdl ?? null);

  const chartData = useMemo(
    () => ({
      labels: timelineAnalyses.map((_, index) => index + 1),
      datasets: [
        {
          data: timelineAnalyses.map(analysis => toChartScore(analysis)),
          borderColor: '#9c84ff',
          backgroundColor: 'rgba(156, 132, 255, 0.16)',
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.28,
        },
      ],
    }),
    [timelineAnalyses],
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
    const frame = boardFrameRef.current;

    if (!frame || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      setBoardWidth(Math.max(220, Math.floor(entry.contentRect.width)));
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

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
        setPositionAnalysis(analysis);
      })
      .catch(error => {
        if (error.name === 'AbortError') {
          return;
        }

        setPositionAnalysis(null);
        setServerError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
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

  async function runTimelineAnalysis(nextMoves = moveHistory, nextInitialFen = initialFen) {
    if (nextMoves.length === 0) {
      setTimelineAnalyses([]);
      setTimelineError('');
      return;
    }

    setTimelineLoading(true);
    setTimelineError('');

    try {
      const response = await analyzeGamePositions({
        positions: buildTimelinePositions(nextMoves, nextInitialFen),
        depth: 10,
      });

      setTimelineAnalyses(response.analyses ?? []);
    } catch (error) {
      setTimelineAnalyses([]);
      setTimelineError(error instanceof Error ? error.message : 'Unable to analyze the line.');
    } finally {
      setTimelineLoading(false);
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

  return (
    <main className={styles.page}>
      <div className={styles.grid}>
        <aside className={`${styles.panel} ${styles.sidePanel}`}>
          <section className={styles.card}>
            <p className={styles.eyebrow}>PGN</p>
            <label className={`${styles.action} ${styles.primary}`} htmlFor="pgn-upload">
              Load PGN
            </label>
            <input className={styles.hiddenInput} id="pgn-upload" type="file" accept=".pgn" onChange={handleUpload} />
            <p className={styles.support}>{fileName}</p>
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
                setGame(new Chess());
                setInitialFen(null);
                setMoveHistory([]);
                setHistoryIndex(0);
                setMetadata(null);
                setFileName('No PGN loaded');
                setPositionAnalysis(null);
                setTimelineAnalyses([]);
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
            <div>
              <p className={styles.eyebrow}>Live Position</p>
              <h2 className={styles.sectionTitle}>{positionLoading ? 'Engine is thinking' : 'Position synced'}</h2>
            </div>
            <span
              className={`${styles.statusPill} ${
                serverError ? styles.statusError : positionLoading ? styles.statusPending : styles.statusReady
              }`}
            >
              {serverError ? 'backend issue' : positionLoading ? 'analyzing' : 'ready'}
            </span>
          </div>

          <div className={styles.boardStage}>
            <div className={styles.evalRail}>
              <div className={styles.evalShell} style={{ ['--white-share' as string]: `${whiteAdvantage}%` }}>
                <div className={styles.evalBlack} />
                <div className={styles.evalWhite} />
                <div className={styles.evalDivider} />
              </div>
              <div className={styles.evalCopy}>
                <span className={styles.score}>{formatScoreLabel(positionAnalysis)}</span>
                <span className={styles.scoreCaption}>white view</span>
              </div>
            </div>

            <div className={styles.boardFrame} ref={boardFrameRef}>
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

          <section className={styles.metrics}>
            <MetricCard label="Best move" value={formatBestMove(currentFen, positionAnalysis?.bestMove ?? null)} />
            <MetricCard label="Depth" value={positionAnalysis?.depth ? `${positionAnalysis.depth}` : '...'} />
            <MetricCard
              label="Nodes"
              value={positionAnalysis?.nodes ? positionAnalysis.nodes.toLocaleString() : '...'}
            />
            <MetricCard label="Time" value={positionAnalysis?.timeMs ? `${positionAnalysis.timeMs} ms` : '...'} />
          </section>

          <section className={`${styles.card} ${styles.analysis}`}>
            <div>
              <p className={styles.eyebrow}>Principal Variation</p>
              <p className={styles.copy}>
                {formatPrincipalVariation(currentFen, positionAnalysis?.pv ?? [])}
              </p>
            </div>
            <div>
              <p className={styles.eyebrow}>WDL</p>
              <div className={styles.wdl}>
                <span>White {wdl?.white ?? 0}%</span>
                <span>Draw {wdl?.draw ?? 0}%</span>
                <span>Black {wdl?.black ?? 0}%</span>
              </div>
            </div>
            {serverError ? <p className={styles.error}>{serverError}</p> : null}
          </section>
        </section>

        <aside className={`${styles.panel} ${styles.infoPanel}`}>
          <section className={`${styles.card} ${styles.chartCard}`}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Timeline</p>
                <h2 className={styles.sectionTitle}>Evaluation curve</h2>
              </div>
              <span className={styles.statusText}>{timelineLoading ? 'refreshing' : `ply ${historyIndex}/${moveHistory.length}`}</span>
            </div>
            <div className={styles.chartWrap}>
              {timelineAnalyses.length > 0 ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <div className={styles.boardFallback}>
                  {timelineLoading ? 'Analyzing the whole line…' : 'Load a PGN or refresh the current line.'}
                </div>
              )}
            </div>
            {timelineError ? <p className={styles.error}>{timelineError}</p> : null}
          </section>

          <section className={`${styles.card} ${styles.movesCard}`}>
            <div className={styles.panelHeader}>
              <p className={styles.eyebrow}>Move list</p>
              <span className={styles.statusText}>Arrow keys work too</span>
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
        </aside>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${styles.card} ${styles.metric}`}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </div>
  );
}
