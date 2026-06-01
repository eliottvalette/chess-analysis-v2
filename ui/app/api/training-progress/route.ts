import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { DeckProgressEntry, DeckProgressMap } from '@/lib/deck-progress';
import { TRAINING_SESSION_COOKIE, hashTrainingSessionToken, parseTrainingSessionCookie } from '@/lib/training-profile';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  const profile = await getTrainingProfileFromCookie();

  if (!profile) {
    return NextResponse.json({ error: 'No training profile.' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('training_card_progress')
    .select('card_id,seen_count,correct_count,miss_count,streak,review_count,lapse_count,learning_step,ease,interval_days,ignored,last_outcome,due_at,last_seen_at')
    .eq('profile_id', profile.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const progress: DeckProgressMap = {};

  for (const row of data ?? []) {
    progress[String(row.card_id)] = {
      seenCount: Number(row.seen_count ?? 0),
      correctCount: Number(row.correct_count ?? 0),
      missCount: Number(row.miss_count ?? 0),
      streak: Number(row.streak ?? 0),
      reviewCount: Number(row.review_count ?? 0),
      lapseCount: Number(row.lapse_count ?? 0),
      learningStep: Number(row.learning_step ?? 0),
      ease: Number(row.ease ?? 2.5),
      intervalDays: Number(row.interval_days ?? 0),
      ignored: Boolean(row.ignored),
      lastOutcome: row.last_outcome === 'correct' || row.last_outcome === 'miss' ? row.last_outcome : null,
      dueAt: row.due_at ? String(row.due_at) : null,
      lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    };
  }

  return NextResponse.json({ progress });
}

export async function POST(request: Request) {
  const profile = await getTrainingProfileFromCookie();

  if (!profile) {
    return NextResponse.json({ error: 'No training profile.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { progress?: unknown; attempt?: unknown };
  const progress = sanitizeProgress(body.progress);
  const attempt = sanitizeAttempt(body.attempt);
  const rows = Object.entries(progress).map(([cardId, entry]) => ({
    profile_id: profile.id,
    card_id: cardId,
    seen_count: entry.seenCount,
    correct_count: entry.correctCount,
    miss_count: entry.missCount,
    streak: entry.streak,
    review_count: entry.reviewCount,
    lapse_count: entry.lapseCount,
    learning_step: entry.learningStep,
    ease: entry.ease,
    interval_days: entry.intervalDays,
    ignored: entry.ignored,
    last_outcome: entry.lastOutcome,
    due_at: entry.dueAt ?? new Date(0).toISOString(),
    last_seen_at: entry.lastSeenAt,
  }));

  const supabase = createAdminClient();
  let saved = 0;

  if (rows.length > 0) {
    const { error } = await supabase.from('training_card_progress').upsert(rows, { onConflict: 'profile_id,card_id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    saved = rows.length;
  }

  if (attempt) {
    const { error } = await supabase.from('training_card_attempts').insert({
      profile_id: profile.id,
      card_id: attempt.cardId,
      played_uci: attempt.playedUci,
      played_san: attempt.playedSan,
      expected_uci: attempt.expectedUci,
      expected_san: attempt.expectedSan,
      correct: attempt.correct,
      exact: attempt.exact,
      eval_loss_cp: attempt.evalLossCp,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ saved, attemptSaved: Boolean(attempt) });
}

function sanitizeProgress(value: unknown): DeckProgressMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const progress: DeckProgressMap = {};

  for (const [cardId, rawEntry] of Object.entries(value)) {
    if (!cardId || !rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      continue;
    }

    const entry = rawEntry as Partial<DeckProgressEntry>;
    progress[cardId] = {
      seenCount: clampCount(entry.seenCount),
      correctCount: clampCount(entry.correctCount),
      missCount: clampCount(entry.missCount),
      streak: clampCount(entry.streak),
      reviewCount: clampCount(entry.reviewCount),
      lapseCount: clampCount(entry.lapseCount),
      learningStep: clampCount(entry.learningStep),
      ease: clampEase(entry.ease),
      intervalDays: clampCount(entry.intervalDays),
      ignored: Boolean(entry.ignored),
      lastOutcome: entry.lastOutcome === 'correct' || entry.lastOutcome === 'miss' ? entry.lastOutcome : null,
      dueAt: typeof entry.dueAt === 'string' ? entry.dueAt : null,
      lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : null,
    };
  }

  return progress;
}

function clampCount(value: unknown) {
  return Math.max(0, Math.min(1_000_000, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0));
}

function clampEase(value: unknown) {
  return Math.max(1.3, Math.min(3.2, Number.isFinite(Number(value)) ? Number(value) : 2.5));
}

function sanitizeAttempt(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const attempt = value as Record<string, unknown>;
  const cardId = String(attempt.cardId ?? '');
  const playedUci = String(attempt.playedUci ?? '');
  const playedSan = String(attempt.playedSan ?? '');
  const expectedUci = String(attempt.expectedUci ?? '');
  const expectedSan = String(attempt.expectedSan ?? '');

  if (!cardId || !playedUci || !playedSan || !expectedUci || !expectedSan) {
    return null;
  }

  const evalLossValue = Number(attempt.evalLossCp);

  return {
    cardId,
    playedUci,
    playedSan,
    expectedUci,
    expectedSan,
    correct: Boolean(attempt.correct),
    exact: Boolean(attempt.exact),
    evalLossCp: Number.isFinite(evalLossValue) ? Math.trunc(evalLossValue) : null,
  };
}

async function getTrainingProfileFromCookie() {
  const cookieStore = await cookies();
  const parsed = parseTrainingSessionCookie(cookieStore.get(TRAINING_SESSION_COOKIE)?.value);

  if (!parsed) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('training_profiles')
    .select('id,session_token_hash')
    .eq('id', parsed.profileId)
    .maybeSingle();

  if (error || !data?.session_token_hash) {
    return null;
  }

  return hashTrainingSessionToken(parsed.token) === data.session_token_hash ? data : null;
}
