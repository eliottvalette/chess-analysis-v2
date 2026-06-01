'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';

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
import { getDeckCardState, type DeckCardState, type DeckProgressEntry, type DeckProgressSummary } from '@/lib/deck-progress';

type TrainSessionStats = {
  completed: number;
  hits: number;
  misses: number;
};
import type { DeckCard, DeckFeedback } from '@/lib/opening-training';
import styles from './chess-analysis-lab.module.css';

export type WorkspaceMode = 'review' | 'train';

export type TrainingDeckSummary = {
  id: string;
  name: string;
  description: string;
  ownerProfileId: string | null;
  cardCount: number;
  newCount: number;
  learningCount: number;
  dueCount: number;
  ignoredCount: number;
  isOwned: boolean;
};

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
  reviewDeckSaveStatus,
  reviewMoments,
  reviewSaveMoveSan,
  positionLoading,
  canSaveReviewCard,
  deckSummaries,
  onSaveReviewCard,
  onGoCreateDeck,
  onSelectSaveDeck,
  selectedDeckId,
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
  reviewDeckSaveStatus: string;
  reviewMoments: ReturnType<typeof filterReviewMoments>;
  reviewSaveMoveSan: string | null;
  positionLoading: boolean;
  canSaveReviewCard: boolean;
  deckSummaries: TrainingDeckSummary[];
  onSaveReviewCard: () => void;
  onGoCreateDeck: () => void;
  onSelectSaveDeck: (deckId: string) => void;
  selectedDeckId: string | null;
  setShowArrow: (value: boolean) => void;
  timelineAnalyses: AnalysisResult[];
  timelineAnalysesLength: number;
  timelineError: string;
  timelineLoading: boolean;
  timelineReviews: TimelineReview[];
  whiteReviewName: string;
}) {
  const reviewPanelProps = {
    activeReviewMoment,
    blackReviewName,
    chesscomUsername,
    goToReviewMoment,
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
    reviewDeckSaveStatus,
    reviewMoments,
    reviewSaveMoveSan,
    positionLoading,
    canSaveReviewCard,
    deckSummaries,
    onSaveReviewCard,
    onGoCreateDeck,
    onSelectSaveDeck,
    selectedDeckId,
    setShowArrow,
    timelineAnalyses,
    timelineAnalysesLength,
    timelineError,
    timelineLoading,
    timelineReviews,
    whiteReviewName,
  };

  if (!hasLoadedGame) {
    return (
      <GameReviewPanel
        {...reviewPanelProps}
        hasLoadedGame={false}
      />
    );
  }

  return (
    <div className={styles.reviewLoadedPanel}>
      <section className={styles.reviewLoadedTop}>
        <button className={`${styles.action} ${styles.fullWidthAction} ${styles.backAction}`} onClick={onBack}>
          Back
        </button>
      </section>
      <GameReviewPanel
        {...reviewPanelProps}
        hasLoadedGame={true}
      />
    </div>
  );
}

export function TrainPanel({
  activeCard,
  activeCardProgress,
  deckActionError,
  deckActionLoading,
  deckCounterSan,
  deckLoadError,
  deckLoading,
  deckSummaries,
  deckFeedback,
  deckStats,
  canDeleteCard,
  newDeckTitle,
  nextCard,
  onBack,
  onCreateDeck,
  onGenerateRecentDeck,
  onNext,
  onDeleteCard,
  onTrainDeck,
  onSelectDeck,
  onTrainAll,
  onRenameDeck,
  onDeleteDeck,
  focusCreateDeck,
  onCreateDeckFocusHandled,
  onNewDeckTitleChange,
  selectedDeckId,
  trainAllSession,
  trainSessionCardCurrent,
  trainSessionCardTotal,
  trainSessionStats,
}: {
  activeCard: DeckCard | null;
  activeCardProgress: DeckProgressEntry | null;
  deckActionError: string;
  deckActionLoading: boolean;
  deckCounterSan: string | null;
  deckLoadError: string;
  deckLoading: boolean;
  deckSummaries: TrainingDeckSummary[];
  deckFeedback: DeckFeedback | null;
  deckStats: DeckProgressSummary;
  canDeleteCard: boolean;
  newDeckTitle: string;
  nextCard: DeckCard | null;
  onBack: () => void;
  onCreateDeck: () => void;
  onGenerateRecentDeck: () => void;
  onNext: () => void;
  onDeleteCard: () => void;
  onTrainDeck: (deckId: string) => void;
  onSelectDeck: (deckId: string) => void;
  onTrainAll: () => void;
  onRenameDeck: (deckId: string, name: string) => void;
  onDeleteDeck: (deckId: string) => void;
  focusCreateDeck: boolean;
  onCreateDeckFocusHandled: () => void;
  onNewDeckTitleChange: (value: string) => void;
  selectedDeckId: string | null;
  trainAllSession: boolean;
  trainSessionCardCurrent: number;
  trainSessionCardTotal: number;
  trainSessionStats: TrainSessionStats;
}) {
  if (!activeCard) {
    return (
      <LearnPanel
        deckActionError={deckActionError}
        deckActionLoading={deckActionLoading}
        deckLoadError={deckLoadError}
        deckLoading={deckLoading}
        deckSummaries={deckSummaries}
        focusCreateDeck={focusCreateDeck}
        newDeckTitle={newDeckTitle}
        onCreateDeck={onCreateDeck}
        onCreateDeckFocusHandled={onCreateDeckFocusHandled}
        onGenerateRecentDeck={onGenerateRecentDeck}
        onNewDeckTitleChange={onNewDeckTitleChange}
        onTrainDeck={onTrainDeck}
        onSelectDeck={onSelectDeck}
        onTrainAll={onTrainAll}
        onRenameDeck={onRenameDeck}
        onDeleteDeck={onDeleteDeck}
        selectedDeckId={selectedDeckId}
      />
    );
  }

  return (
    <>
      <section className={`${styles.card} ${styles.stateHeaderCard}`}>
        <button className={`${styles.action} ${styles.backAction}`} onClick={onBack} type="button">
          Back
        </button>
        <div className={styles.stateHeaderMain}>
          <strong>
            Learning card
          </strong>
          <span className={styles.support}>
            {formatCardLineTitle(activeCard)} · {activeCard.side}
          </span>
          <span className={styles.support}>
            {formatCardProgressDetail(activeCardProgress)}
          </span>
        </div>
        <div className={styles.stateHeaderMeta}>
          <strong>{trainAllSession ? `${trainSessionCardCurrent}/${trainSessionCardTotal}` : deckStats.due}</strong>
          <span>{trainAllSession ? 'cram' : `due · new ${deckStats.new}`}</span>
        </div>
      </section>
      <DeckPanel
        activeCard={activeCard}
        activeCardProgress={activeCardProgress}
        deckCounterSan={deckCounterSan}
        deckLoadError={deckLoadError}
        deckLoading={deckLoading}
        deckFeedback={deckFeedback}
        deckStats={deckStats}
        canDeleteCard={canDeleteCard}
        deckActionLoading={deckActionLoading}
        nextCard={nextCard}
        onDeleteCard={onDeleteCard}
        onNext={onNext}
        trainAllSession={trainAllSession}
        trainSessionCardCurrent={trainSessionCardCurrent}
        trainSessionCardTotal={trainSessionCardTotal}
        trainSessionStats={trainSessionStats}
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
      <form
        className={styles.profileForm}
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          className={`${styles.inlineInput} ${styles.profileFormWide}`}
          value={username}
          onChange={event => setUsername(event.target.value)}
          autoComplete="username"
          autoCorrect="off"
          name="training_profile_username"
          placeholder="username"
          spellCheck={false}
        />
        <input
          className={`${styles.inlineInput} ${styles.profileFormWide}`}
          value={password}
          onChange={event => setPassword(event.target.value)}
          autoComplete="current-password"
          name="training_profile_password"
          placeholder="password"
          type="password"
        />
        <button className={`${styles.action} ${styles.primary} ${styles.profileFormWide}`} disabled={loading || username.trim().length < 3 || password.length < 4} type="submit">
          {loading ? 'Opening profile' : 'Open profile'}
        </button>
      </form>
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
  reviewDeckSaveStatus,
  reviewMoments,
  reviewSaveMoveSan,
  positionLoading,
  canSaveReviewCard,
  deckSummaries,
  onSaveReviewCard,
  onGoCreateDeck,
  onSelectSaveDeck,
  selectedDeckId,
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
  reviewDeckSaveStatus: string;
  reviewMoments: ReturnType<typeof filterReviewMoments>;
  reviewSaveMoveSan: string | null;
  positionLoading: boolean;
  canSaveReviewCard: boolean;
  deckSummaries: TrainingDeckSummary[];
  onSaveReviewCard: () => void;
  onGoCreateDeck: () => void;
  onSelectSaveDeck: (deckId: string) => void;
  selectedDeckId: string | null;
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
            <button
              className={`${styles.action} ${styles.inlineFormWide} ${chesscomUsername.trim() && !recentGamesLoading ? styles.confirmAction : ''}`}
              disabled={!chesscomUsername.trim() || recentGamesLoading}
              onClick={onFetchRecentGames}
              type="button"
            >
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
            className={`${styles.action} ${styles.actionBest}`}
            onClick={() => {
              setShowArrow(true);
              if (coachReview) {
                jumpToIndex(Math.max(0, coachReview.ply - 1));
              }
            }}
            disabled={!coachReview?.bestMoveSan}
            type="button"
          >
            Show Best
          </button>
          <button
            className={`${styles.action} ${styles.primary}`}
            onClick={() => goToReviewMoment(nextMomentIndex >= 0 ? nextMomentIndex : reviewMoments.length)}
            disabled={!hasNextReviewStep}
            type="button"
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

      {hasLoadedGame ? (
        <ReviewSaveDeckPanel
          canSaveReviewCard={canSaveReviewCard}
          deckSummaries={deckSummaries}
          onGoCreateDeck={onGoCreateDeck}
          onSaveReviewCard={onSaveReviewCard}
          onSelectSaveDeck={onSelectSaveDeck}
          reviewDeckSaveStatus={reviewDeckSaveStatus}
          reviewSaveMoveSan={reviewSaveMoveSan}
          positionLoading={positionLoading}
          selectedDeckId={selectedDeckId}
        />
      ) : null}
    </section>
  );
}

function ReviewSaveDeckPanel({
  canSaveReviewCard,
  deckSummaries,
  onGoCreateDeck,
  onSaveReviewCard,
  onSelectSaveDeck,
  positionLoading,
  reviewDeckSaveStatus,
  reviewSaveMoveSan,
  selectedDeckId,
}: {
  canSaveReviewCard: boolean;
  deckSummaries: TrainingDeckSummary[];
  onGoCreateDeck: () => void;
  onSaveReviewCard: () => void;
  onSelectSaveDeck: (deckId: string) => void;
  positionLoading: boolean;
  reviewDeckSaveStatus: string;
  reviewSaveMoveSan: string | null;
  selectedDeckId: string | null;
}) {
  const ownedDecks = deckSummaries.filter(deck => deck.isOwned);
  const hasOwnedDeck = ownedDecks.length > 0;
  const activeDeckId = selectedDeckId && ownedDecks.some(deck => deck.id === selectedDeckId)
    ? selectedDeckId
    : ownedDecks[0]?.id ?? '';
  const activeDeck = ownedDecks.find(deck => deck.id === activeDeckId) ?? null;
  const saveButtonLabel = reviewDeckSaveStatus === 'Saving'
    ? 'Adding'
    : reviewDeckSaveStatus === 'Saved'
      ? 'Added'
      : 'Add card';

  useEffect(() => {
    if (!hasOwnedDeck || !activeDeckId || activeDeckId === selectedDeckId) {
      return undefined;
    }

    onSelectSaveDeck(activeDeckId);

    return undefined;
  }, [activeDeckId, hasOwnedDeck, onSelectSaveDeck, selectedDeckId]);

  return (
    <section className={`${styles.card} ${styles.emptyStateCard}`}>
      <div className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>Add to deck</h2>
        <span className={styles.statusText}>
          {positionLoading ? 'analyzing' : reviewSaveMoveSan ?? 'waiting'}
        </span>
      </div>

      {positionLoading ? (
        <p className={styles.copy}>Engine is finding the best move for this position.</p>
      ) : reviewSaveMoveSan ? (
        <p className={styles.copy}>
          Create a training card where the answer is{' '}
          <span className={styles.saveMoveAnswer}>{reviewSaveMoveSan}</span>.
        </p>
      ) : (
        <p className={styles.copy}>No best move is available for this position yet.</p>
      )}

      {hasOwnedDeck ? (
        <label className={styles.labeledField}>
          <span className={styles.fieldLabel}>Target deck</span>
          <select
            className={`${styles.inlineInput} ${styles.deckSelect}`}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectSaveDeck(event.target.value)}
            value={activeDeckId}
          >
            {ownedDecks.map(deck => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className={styles.copy}>Create a personal deck in Train, then come back here to save this position.</p>
      )}

      {activeDeck ? (
        <p className={styles.support}>
          Goes into <strong>{activeDeck.name}</strong> · {activeDeck.cardCount} cards
        </p>
      ) : null}

      {hasOwnedDeck ? (
        <button
          className={`${styles.action} ${styles.primary} ${styles.fullWidthAction} ${reviewDeckSaveStatus === 'Saved' ? styles.saveAdded : ''}`}
          disabled={!canSaveReviewCard}
          onClick={onSaveReviewCard}
          type="button"
        >
          {saveButtonLabel}
        </button>
      ) : (
        <button
          className={`${styles.action} ${styles.primary} ${styles.fullWidthAction}`}
          onClick={onGoCreateDeck}
          type="button"
        >
          Create a deck
        </button>
      )}
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
  if (card.sourceType === 'recent_game' || card.sourceType === 'review') {
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

function formatCardProgressDetail(progress: DeckProgressEntry | null) {
  if (!progress || progress.seenCount === 0) {
    return 'New card · no reviews yet';
  }

  const lastOutcomeLabel =
    progress.lastOutcome === 'correct' ? 'last hit' : progress.lastOutcome === 'miss' ? 'last miss' : 'seen before';

  return `${progress.reviewCount} reviews · ${progress.streak} streak · ${formatNextReview(progress)} · ${lastOutcomeLabel}`;
}

function getProgressState(progress: DeckProgressEntry | null): DeckCardState {
  return progress ? getDeckCardState(progress) : 'new';
}

function formatStateLabel(state: DeckCardState) {
  switch (state) {
    case 'new':
      return 'New';
    case 'learning':
      return 'Learning';
    case 'due':
      return 'Due';
    case 'review':
      return 'Review';
    case 'mature':
      return 'Mature';
    case 'ignored':
      return 'Ignored';
  }
}

function formatNextReview(progress: DeckProgressEntry | null) {
  if (!progress || progress.seenCount === 0 || !progress.dueAt) {
    return 'not scheduled';
  }

  const due = Date.parse(progress.dueAt);
  const deltaMs = due - Date.now();

  if (!Number.isFinite(due) || deltaMs <= 0) {
    return 'due now';
  }

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < hour) {
    return `in ${Math.max(1, Math.round(deltaMs / minute))} min`;
  }

  if (deltaMs < day) {
    return `in ${Math.max(1, Math.round(deltaMs / hour))} h`;
  }

  return `in ${Math.max(1, Math.round(deltaMs / day))} d`;
}

function DeckLibraryItem({
  deck,
  deckActionLoading,
  deckLoading,
  isSelected,
  onDeleteDeck,
  onRenameDeck,
  onSelectDeck,
}: {
  deck: TrainingDeckSummary;
  deckActionLoading: boolean;
  deckLoading: boolean;
  isSelected: boolean;
  onDeleteDeck: (deckId: string) => void;
  onRenameDeck: (deckId: string, name: string) => void;
  onSelectDeck: (deckId: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const selectDisabled = deckLoading || deckActionLoading;

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const closeMenu = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setMenuOpen(false);
    };

    window.addEventListener('pointerdown', closeMenu);

    return () => {
      window.removeEventListener('pointerdown', closeMenu);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!renaming) {
      return undefined;
    }

    renameInputRef.current?.focus();
    renameInputRef.current?.select();

    return undefined;
  }, [renaming]);

  function startRename() {
    setMenuOpen(false);
    setRenameDraft(deck.name);
    setRenaming(true);
  }

  function cancelRename() {
    setRenaming(false);
    setRenameDraft(deck.name);
  }

  function submitRename() {
    const trimmedName = renameDraft.trim();

    if (!trimmedName) {
      cancelRename();
      return;
    }

    if (trimmedName !== deck.name) {
      onRenameDeck(deck.id, trimmedName);
    }

    setRenaming(false);
  }

  function handleDeleteDeck() {
    setMenuOpen(false);
    onDeleteDeck(deck.id);
  }

  return (
    <div className={`${styles.deckLibraryItemWrap} ${isSelected ? styles.activeDeckLibraryItemWrap : ''}`}>
      <button
        aria-current={isSelected ? 'true' : undefined}
        className={`${styles.deckLibraryItem} ${isSelected ? styles.activeDeckLibraryItem : ''}`}
        disabled={selectDisabled}
        onClick={() => onSelectDeck(deck.id)}
        type="button"
      >
        <span className={styles.deckLibraryHead}>
          {renaming ? (
            <input
              className={`${styles.inlineInput} ${styles.deckRenameInput}`}
              onBlur={submitRename}
              onChange={event => setRenameDraft(event.target.value)}
              onClick={event => event.stopPropagation()}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitRename();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              onPointerDown={event => event.stopPropagation()}
              ref={renameInputRef}
              value={renameDraft}
            />
          ) : (
            <strong>{deck.name}</strong>
          )}
          <span>{deck.cardCount} cards</span>
        </span>
        <span className={styles.deckLibraryMeta}>
          <span>{deck.newCount} new</span>
          <span>{deck.learningCount} learning</span>
          <span>{deck.dueCount} due</span>
        </span>
      </button>

      {deck.isOwned ? (
        <div className={styles.deckLibraryMenuAnchor} ref={menuRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Deck options for ${deck.name}`}
            className={styles.deckLibraryMenuButton}
            disabled={deckLoading || deckActionLoading}
            onClick={event => {
              event.stopPropagation();
              setMenuOpen(open => !open);
            }}
            type="button"
          >
            <DeckMoreIcon />
          </button>

          {menuOpen ? (
            <div className={styles.deckLibraryMenu} role="menu">
              <button className={styles.deckLibraryMenuOption} onClick={startRename} role="menuitem" type="button">
                Rename
              </button>
              <button className={`${styles.deckLibraryMenuOption} ${styles.deckLibraryMenuOptionDanger}`} onClick={handleDeleteDeck} role="menuitem" type="button">
                Delete
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DeckMoreIcon() {
  return (
    <svg className={styles.deckMenuIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function LearnPanel({
  deckActionError,
  deckActionLoading,
  deckLoadError,
  deckLoading,
  deckSummaries,
  focusCreateDeck,
  newDeckTitle,
  onCreateDeck,
  onCreateDeckFocusHandled,
  onGenerateRecentDeck,
  onNewDeckTitleChange,
  onTrainDeck,
  onSelectDeck,
  onTrainAll,
  onRenameDeck,
  onDeleteDeck,
  selectedDeckId,
}: {
  deckActionError: string;
  deckActionLoading: boolean;
  deckLoadError: string;
  deckLoading: boolean;
  deckSummaries: TrainingDeckSummary[];
  focusCreateDeck: boolean;
  newDeckTitle: string;
  onCreateDeck: () => void;
  onCreateDeckFocusHandled: () => void;
  onGenerateRecentDeck: () => void;
  onNewDeckTitleChange: (value: string) => void;
  onTrainDeck: (deckId: string) => void;
  onSelectDeck: (deckId: string) => void;
  onTrainAll: () => void;
  onRenameDeck: (deckId: string, name: string) => void;
  onDeleteDeck: (deckId: string) => void;
  selectedDeckId: string | null;
}) {
  const createDeckInputRef = useRef<HTMLInputElement | null>(null);
  const createDeckSectionRef = useRef<HTMLElement | null>(null);
  const totalCardCount = deckSummaries.reduce((total, deck) => total + deck.cardCount, 0);
  const canTrainAll = totalCardCount > 0 && !deckLoading && !deckActionLoading;
  const selectedDeck = deckSummaries.find(deck => deck.id === selectedDeckId) ?? null;
  const canStudySelected = Boolean(
    selectedDeck &&
    selectedDeck.cardCount > 0 &&
    !deckLoading &&
    !deckActionLoading,
  );

  useEffect(() => {
    if (!focusCreateDeck) {
      return undefined;
    }

    createDeckSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    createDeckInputRef.current?.focus();
    createDeckInputRef.current?.select();
    const timer = window.setTimeout(() => onCreateDeckFocusHandled(), 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [focusCreateDeck, onCreateDeckFocusHandled]);

  return (
    <>
      <section className={`${styles.card} ${styles.emptyStateCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Decks</h2>
          <span className={styles.statusText}>{deckLoading ? 'loading' : `${deckSummaries.length} decks`}</span>
        </div>
        {deckSummaries.length === 0 ? (
          <p className={styles.copy}>
            {deckLoading
              ? 'Loading decks.'
              : deckLoadError
                ? 'Learning setup is not available.'
                : 'Create a deck, then add cards from Review.'}
          </p>
        ) : (
          <div className={styles.deckLibrary}>
            {deckSummaries.map(deck => (
              <DeckLibraryItem
                deck={deck}
                deckActionLoading={deckActionLoading}
                deckLoading={deckLoading}
                isSelected={deck.id === selectedDeckId}
                key={deck.id}
                onDeleteDeck={onDeleteDeck}
                onRenameDeck={onRenameDeck}
                onSelectDeck={onSelectDeck}
              />
            ))}
          </div>
        )}
        {deckLoadError ? <p className={styles.error}>{deckLoadError}</p> : null}
        {deckSummaries.length > 0 ? (
          <div className={styles.deckLibraryActions}>
            <button
              className={`${styles.action} ${styles.primary} ${styles.fullWidthAction}`}
              disabled={!canStudySelected}
              onClick={() => selectedDeck && onTrainDeck(selectedDeck.id)}
              type="button"
            >
              {selectedDeck ? `Study ${selectedDeck.name}` : 'Study deck'}
            </button>
            <button
              className={`${styles.action} ${styles.fullWidthAction}`}
              disabled={!canTrainAll}
              onClick={onTrainAll}
              type="button"
            >
              Cram all decks
            </button>
          </div>
        ) : null}
      </section>
      <section
        className={`${styles.card} ${styles.emptyStateCard} ${focusCreateDeck ? styles.createDeckSectionFocus : ''}`}
        ref={createDeckSectionRef}
      >
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Create deck</h2>
          <span className={styles.statusText}>manual</span>
        </div>
        <div className={styles.inlineForm}>
          <input
            className={styles.inlineInput}
            onChange={event => onNewDeckTitleChange(event.target.value)}
            placeholder="Deck title"
            ref={createDeckInputRef}
            value={newDeckTitle}
          />
          <button
            className={`${styles.action} ${styles.inlineFormWide} ${newDeckTitle.trim() && !deckActionLoading ? styles.confirmAction : ''}`}
            disabled={deckActionLoading || !newDeckTitle.trim()}
            onClick={onCreateDeck}
            type="button"
          >
            Create
          </button>
        </div>
      </section>
      <button className={`${styles.action} ${styles.primary} ${styles.fullWidthAction}`} onClick={onGenerateRecentDeck} disabled={deckActionLoading}>
        {deckActionLoading ? 'Generating' : 'Generate automatic deck your last 50 games'}
      </button>
      {deckActionError ? <p className={styles.error}>{deckActionError}</p> : null}
    </>
  );
}

export function DeckPanel({
  activeCard,
  activeCardProgress,
  deckCounterSan,
  deckLoadError,
  deckLoading,
  deckFeedback,
  deckStats,
  canDeleteCard,
  deckActionLoading,
  nextCard,
  onNext,
  onDeleteCard,
  trainAllSession,
  trainSessionCardCurrent,
  trainSessionCardTotal,
  trainSessionStats,
}: {
  activeCard: DeckCard | null;
  activeCardProgress: DeckProgressEntry | null;
  deckCounterSan: string | null;
  deckLoadError: string;
  deckLoading: boolean;
  deckFeedback: DeckFeedback | null;
  deckStats: DeckProgressSummary;
  canDeleteCard: boolean;
  deckActionLoading: boolean;
  nextCard: DeckCard | null;
  onNext: () => void;
  onDeleteCard: () => void;
  trainAllSession: boolean;
  trainSessionCardCurrent: number;
  trainSessionCardTotal: number;
  trainSessionStats: TrainSessionStats;
}) {
  const card = activeCard ?? nextCard;
  const cardState = getProgressState(activeCardProgress);
  const sessionProgressPercent =
    trainSessionCardTotal > 0 ? Math.round((trainSessionCardCurrent / trainSessionCardTotal) * 100) : 0;
  const srsQueueLabel = `New ${deckStats.new} · Learning ${deckStats.learning} · Due ${deckStats.due}`;

  return (
    <>
      <section className={`${styles.card} ${styles.deckCard}`}>
        <div className={styles.panelHeader}>
          <h2 className={styles.sectionTitle}>Learning</h2>
          <span className={styles.statusText}>
            {trainAllSession ? `Cram · ${trainSessionCardCurrent}/${trainSessionCardTotal}` : srsQueueLabel}
          </span>
        </div>
        {trainAllSession ? (
          <div className={styles.trainSessionProgress} aria-label="Cram progress">
            <div className={styles.trainSessionProgressFill} style={{ width: `${sessionProgressPercent}%` }} />
          </div>
        ) : null}
        <div className={styles.trainSessionSummary}>
          <span>{trainAllSession ? 'Cram mode · SRS schedule unchanged' : `Current session · ${trainSessionStats.hits} hit · ${trainSessionStats.misses} miss`}</span>
          <span>{formatStateLabel(cardState)}</span>
        </div>
        {card ? (
          <>
            <div className={styles.deckPrompt}>
              <span className={styles.metaLabel}>
                {formatDeckCardLabel(card)} · {formatStateLabel(cardState)}
              </span>
              <strong>{formatLearningPrompt(card)}</strong>
              <p>{formatCardProgressDetail(activeCardProgress)}</p>
            </div>
            {deckFeedback ? (
              <div className={`${styles.feedbackBox} ${deckFeedback.pending ? styles.feedbackPending : deckFeedback.correct ? styles.feedbackGood : styles.feedbackBad}`}>
                <strong>
                  {deckFeedback.pending
                    ? 'Checking eval'
                    : deckFeedback.correct
                      ? 'Best move'
                      : 'Miss'}
                </strong>
                <span>
                  played {deckFeedback.playedSan} · best {deckFeedback.expectedSan}
                  {deckFeedback.evalLossCp != null ? ` · loss ${formatCpSwing(deckFeedback.evalLossCp)}` : ''}
                  {deckFeedback.maxEvalLossCp != null ? ` / ${formatCpSwing(deckFeedback.maxEvalLossCp)}` : ''}
                  {deckFeedback.scoreSwingCp != null ? ` · swing ${formatCpSwing(deckFeedback.scoreSwingCp)}` : ''}
                </span>
                {!deckFeedback.pending ? (
                  <span>{trainAllSession ? 'Cram result only · SRS unchanged' : `Next review: ${formatNextReview(activeCardProgress)}`}</span>
                ) : null}
                {!deckFeedback.pending && !deckFeedback.correct && deckCounterSan ? <span>counter {deckCounterSan}</span> : null}
              </div>
            ) : (
              <p className={styles.copy}>Play the exact best move on the board.</p>
            )}
            <div className={styles.deckActions}>
              <button className={`${styles.action} ${styles.deleteAction}`} disabled={!card || !canDeleteCard || deckActionLoading} onClick={onDeleteCard} type="button">
                Delete
              </button>
              <button className={`${styles.action} ${styles.primary}`} onClick={onNext} type="button">
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.empty}>{deckLoading ? 'Loading learning cards from Supabase.' : trainAllSession ? 'No cram cards loaded.' : 'Nothing to study right now in this deck.'}</p>
            {deckLoadError ? <p className={styles.error}>{deckLoadError}</p> : null}
          </>
        )}
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
