alter table public.training_card_progress
add column if not exists mastery_score integer not null default 0,
add column if not exists last_response_ms integer;
