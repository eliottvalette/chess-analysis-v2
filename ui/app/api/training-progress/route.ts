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
    .select('card_id,seen_count,correct_count,miss_count,streak,ignored,last_outcome,last_seen_at')
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
      ignored: Boolean(row.ignored),
      lastOutcome: row.last_outcome === 'correct' || row.last_outcome === 'miss' ? row.last_outcome : null,
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

  const body = (await request.json().catch(() => ({}))) as { progress?: unknown };
  const progress = sanitizeProgress(body.progress);
  const rows = Object.entries(progress).map(([cardId, entry]) => ({
    profile_id: profile.id,
    card_id: cardId,
    seen_count: entry.seenCount,
    correct_count: entry.correctCount,
    miss_count: entry.missCount,
    streak: entry.streak,
    ignored: entry.ignored,
    last_outcome: entry.lastOutcome,
    last_seen_at: entry.lastSeenAt,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ saved: 0 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('training_card_progress').upsert(rows, { onConflict: 'profile_id,card_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: rows.length });
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
      ignored: Boolean(entry.ignored),
      lastOutcome: entry.lastOutcome === 'correct' || entry.lastOutcome === 'miss' ? entry.lastOutcome : null,
      lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : null,
    };
  }

  return progress;
}

function clampCount(value: unknown) {
  return Math.max(0, Math.min(1_000_000, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0));
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
