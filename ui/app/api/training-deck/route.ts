import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { TRAINING_SESSION_COOKIE, hashTrainingSessionToken, parseTrainingSessionCookie } from '@/lib/training-profile';
import { createAdminClient } from '@/utils/supabase/admin';

const DECK_CARD_SELECT =
  'id,kind,line_id,line_name,eco,side,ply,fen,answer_uci,answer_san,prompt,context,source_type,validation_mode,reference_eval_cp,max_eval_loss_cp,opponent_move_uci,opponent_move_san,score_swing_cp';

export async function GET() {
  const supabase = createAdminClient();
  const profile = await getTrainingProfileFromCookie();

  const { data: decks, error: deckError } = await fetchActiveDecks(supabase, profile?.id ?? null);
  if (deckError) {
    return NextResponse.json({ error: deckError.message }, { status: 500 });
  }

  const activeDeck = profile
    ? ((decks ?? []).find(deck => deck.owner_profile_id === profile.id) ?? decks?.[0] ?? null)
    : (decks?.[0] ?? null);

  if (!activeDeck) {
    return NextResponse.json({ deck: null, lines: [], cards: [] });
  }

  const [{ data: lines, error: linesError }, { data: cards, error: cardsError }] = await Promise.all([
    supabase.from('opening_lines').select('id,name,eco,side,moves').eq('deck_id', activeDeck.id).order('id'),
    supabase
      .from('deck_cards')
      .select(DECK_CARD_SELECT)
      .eq('deck_id', activeDeck.id)
      .lte('ply', 24)
      .order('score_swing_cp', { ascending: false, nullsFirst: false }),
  ]);

  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }

  if (cardsError) {
    return NextResponse.json({ error: cardsError.message }, { status: 500 });
  }

  return NextResponse.json({
    deck: { id: activeDeck.id, ownerProfileId: activeDeck.owner_profile_id ?? null },
    lines: lines ?? [],
    cards: cards ?? [],
  });
}

async function fetchActiveDecks(supabase: ReturnType<typeof createAdminClient>, profileId: string | null) {
  const deckQuery = supabase
    .from('decks')
    .select('id,owner_profile_id')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(10);

  const result = profileId
    ? await deckQuery.or(`owner_profile_id.eq.${profileId},owner_profile_id.is.null`)
    : await deckQuery.is('owner_profile_id', null);

  if (!result.error || !result.error.message.includes('owner_profile_id')) {
    return result;
  }

  const fallback = await supabase
    .from('decks')
    .select('id')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1);

  return {
    data: (fallback.data ?? []).map(deck => ({ ...deck, owner_profile_id: null })),
    error: fallback.error,
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
