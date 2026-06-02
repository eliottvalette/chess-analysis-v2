alter table public.deck_cards
add column if not exists replay_from_start boolean not null default false;

alter table public.deck_cards
add column if not exists initial_fen text;

alter table public.deck_cards
add column if not exists setup_moves text[] not null default '{}';
