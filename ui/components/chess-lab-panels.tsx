'use client';

import type { ChangeEvent } from 'react';
import type { ChartData } from 'chart.js';
import { Line } from 'react-chartjs-2';

import type { AnalysisLine, AnalysisResult } from '@/lib/analysis-types';
import {
  buildChartOptions,
  buildGameReview,
  filterReviewMoments,
  formatBestMove,
  formatPrincipalVariation,
  reviewCategoryMeta,
  reviewCategoryOrder,
  type ReviewSide,
  type StoredMove,
} from '@/lib/chess-analysis-client';
import type { ChessComRecentGameSummary } from '@/lib/chesscom';
import type { DeckCard, DeckFeedback, OpeningSeedLine } from '@/lib/opening-training';
import styles from './chess-analysis-lab.module.css';

export type WorkspaceMode = 'analyze' | 'gameReview' | 'learn' | 'deck';

export function getModeLabel(mode: WorkspaceMode) {
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

export function AnalyzePanel({
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

export function GameReviewPanel({
  activeReviewMoment,
  blackReviewName,
  chesscomUsername,
  chartConfig,
  chartData,
  gameReview,
  goToReviewMoment,
  hasLoadedGame,
  historyIndex,
  loadRecentGame,
  moveHistoryLength,
  onChesscomUsernameChange,
  onFetchRecentGames,
  openPgnDialog,
  recentGames,
  recentGamesError,
  recentGamesLoading,
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
  chesscomUsername: string;
  chartConfig: ReturnType<typeof buildChartOptions>;
  chartData: ChartData<'line', number[], number>;
  gameReview: ReturnType<typeof buildGameReview>;
  goToReviewMoment: (index: number) => void;
  hasLoadedGame: boolean;
  historyIndex: number;
  loadRecentGame: (game: ChessComRecentGameSummary) => void;
  moveHistoryLength: number;
  onChesscomUsernameChange: (value: string) => void;
  onFetchRecentGames: () => void;
  openPgnDialog: () => void;
  recentGames: ChessComRecentGameSummary[];
  recentGamesError: string;
  recentGamesLoading: boolean;
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
      <>
        <section className={`${styles.card} ${styles.emptyStateCard}`}>
          <div className={styles.panelHeader}>
            <h2 className={styles.sectionTitle}>Game Review</h2>
            <span className={styles.statusText}>{recentGamesLoading ? 'loading' : recentGames.length ? `${recentGames.length} games` : 'ready'}</span>
          </div>
          <p className={styles.copy}>Use your Chess.com username to pull recent public games, or import a PGN manually.</p>
          <div className={styles.inlineForm}>
            <input
              className={styles.inlineInput}
              value={chesscomUsername}
              onChange={event => onChesscomUsernameChange(event.target.value)}
              placeholder="losvalettos"
              spellCheck={false}
            />
            <button className={`${styles.action} ${styles.primary}`} onClick={onFetchRecentGames} disabled={!chesscomUsername.trim() || recentGamesLoading}>
              {recentGamesLoading ? 'Loading' : 'Fetch games'}
            </button>
          </div>
          <div className={styles.reviewImportActions}>
            <button className={styles.action} onClick={openPgnDialog}>
              Import PGN
            </button>
          </div>
          {recentGamesError ? <p className={styles.error}>{recentGamesError}</p> : null}
        </section>
        {recentGames.length ? (
          <section className={`${styles.card} ${styles.openingListCard}`}>
            <div className={styles.panelHeader}>
              <h2 className={styles.sectionTitle}>Recent Blitz</h2>
              <span className={styles.statusText}>click to review</span>
            </div>
            <div className={styles.openingList}>
              {recentGames.map(game => (
                <button className={styles.openingButton} key={game.link} onClick={() => loadRecentGame(game)}>
                  <span>{formatRecentGameLabel(game)}</span>
                  <strong>{game.playerColor}</strong>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </>
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

function formatRecentGameLabel(game: ChessComRecentGameSummary) {
  const date = game.utcDate ?? 'recent';
  const eco = game.eco ?? 'game';
  const opponent = game.opponentUsername ?? 'opponent';
  return `${date} · ${eco} · vs ${opponent}`;
}

export function LearnPanel({
  currentFen,
  deckCards,
  deckLoadError,
  deckLoading,
  nextDeckCard,
  openingLines,
  positionAnalysis,
  startCard,
}: {
  currentFen: string;
  deckCards: DeckCard[];
  deckLoadError: string;
  deckLoading: boolean;
  nextDeckCard: DeckCard | null;
  openingLines: OpeningSeedLine[];
  positionAnalysis: AnalysisResult | null;
  startCard: (card: DeckCard | null) => void;
}) {
  const hasDeckCards = deckCards.length > 0;
  const whiteCards = deckCards.filter(card => card.side === 'white').length;
  const blackCards = deckCards.length - whiteCards;
  const legitOptions = positionAnalysis?.lines?.slice(0, 3) ?? [];

  return (
    <>
      <section className={`${styles.card} ${styles.emptyStateCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Punish Deck</h2>
          <span className={styles.statusText}>{deckLoading ? 'loading' : hasDeckCards ? `${deckCards.length} cards` : 'empty'}</span>
        </div>
        {hasDeckCards ? (
          <>
            <div className={styles.deckStats}>
              <div>
                <strong>{openingLines.length}</strong>
                <span>lines</span>
              </div>
              <div>
                <strong>{whiteCards}</strong>
                <span>white</span>
              </div>
              <div>
                <strong>{blackCards}</strong>
                <span>black</span>
              </div>
            </div>
            <button className={`${styles.action} ${styles.primary} ${styles.fullWidthAction}`} onClick={() => startCard(nextDeckCard)} disabled={deckLoading || !nextDeckCard}>
              {deckLoading ? 'Loading deck' : 'Start punish deck'}
            </button>
          </>
        ) : (
          <p className={styles.copy}>
            {deckLoading
              ? 'Loading deck.'
              : deckLoadError
                ? 'Deck setup is broken. Recreate the canonical Supabase schema and seed cards.'
                : 'No punish cards have been seeded yet.'}
          </p>
        )}
        {deckLoadError ? <p className={styles.error}>{deckLoadError}</p> : null}
      </section>
      <section className={`${styles.card} ${styles.engineCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Legit options</h2>
          <span className={styles.statusText}>{legitOptions.length ? 'not graded' : 'waiting'}</span>
        </div>
        <div className={styles.engineLines}>
          {legitOptions.length > 0 ? (
            legitOptions.map(line => (
              <div className={styles.engineLine} key={line.multipv}>
                <div className={styles.engineLineHead}>
                  <span className={styles.engineRank}>#{line.multipv}</span>
                  <strong>{line.bestMove ? formatBestMove(currentFen, line.bestMove) : '--'}</strong>
                  <span>{formatLineScore(line)}</span>
                </div>
                <p className={styles.enginePv}>{formatPvLine(currentFen, line.pv)}</p>
              </div>
            ))
          ) : (
            <p className={styles.empty}>Analyze a position to see acceptable candidate moves.</p>
          )}
        </div>
      </section>
      {hasDeckCards ? (
        <section className={`${styles.card} ${styles.openingListCard}`}>
          <div className={styles.panelHeader}>
            <h2 className={styles.sectionTitle}>Punishable replies</h2>
            <span className={styles.statusText}>eval-graded deck</span>
          </div>
          <div className={styles.openingList}>
            {openingLines.map(line => {
              const lineCards = deckCards.filter(card => card.lineId === line.id);
              const firstCard = lineCards[0] ?? null;

              return (
                <button className={styles.openingButton} key={line.id} onClick={() => startCard(firstCard)} disabled={!firstCard}>
                  <span>
                    {line.eco} · {line.name}
                  </span>
                  <strong>{lineCards.length}</strong>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function DeckPanel({
  activeCard,
  deckCounterSan,
  deckCards,
  deckLoadError,
  deckLoading,
  deckFeedback,
  deckStats,
  nextCard,
  onNext,
  onRepeat,
  startCard,
}: {
  activeCard: DeckCard | null;
  deckCounterSan: string | null;
  deckCards: DeckCard[];
  deckLoadError: string;
  deckLoading: boolean;
  deckFeedback: DeckFeedback | null;
  deckStats: { correct: number; misses: number };
  nextCard: DeckCard | null;
  onNext: () => void;
  onRepeat: () => void;
  startCard: (card: DeckCard | null) => void;
}) {
  const card = activeCard ?? nextCard;
  const cardLoaded = Boolean(activeCard && card && activeCard.id === card.id);

  return (
    <>
      <section className={`${styles.card} ${styles.deckCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Deck</h2>
          <span className={styles.statusText}>{cardLoaded ? 'loaded' : deckLoading ? 'loading' : `${deckCards.length} punish cards`}</span>
        </div>
        {card ? (
          <>
            <div className={styles.deckPrompt}>
              <span className={styles.metaLabel}>
                {card.eco} · {card.lineName}
              </span>
              <strong>{card.prompt}</strong>
              <p>{card.context}</p>
              <div className={styles.deckLoadState}>
                <span>{cardLoaded ? 'Card loaded on board' : 'Ready to load'}</span>
                <strong>{card.side} repertoire</strong>
              </div>
            </div>
            {deckFeedback ? (
              <div className={`${styles.feedbackBox} ${deckFeedback.pending || deckFeedback.correct ? styles.feedbackGood : styles.feedbackBad}`}>
                <strong>
                  {deckFeedback.pending
                    ? 'Checking eval'
                    : deckFeedback.correct
                      ? deckFeedback.exact
                        ? 'Best move'
                        : 'Accepted'
                      : 'Too inaccurate'}
                </strong>
                <span>
                  played {deckFeedback.playedSan} · best {deckFeedback.expectedSan}
                  {deckFeedback.evalLossCp != null ? ` · loss ${formatCpSwing(deckFeedback.evalLossCp)}` : ''}
                  {deckFeedback.maxEvalLossCp != null ? ` / ${formatCpSwing(deckFeedback.maxEvalLossCp)}` : ''}
                  {deckFeedback.scoreSwingCp != null ? ` · swing ${formatCpSwing(deckFeedback.scoreSwingCp)}` : ''}
                </span>
                {!deckFeedback.pending && !deckFeedback.correct && deckCounterSan ? <span>counter {deckCounterSan}</span> : null}
              </div>
            ) : (
              <p className={styles.copy}>
                {cardLoaded
                  ? card.validationMode === 'within_eval_loss' && card.maxEvalLossCp != null
                    ? `Play the move on the board. Any punishment within ${formatCpSwing(card.maxEvalLossCp)} of best is accepted.`
                    : 'Play the exact move on the board. The answer is strict.'
                  : 'Load the card to put its position on the board.'}
              </p>
            )}
            <div className={styles.deckActions}>
              <button className={`${styles.action} ${styles.primary}`} onClick={() => startCard(card)} disabled={cardLoaded && !deckFeedback}>
                {cardLoaded ? 'Loaded' : 'Load card'}
              </button>
              <button className={styles.action} onClick={onRepeat} disabled={!activeCard}>
                Repeat
              </button>
              <button className={styles.action} onClick={onNext}>
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.empty}>{deckLoading ? 'Loading punish deck from Supabase.' : 'No punish deck loaded.'}</p>
            {deckLoadError ? <p className={styles.error}>{deckLoadError}</p> : null}
          </>
        )}
      </section>
      <section className={`${styles.card} ${styles.dataCard}`}>
        <div className={styles.deckStats}>
          <div>
            <strong>{deckStats.correct}</strong>
            <span>hit</span>
          </div>
          <div>
            <strong>{deckStats.misses}</strong>
            <span>miss</span>
          </div>
          <div>
            <strong>{deckStats.correct + deckStats.misses}</strong>
            <span>seen</span>
          </div>
        </div>
      </section>
    </>
  );
}

export function PgnImportDialog({
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
              <p className={styles.enginePv}>{formatPvLine(currentFen, line.pv)}</p>
            </div>
          ))
        ) : (
          <p className={styles.empty}>{positionLoading ? 'Analyzing candidate lines.' : 'No engine lines yet.'}</p>
        )}
      </div>
    </section>
  );
}

function formatNullable(value: number | null) {
  return value == null ? '--' : `${value}`;
}

function formatExpectedLoss(value: number | null) {
  return value == null ? '--' : `${(value * 100).toFixed(1)}%`;
}

function formatCpSwing(value: number) {
  return `${(value / 100).toFixed(2)} pawns`;
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

function formatPvLine(fen: string, pv: string[]) {
  const line = formatPrincipalVariation(fen, pv);
  return formatMoveFigurine(line).replaceAll(' ', '  →  ');
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
