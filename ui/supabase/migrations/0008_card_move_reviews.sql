alter table public.deck_cards
add column if not exists move_reviews jsonb not null default '[]';
