alter table public.training_card_progress
add column if not exists last_rating text check (last_rating in ('fail', 'hard', 'good', 'easy')),
add column if not exists stability numeric not null default 0,
add column if not exists difficulty numeric not null default 5,
add column if not exists retrievability numeric not null default 0;
