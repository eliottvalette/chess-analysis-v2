alter table public.deck_cards
drop constraint if exists deck_cards_source_type_check;

alter table public.deck_cards
add constraint deck_cards_source_type_check
check (source_type in ('opening_seed', 'recent_game', 'review'));
