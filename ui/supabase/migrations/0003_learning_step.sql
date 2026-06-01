alter table public.training_card_progress
add column if not exists learning_step integer not null default 0;
