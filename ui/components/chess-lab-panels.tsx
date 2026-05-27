'use client';

import { Fragment, useEffect, useMemo, useRef, type ChangeEvent, type ReactNode, type RefObject } from 'react';

import type { AnalysisLine, AnalysisResult } from '@/lib/analysis-types';
import {
  filterReviewMoments,
  formatBestMove,
  formatPrincipalVariation,
  toChartScore,
  type ReviewCategory,
  type StoredMove,
  type TimelineReview,
} from '@/lib/chess-analysis-client';
import type { ChessComRecentGameSummary } from '@/lib/chesscom';
import type { DeckProgressEntry, DeckProgressSummary } from '@/lib/deck-progress';
import type { DeckCard, DeckFeedback, OpeningSeedLine } from '@/lib/opening-training';
import styles from './chess-analysis-lab.module.css';

export type WorkspaceMode = 'review' | 'train';

export function getModeLabel(mode: WorkspaceMode) {
  switch (mode) {
    case 'review':
      return 'Review';
    case 'train':
      return 'Train';
  }
}

export function ReviewPanel({
  activeReviewMoment,
  blackReviewName,
  chesscomUsername,
  goToReviewMoment,
  hasLoadedGame,
  historyIndex,
  jumpToIndex,
  loadRecentGame,
  moveHistoryLength,
  movePairs,
  onBack,
  onChesscomUsernameChange,
  onRecentGameTimeClassChange,
  onFetchRecentGames,
  onLoadMoreRecentGames,
  recentGames,
  recentGamesError,
  recentGamesHasMore,
  recentGamesLoading,
  recentGameTimeClass,
  reviewMoments,
  setShowArrow,
  timelineAnalyses,
  timelineAnalysesLength,
  timelineError,
  timelineLoading,
  timelineReviews,
  whiteReviewName,
}: {
  activeReviewMoment: ReturnType<typeof filterReviewMoments>[number] | null;
  blackReviewName: string;
  chesscomUsername: string;
  goToReviewMoment: (index: number) => void;
  hasLoadedGame: boolean;
  historyIndex: number;
  jumpToIndex: (index: number) => void;
  loadRecentGame: (game: ChessComRecentGameSummary) => void;
  moveHistoryLength: number;
  movePairs: Array<{
    moveNumber: number;
    white: StoredMove | null;
    whitePly: number;
    black: StoredMove | null;
    blackPly: number;
  }>;
  onBack: () => void;
  onChesscomUsernameChange: (value: string) => void;
  onRecentGameTimeClassChange: (value: 'bullet' | 'blitz' | 'rapid') => void;
  onFetchRecentGames: () => void;
  onLoadMoreRecentGames: () => void;
  recentGames: ChessComRecentGameSummary[];
  recentGamesError: string;
  recentGamesHasMore: boolean;
  recentGamesLoading: boolean;
  recentGameTimeClass: 'bullet' | 'blitz' | 'rapid';
  reviewMoments: ReturnType<typeof filterReviewMoments>;
  setShowArrow: (value: boolean) => void;
  timelineAnalyses: AnalysisResult[];
  timelineAnalysesLength: number;
  timelineError: string;
  timelineLoading: boolean;
  timelineReviews: TimelineReview[];
  whiteReviewName: string;
}) {
  if (!hasLoadedGame) {
    return (
      <GameReviewPanel
        activeReviewMoment={activeReviewMoment}
        blackReviewName={blackReviewName}
        chesscomUsername={chesscomUsername}
        goToReviewMoment={goToReviewMoment}
        hasLoadedGame={false}
        historyIndex={historyIndex}
        jumpToIndex={jumpToIndex}
        loadRecentGame={loadRecentGame}
        movePairs={movePairs}
        moveHistoryLength={moveHistoryLength}
        onChesscomUsernameChange={onChesscomUsernameChange}
        onRecentGameTimeClassChange={onRecentGameTimeClassChange}
        onFetchRecentGames={onFetchRecentGames}
        onLoadMoreRecentGames={onLoadMoreRecentGames}
        recentGames={recentGames}
        recentGamesError={recentGamesError}
        recentGamesHasMore={recentGamesHasMore}
        recentGamesLoading={recentGamesLoading}
        recentGameTimeClass={recentGameTimeClass}
        reviewMoments={reviewMoments}
        setShowArrow={setShowArrow}
        timelineAnalyses={timelineAnalyses}
        timelineAnalysesLength={timelineAnalysesLength}
        timelineError={timelineError}
        timelineLoading={timelineLoading}
        timelineReviews={timelineReviews}
        whiteReviewName={whiteReviewName}
      />
    );
  }

  return (
    <div className={styles.reviewLoadedPanel}>
      <section className={styles.reviewLoadedTop}>
        <button className={`${styles.action} ${styles.fullWidthAction}`} onClick={onBack}>
          Back
        </button>
      </section>
      <GameReviewPanel
        activeReviewMoment={activeReviewMoment}
        blackReviewName={blackReviewName}
        chesscomUsername={chesscomUsername}
        goToReviewMoment={goToReviewMoment}
        hasLoadedGame={true}
        historyIndex={historyIndex}
        jumpToIndex={jumpToIndex}
        loadRecentGame={loadRecentGame}
        movePairs={movePairs}
        moveHistoryLength={moveHistoryLength}
        onChesscomUsernameChange={onChesscomUsernameChange}
        onRecentGameTimeClassChange={onRecentGameTimeClassChange}
        onFetchRecentGames={onFetchRecentGames}
        onLoadMoreRecentGames={onLoadMoreRecentGames}
        recentGames={recentGames}
        recentGamesError={recentGamesError}
        recentGamesHasMore={recentGamesHasMore}
        recentGamesLoading={recentGamesLoading}
        recentGameTimeClass={recentGameTimeClass}
        reviewMoments={reviewMoments}
        setShowArrow={setShowArrow}
        timelineAnalyses={timelineAnalyses}
        timelineAnalysesLength={timelineAnalysesLength}
        timelineError={timelineError}
        timelineLoading={timelineLoading}
        timelineReviews={timelineReviews}
        whiteReviewName={whiteReviewName}
      />
    </div>
  );
}

export function TrainPanel({
  activeCard,
  activeCardProgress,
  currentFen,
  deckCards,
  deckCounterSan,
  deckLoadError,
  deckLoading,
  deckFeedback,
  deckStats,
  nextCard,
  onBack,
  onNext,
  onRepeat,
  onToggleIgnore,
  openingLines,
  positionAnalysis,
  startCard,
}: {
  activeCard: DeckCard | null;
  activeCardProgress: DeckProgressEntry | null;
  currentFen: string;
  deckCards: DeckCard[];
  deckCounterSan: string | null;
  deckLoadError: string;
  deckLoading: boolean;
  deckFeedback: DeckFeedback | null;
  deckStats: DeckProgressSummary;
  nextCard: DeckCard | null;
  onBack: () => void;
  onNext: () => void;
  onRepeat: () => void;
  onToggleIgnore: () => void;
  openingLines: OpeningSeedLine[];
  positionAnalysis: AnalysisResult | null;
  startCard: (card: DeckCard | null) => void;
}) {
  if (!activeCard) {
    return (
      <LearnPanel
        currentFen={currentFen}
        deckCards={deckCards}
        deckLoadError={deckLoadError}
        deckLoading={deckLoading}
        nextDeckCard={nextCard}
        openingLines={openingLines}
        positionAnalysis={positionAnalysis}
        startCard={startCard}
      />
    );
  }

  return (
    <>
      <section className={`${styles.card} ${styles.stateHeaderCard}`}>
        <button className={styles.action} onClick={onBack}>
          Back
        </button>
        <div className={styles.stateHeaderMain}>
          <strong>
            Learning card
          </strong>
          <span className={styles.support}>
            {formatCardLineTitle(activeCard)} · {activeCard.side}
            {activeCardProgress?.ignored ? ' · ignored' : ''}
          </span>
        </div>
        <div className={styles.stateHeaderMeta}>
          <strong>{deckStats.seen}</strong>
          <span>seen</span>
        </div>
      </section>
      <DeckPanel
        activeCard={activeCard}
        activeCardProgress={activeCardProgress}
        deckCounterSan={deckCounterSan}
        deckCards={deckCards}
        deckLoadError={deckLoadError}
        deckLoading={deckLoading}
        deckFeedback={deckFeedback}
        deckStats={deckStats}
        nextCard={nextCard}
        onNext={onNext}
        onRepeat={onRepeat}
        onToggleIgnore={onToggleIgnore}
        startCard={startCard}
      />
    </>
  );
}

export function TrainingProfilePanel({
  error,
  loading,
  password,
  setPassword,
  setUsername,
  username,
  onSubmit,
}: {
  error: string;
  loading: boolean;
  password: string;
  setPassword: (value: string) => void;
  setUsername: (value: string) => void;
  username: string;
  onSubmit: () => void;
}) {
  return (
    <section className={`${styles.card} ${styles.emptyStateCard}`}>
      <div className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>Training Profile</h2>
        <span className={styles.statusText}>{loading ? 'syncing' : 'required'}</span>
      </div>
      <div className={styles.profileForm}>
        <input
          className={`${styles.inlineInput} ${styles.profileFormWide}`}
          value={username}
          onChange={event => setUsername(event.target.value)}
          autoComplete="off"
          autoCorrect="off"
          name="training_profile_handle"
          placeholder="username"
          spellCheck={false}
        />
        <input
          className={`${styles.inlineInput} ${styles.profileFormWide}`}
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="password"
          type="password"
        />
        <button className={`${styles.action} ${styles.primary} ${styles.profileFormWide}`} onClick={onSubmit} disabled={loading || username.trim().length < 3 || password.length < 4}>
          {loading ? 'Opening' : 'Open profile'}
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
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
  const engineLines = getDisplayEngineLines(positionAnalysis);

  return (
    <>
      {engineLines.length > 0 ? (
        <EngineLinesSection currentFen={currentFen} lines={engineLines} positionAnalysis={positionAnalysis} positionLoading={positionLoading} />
      ) : null}
      <section className={`${styles.card} ${styles.movesCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Line</h2>
          <span className={styles.statusText}>{movePairs.length ? `${movePairs.length} moves` : 'manual board'}</span>
        </div>
        <div className={styles.moveList}>
          {movePairs.length === 0 ? (
            <p className={styles.empty}>Play on the board or import a PGN.</p>
          ) : (
            <>
              <div className={styles.moveTableHeader} aria-hidden="true">
                <span />
                <span>White</span>
                <span>Black</span>
              </div>
              {movePairs.map(pair => (
                <div className={styles.moveRow} key={pair.moveNumber}>
                  <span className={styles.moveNumber}>{pair.moveNumber}.</span>
                  <button
                    className={`${styles.moveCellButton} ${historyIndex === pair.whitePly ? styles.activeMoveCell : ''}`}
                    onClick={() => jumpToIndex(pair.whitePly)}
                  >
                    {pair.white ? renderMoveFigurine(pair.white.san) : '...'}
                  </button>
                  <button
                    className={`${styles.moveCellButton} ${historyIndex === pair.blackPly ? styles.activeMoveCell : ''}`}
                    onClick={() => jumpToIndex(pair.blackPly)}
                    disabled={!pair.black}
                  >
                    {pair.black ? renderMoveFigurine(pair.black.san) : ''}
                  </button>
                </div>
              ))}
            </>
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
  goToReviewMoment,
  hasLoadedGame,
  historyIndex,
  jumpToIndex,
  loadRecentGame,
  movePairs,
  moveHistoryLength,
  onChesscomUsernameChange,
  onRecentGameTimeClassChange,
  onFetchRecentGames,
  onLoadMoreRecentGames,
  recentGames,
  recentGamesError,
  recentGamesHasMore,
  recentGamesLoading,
  recentGameTimeClass,
  reviewMoments,
  setShowArrow,
  timelineAnalyses,
  timelineAnalysesLength,
  timelineError,
  timelineLoading,
  timelineReviews,
  whiteReviewName,
}: {
  activeReviewMoment: ReturnType<typeof filterReviewMoments>[number] | null;
  blackReviewName: string;
  chesscomUsername: string;
  goToReviewMoment: (index: number) => void;
  hasLoadedGame: boolean;
  historyIndex: number;
  jumpToIndex: (index: number) => void;
  loadRecentGame: (game: ChessComRecentGameSummary) => void;
  movePairs: Array<{
    moveNumber: number;
    white: StoredMove | null;
    whitePly: number;
    black: StoredMove | null;
    blackPly: number;
  }>;
  moveHistoryLength: number;
  onChesscomUsernameChange: (value: string) => void;
  onRecentGameTimeClassChange: (value: 'bullet' | 'blitz' | 'rapid') => void;
  onFetchRecentGames: () => void;
  onLoadMoreRecentGames: () => void;
  recentGames: ChessComRecentGameSummary[];
  recentGamesError: string;
  recentGamesHasMore: boolean;
  recentGamesLoading: boolean;
  recentGameTimeClass: 'bullet' | 'blitz' | 'rapid';
  reviewMoments: ReturnType<typeof filterReviewMoments>;
  setShowArrow: (value: boolean) => void;
  timelineAnalyses: AnalysisResult[];
  timelineAnalysesLength: number;
  timelineError: string;
  timelineLoading: boolean;
  timelineReviews: TimelineReview[];
  whiteReviewName: string;
}) {
  const activeMoveButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentReview = historyIndex > 0 ? (timelineReviews[historyIndex - 1] ?? null) : null;
  const activeMomentIsQueued =
    activeReviewMoment != null && (historyIndex === Math.max(0, activeReviewMoment.ply - 1) || historyIndex === activeReviewMoment.ply);
  const coachReview = activeMomentIsQueued ? activeReviewMoment : (currentReview ?? activeReviewMoment);
  const displayActivePly = activeMomentIsQueued && activeReviewMoment ? activeReviewMoment.ply : historyIndex;
  const nextMomentIndex = useMemo(
    () => reviewMoments.findIndex(moment => moment.ply > historyIndex),
    [historyIndex, reviewMoments],
  );
  const hasNextReviewStep = nextMomentIndex >= 0 || historyIndex < moveHistoryLength;

  useEffect(() => {
    if (!hasLoadedGame) {
      return;
    }

    activeMoveButtonRef.current?.scrollIntoView({ block: 'start', inline: 'nearest' });
  }, [hasLoadedGame, historyIndex]);

  if (!hasLoadedGame) {
    return (
      <>
        <section className={`${styles.card} ${styles.emptyStateCard}`}>
          <div className={styles.panelHeader}>
            <h2 className={styles.sectionTitle}>Game Review</h2>
            <span className={styles.statusText}>{recentGamesLoading ? 'loading' : recentGames.length ? `${recentGames.length} games` : 'ready'}</span>
          </div>
          <p className={styles.copy}>Use your Chess.com username to pull recent public games.</p>
          <div className={styles.inlineForm}>
            <input
              className={styles.inlineInput}
              value={chesscomUsername}
              onChange={event => onChesscomUsernameChange(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              name="chesscom_lookup_handle"
              placeholder=""
              spellCheck={false}
            />
            <button className={styles.action} onClick={() => onChesscomUsernameChange('')} disabled={!chesscomUsername}>
              Clear
            </button>
            <button className={`${styles.action} ${styles.primary} ${styles.inlineFormWide}`} onClick={onFetchRecentGames} disabled={!chesscomUsername.trim() || recentGamesLoading}>
              {recentGamesLoading ? 'Loading' : 'Fetch games'}
            </button>
          </div>
          <div className={styles.reviewSideTabs}>
            {(['bullet', 'blitz', 'rapid'] as const).map(timeClass => (
              <button
                className={`${styles.action} ${recentGameTimeClass === timeClass ? styles.primary : styles.secondary}`}
                key={timeClass}
                onClick={() => onRecentGameTimeClassChange(timeClass)}
              >
                {timeClass}
              </button>
            ))}
          </div>
          {recentGamesError ? <p className={styles.error}>{recentGamesError}</p> : null}
        </section>
        {recentGames.length ? (
          <section className={`${styles.card} ${styles.openingListCard}`}>
            <div className={styles.panelHeader}>
              <h2 className={styles.sectionTitle}>Recent {capitalizeRecentGameTimeClass(recentGameTimeClass)}</h2>
              <span className={styles.statusText}>click to review</span>
            </div>
            <div className={styles.openingList}>
              {recentGames.map(game => (
                <button
                  className={`${styles.openingButton} ${styles.recentGameButton} ${
                    game.outcome === 'win' ? styles.recentGameWin : game.outcome === 'loss' ? styles.recentGameLoss : styles.recentGameDraw
                  }`}
                  key={game.link}
                  onClick={() => loadRecentGame(game)}
                >
                  <span className={styles.recentGameDate}>{game.utcDate ?? 'recent'}</span>
                  <strong className={styles.recentGamePlayers}>
                    {formatRecentGamePlayers(game)}
                  </strong>
                  <span className={styles.recentGameMoves}>{game.moveCount ? `${game.moveCount} moves` : '-'}</span>
                  <span className={styles.recentGameMeta}>
                    {formatRecentGameMeta(game)}
                  </span>
                </button>
              ))}
            </div>
            {recentGamesHasMore ? (
              <button className={`${styles.action} ${styles.fullWidthAction}`} onClick={onLoadMoreRecentGames} disabled={recentGamesLoading}>
                {recentGamesLoading ? 'Loading' : 'Load 10 more'}
              </button>
            ) : null}
          </section>
        ) : null}
      </>
    );
  }

  return (
    <section className={styles.reviewGamePanel}>
      <div className={styles.reviewCoach}>
        <div className={styles.coachHeader}>
          <div className={styles.coachTitle}>
            <span className={styles.reviewBadge} style={{ ['--review-color' as string]: coachReview?.colorHex ?? '#98b8ff' }}>
              {coachReview?.label ?? (timelineLoading ? 'Analyzing' : 'Review')}
            </span>
            <strong>{coachReview ? `${coachReview.moveLabel} ${coachReview.san}` : `${whiteReviewName} vs ${blackReviewName}`}</strong>
          </div>
          <span className={styles.statusText}>{timelineLoading ? 'building' : `${reviewMoments.length} moments`}</span>
        </div>
        <p className={styles.coachText}>{coachReview ? compactCoachText(coachReview) : 'Load moments by analyzing the game.'}</p>
        <div className={styles.reviewCoachActions}>
          <button
            className={styles.action}
            onClick={() => {
              setShowArrow(true);
              if (coachReview) {
                jumpToIndex(Math.max(0, coachReview.ply - 1));
              }
            }}
            disabled={!coachReview?.bestMoveSan}
          >
            Best
          </button>
          <button
            className={`${styles.action} ${styles.primary}`}
            onClick={() => goToReviewMoment(nextMomentIndex >= 0 ? nextMomentIndex : reviewMoments.length)}
            disabled={!hasNextReviewStep}
          >
            Next
          </button>
        </div>
      </div>

      <div className={styles.reviewMoveTable} role="list" aria-label="Reviewed moves">
        {movePairs.map(pair => (
          <div className={styles.reviewMoveRow} key={pair.moveNumber} role="listitem">
            <span className={styles.reviewMoveNumber}>{pair.moveNumber}.</span>
            <ReviewMoveButton
              activeMoveButtonRef={activeMoveButtonRef}
              activePly={displayActivePly}
              jumpToIndex={jumpToIndex}
              move={pair.white}
              ply={pair.whitePly}
              review={timelineReviews[pair.whitePly - 1] ?? null}
            />
            <ReviewMoveButton
              activeMoveButtonRef={activeMoveButtonRef}
              activePly={displayActivePly}
              jumpToIndex={jumpToIndex}
              move={pair.black}
              ply={pair.blackPly}
              review={timelineReviews[pair.blackPly - 1] ?? null}
            />
          </div>
        ))}
      </div>

      <ReviewTimelineStrip
        historyIndex={historyIndex}
        jumpToIndex={jumpToIndex}
        moveHistoryLength={moveHistoryLength}
        timelineAnalyses={timelineAnalyses}
        timelineAnalysesLength={timelineAnalysesLength}
        timelineError={timelineError}
        timelineLoading={timelineLoading}
        timelineReviews={timelineReviews}
      />
    </section>
  );
}

function ReviewMoveButton({
  activeMoveButtonRef,
  activePly,
  jumpToIndex,
  move,
  ply,
  review,
}: {
  activeMoveButtonRef: RefObject<HTMLButtonElement | null>;
  activePly: number;
  jumpToIndex: (index: number) => void;
  move: StoredMove | null;
  ply: number;
  review: TimelineReview | null;
}) {
  if (!move) {
    return <span className={styles.reviewMoveEmpty} />;
  }

  const isActive = activePly === ply;
  const dotColor = getReviewDotColor(review);

  return (
    <button
      className={`${styles.reviewMoveCell} ${isActive ? styles.activeReviewMoveCell : ''}`}
      onClick={() => jumpToIndex(ply)}
      ref={isActive ? activeMoveButtonRef : undefined}
      style={dotColor ? { ['--move-dot-color' as string]: dotColor } : undefined}
      type="button"
    >
      {dotColor ? <span className={styles.reviewMoveDot} aria-hidden="true" /> : null}
      <span>{move.san}</span>
    </button>
  );
}

function ReviewTimelineStrip({
  historyIndex,
  jumpToIndex,
  moveHistoryLength,
  timelineAnalyses,
  timelineAnalysesLength,
  timelineError,
  timelineLoading,
  timelineReviews,
}: {
  historyIndex: number;
  jumpToIndex: (index: number) => void;
  moveHistoryLength: number;
  timelineAnalyses: AnalysisResult[];
  timelineAnalysesLength: number;
  timelineError: string;
  timelineLoading: boolean;
  timelineReviews: TimelineReview[];
}) {
  const scores = timelineAnalyses.map(analysis => Math.max(-10, Math.min(10, toChartScore(analysis))));
  const pointCount = Math.max(1, scores.length);
  const cursorX = moveHistoryLength <= 1 ? 0 : ((Math.max(1, historyIndex) - 1) / Math.max(1, moveHistoryLength - 1)) * 100;
  const timelinePoints = scores.map((score, index) => {
    const x = pointCount <= 1 ? 0 : (index / (pointCount - 1)) * 100;
    const y = 14 - Math.tanh(score / 4) * 10.5;
    return { x, y };
  });
  const boundaryPath = timelinePoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const whiteAreaPath = timelinePoints.length
    ? `M 0 28 L ${timelinePoints.map(point => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' L ')} L 100 28 Z`
    : '';

  return (
    <div className={styles.reviewTimeline}>
      <div className={styles.reviewTimelineGraph}>
        <svg className={styles.reviewTimelineSvg} viewBox="0 0 100 28" preserveAspectRatio="none" aria-label="Evaluation timeline">
          <rect className={styles.reviewTimelineBlack} x="0" y="0" width="100" height="28" />
          {timelineAnalysesLength > 0 ? <path className={styles.reviewTimelineWhite} d={whiteAreaPath} /> : null}
          <line className={styles.reviewTimelineMidline} x1="0" x2="100" y1="14" y2="14" />
          {timelineAnalysesLength > 0 ? <path className={styles.reviewTimelinePath} d={boundaryPath} /> : null}
          <line className={styles.reviewTimelineCursor} x1={cursorX} x2={cursorX} y1="0" y2="28" vectorEffect="non-scaling-stroke" />
        </svg>
        {timelineReviews.map(review => {
          const dotColor = getReviewDotColor(review);

          if (!dotColor) {
            return null;
          }

          const point = timelinePoints[review.ply - 1] ?? { x: 0, y: 14 };

          return (
            <button
              aria-label={`Go to ${review.moveLabel}`}
              className={styles.reviewTimelinePoint}
              key={review.ply}
              onClick={() => jumpToIndex(review.ply)}
              style={{
                ['--timeline-point-color' as string]: dotColor,
                left: `${point.x}%`,
                top: `${(point.y / 28) * 100}%`,
              }}
              type="button"
            />
          );
        })}
      </div>
      {timelineAnalysesLength === 0 ? <div className={styles.reviewTimelineFallback}>{timelineLoading ? 'Analyzing...' : 'No review yet.'}</div> : null}
      {timelineError ? <span className={styles.reviewTimelineError}>{timelineError}</span> : null}
    </div>
  );
}

function compactCoachText(review: TimelineReview) {
  if (review.category === 'book') {
    return `${review.san} stays in book.`;
  }

  if (review.category === 'best') {
    return `${review.san} matches the engine's top move.`;
  }

  if ((review.category === 'mistake' || review.category === 'blunder' || review.category === 'inaccuracy') && review.bestMoveSan) {
    return `${review.san} is ${review.label?.toLowerCase() ?? 'imprecise'}. Best was ${review.bestMoveSan}.`;
  }

  return review.coachText;
}

function getReviewDotColor(review: TimelineReview | null) {
  if (!review?.category) {
    return null;
  }

  if (!REVIEW_DOT_CATEGORIES.has(review.category)) {
    return null;
  }

  return review.colorHex ?? '#b8f7a1';
}

const REVIEW_DOT_CATEGORIES = new Set<ReviewCategory>(['inaccuracy', 'miss', 'mistake', 'blunder']);

function formatRecentGamePlayers(game: ChessComRecentGameSummary) {
  const player = game.playerUsername ?? 'You';
  const opponent = game.opponentUsername ?? 'opponent';
  return game.playerColor === 'black' ? `${opponent} vs ${player}` : `${player} vs ${opponent}`;
}

function formatRecentGameMeta(game: ChessComRecentGameSummary) {
  const eco = game.eco ?? 'game';
  const color = game.playerColor;
  return `${eco} · ${color}`;
}

function capitalizeRecentGameTimeClass(value: 'bullet' | 'blitz' | 'rapid') {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCardLineTitle(card: DeckCard) {
  return card.lineName.includes(card.eco) ? card.lineName : `${card.eco} · ${card.lineName}`;
}

function formatLearningPrompt(card: DeckCard) {
  if (card.sourceType === 'recent_game') {
    return card.prompt;
  }

  if (card.opponentMoveSan) {
    return `Opponent just played ${card.opponentMoveSan}. Find the best reply.`;
  }

  return 'Find the best move in this position.';
}

function formatDeckCardLabel(card: DeckCard) {
  return card.kind === 'repertoire_choice' ? 'Fix your mistake' : 'Find the punishment';
}

function formatProgressChip(progress: DeckProgressEntry | null) {
  if (!progress || progress.seenCount === 0) {
    return 'new';
  }

  if (progress.ignored) {
    return 'ignored';
  }

  const due = Date.parse(progress.dueAt ?? '');

  if (!Number.isFinite(due) || due <= Date.now()) {
    return `due · ${progress.streak} streak`;
  }

  return `later · ${progress.intervalDays}d`;
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
          <h2 className={styles.sectionTitle}>Learning</h2>
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
              {deckLoading ? 'Loading' : 'Start learning'}
            </button>
          </>
        ) : (
          <p className={styles.copy}>
            {deckLoading
              ? 'Loading deck.'
              : deckLoadError
                ? 'Learning setup is broken. Recreate the canonical Supabase schema and seed cards.'
                : 'No learning cards have been seeded yet.'}
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
            <h2 className={styles.sectionTitle}>Lines</h2>
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
  activeCardProgress,
  deckCounterSan,
  deckCards,
  deckLoadError,
  deckLoading,
  deckFeedback,
  deckStats,
  nextCard,
  onNext,
  onRepeat,
  onToggleIgnore,
  startCard,
}: {
  activeCard: DeckCard | null;
  activeCardProgress: DeckProgressEntry | null;
  deckCounterSan: string | null;
  deckCards: DeckCard[];
  deckLoadError: string;
  deckLoading: boolean;
  deckFeedback: DeckFeedback | null;
  deckStats: DeckProgressSummary;
  nextCard: DeckCard | null;
  onNext: () => void;
  onRepeat: () => void;
  onToggleIgnore: () => void;
  startCard: (card: DeckCard | null) => void;
}) {
  const card = activeCard ?? nextCard;
  const cardLoaded = Boolean(activeCard && card && activeCard.id === card.id);
  const cardIgnored = activeCardProgress?.ignored ?? false;

  return (
    <>
      <section className={`${styles.card} ${styles.deckCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Learning</h2>
          <span className={styles.statusText}>{cardLoaded ? 'active' : deckLoading ? 'loading' : `${deckCards.length} cards`}</span>
        </div>
        {card ? (
          <>
            <div className={styles.deckPrompt}>
              <span className={styles.metaLabel}>
                {formatDeckCardLabel(card)} · {formatProgressChip(activeCardProgress)}
              </span>
              <strong>{formatLearningPrompt(card)}</strong>
            </div>
            {deckFeedback ? (
              <div className={`${styles.feedbackBox} ${deckFeedback.pending ? styles.feedbackPending : deckFeedback.correct ? styles.feedbackGood : styles.feedbackBad}`}>
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
                    ? `Play the move on the board. Any move within ${formatCpSwing(card.maxEvalLossCp)} of best is accepted.`
                    : 'Play the exact move on the board. The answer is strict.'
                  : 'Load the card to put its position on the board.'}
              </p>
            )}
            <div className={styles.deckActions}>
              <button className={`${styles.action} ${styles.primary}`} onClick={() => startCard(card)} disabled={cardLoaded && !deckFeedback}>
                {cardLoaded ? 'Loaded' : 'Load'}
              </button>
              <button className={styles.action} onClick={onRepeat} disabled={!activeCard}>
                Repeat
              </button>
              <button className={styles.action} onClick={onToggleIgnore} disabled={!card}>
                {cardIgnored ? 'Unignore' : 'Ignore'}
              </button>
              <button className={styles.action} onClick={onNext}>
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.empty}>{deckLoading ? 'Loading learning cards from Supabase.' : 'No learning cards loaded.'}</p>
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
            <strong>{deckStats.seen}</strong>
            <span>seen</span>
          </div>
          <div>
            <strong>{deckStats.ignored}</strong>
            <span>ignored</span>
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

function EngineLinesSection({
  currentFen,
  lines,
  positionAnalysis,
  positionLoading,
}: {
  currentFen: string;
  lines: AnalysisLine[];
  positionAnalysis: AnalysisResult | null;
  positionLoading: boolean;
}) {
  return (
    <section className={`${styles.card} ${styles.engineCard}`}>
      <div className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>Engine</h2>
        <span className={styles.statusText}>{positionLoading ? 'updating' : `depth ${positionAnalysis?.depth ?? '--'}`}</span>
      </div>
      <div className={styles.engineLines}>
        {lines.map(line => (
          <div className={styles.engineLine} key={line.multipv}>
            <div className={styles.engineLineHead}>
              <span className={styles.engineRank}>#{line.multipv}</span>
              <strong>{line.bestMove ? formatBestMove(currentFen, line.bestMove) : '--'}</strong>
              <span>{formatLineScore(line)}</span>
            </div>
            <p className={styles.enginePv}>{formatPvLine(currentFen, line.pv)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function getDisplayEngineLines(positionAnalysis: AnalysisResult | null) {
  if (!positionAnalysis || positionAnalysis.depth <= 0) {
    return [];
  }

  return (positionAnalysis.lines ?? []).filter(line => Boolean(line.bestMove) || line.pv.length > 0).slice(0, 3);
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
  if (pv.length === 0) {
    return 'No principal variation yet.';
  }

  const line = formatPrincipalVariation(fen, pv);

  if (line === 'No principal variation yet.') {
    return line;
  }

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

function renderMoveFigurine(san: string): ReactNode {
  const pieces: Record<string, string> = {
    K: '♔',
    Q: '♕',
    R: '♖',
    B: '♗',
    N: '♘',
  };

  const pieceCode = san[0] ?? '';
  const icon = pieces[pieceCode];

  if (!icon) {
    return <>{san}</>;
  }

  return (
    <>
      <span className={styles.movePieceIcon}>{icon}</span>
      <span className={styles.movePieceGap} aria-hidden="true" />
      <span className={styles.movePieceText}>{san.slice(1)}</span>
    </>
  );
}
