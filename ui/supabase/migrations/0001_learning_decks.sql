create table if not exists public.decks (
  id text primary key,
  name text not null,
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opening_lines (
  id text primary key,
  deck_id text not null references public.decks(id) on delete cascade,
  name text not null,
  eco text not null,
  side text not null check (side in ('white', 'black')),
  moves text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_cards (
  id text primary key,
  deck_id text not null references public.decks(id) on delete cascade,
  line_id text references public.opening_lines(id) on delete set null,
  kind text not null check (kind in ('punish_mistake', 'repertoire_choice')),
  line_name text not null,
  eco text not null,
  side text not null check (side in ('white', 'black')),
  ply integer not null,
  fen text not null,
  answer_uci text not null,
  answer_san text not null,
  prompt text not null,
  context text not null,
  source_type text not null check (source_type in ('opening_seed', 'recent_game')) default 'opening_seed',
  validation_mode text not null check (validation_mode in ('strict_best', 'within_eval_loss')) default 'strict_best',
  reference_eval_cp integer,
  max_eval_loss_cp integer,
  opponent_move_uci text,
  opponent_move_san text,
  score_swing_cp integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_card_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.deck_cards(id) on delete cascade,
  seen_count integer not null default 0,
  correct_count integer not null default 0,
  miss_count integer not null default 0,
  streak integer not null default 0,
  due_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.user_card_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.deck_cards(id) on delete cascade,
  played_uci text not null,
  played_san text not null,
  expected_uci text not null,
  expected_san text not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists deck_cards_deck_id_idx on public.deck_cards(deck_id);
create index if not exists deck_cards_line_id_idx on public.deck_cards(line_id);
create index if not exists user_card_attempts_user_id_created_at_idx on public.user_card_attempts(user_id, created_at desc);

alter table public.decks enable row level security;
alter table public.opening_lines enable row level security;
alter table public.deck_cards enable row level security;
alter table public.user_card_progress enable row level security;
alter table public.user_card_attempts enable row level security;

drop policy if exists "Decks are readable" on public.decks;
create policy "Decks are readable"
on public.decks for select
using (true);

drop policy if exists "Opening lines are readable" on public.opening_lines;
create policy "Opening lines are readable"
on public.opening_lines for select
using (true);

drop policy if exists "Deck cards are readable" on public.deck_cards;
create policy "Deck cards are readable"
on public.deck_cards for select
using (true);

drop policy if exists "Users can read own progress" on public.user_card_progress;
create policy "Users can read own progress"
on public.user_card_progress for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own progress" on public.user_card_progress;
create policy "Users can insert own progress"
on public.user_card_progress for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress" on public.user_card_progress;
create policy "Users can update own progress"
on public.user_card_progress for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own attempts" on public.user_card_attempts;
create policy "Users can read own attempts"
on public.user_card_attempts for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own attempts" on public.user_card_attempts;
create policy "Users can insert own attempts"
on public.user_card_attempts for insert
with check (auth.uid() = user_id);
