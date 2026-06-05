create table if not exists public.game_analysis_cache (
  cache_key text primary key,
  game_link text,
  pgn_hash text,
  analysis_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_analysis_cache_game_link_idx
on public.game_analysis_cache(game_link);

create index if not exists game_analysis_cache_pgn_hash_idx
on public.game_analysis_cache(pgn_hash);

alter table public.game_analysis_cache enable row level security;

drop policy if exists "Game analysis cache is readable" on public.game_analysis_cache;
create policy "Game analysis cache is readable"
on public.game_analysis_cache for select
using (true);
