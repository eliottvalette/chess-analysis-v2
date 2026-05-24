# Supabase Setup

Use the local scripts in this order:

```sh
npm run supabase:migrate
npm run supabase:seed
npm run supabase:seed:cards
npm run supabase:smoke
```

This repo now assumes a clean canonical schema only. There is no deprecated deck-card fallback path anymore.
If your remote Supabase project still has the old schema, reset/drop it and recreate from `0001_learning_decks.sql`.

`supabase:migrate` needs either:

- `SUPABASE_DB_URL`, or
- `SUPABASE_DB_PASSWORD` for the `postgres.<project-ref>` pooler user.

`supabase:seed` and `supabase:seed:cards` need `SUPABASE_ADMIN_KEY`.

`supabase:seed:cards` also needs the local app running because it calls `/api/analyze-position`:

```sh
npm run dev
```

Optional deep-feed tuning:

- `ANALYZE_BASE_URL=http://localhost:3000`
- `PUNISH_DEPTH=14`
- `PUNISH_MOVETIME_MS=250`
- `PUNISH_MULTIPV=3`
- `PUNISH_THRESHOLD_CP=30`
- `PUNISH_ACCEPTABLE_LOSS_CP=35`

Deck cards keep an eval-based acceptance rule:

- `validation_mode=within_eval_loss`
- `reference_eval_cp`
- `max_eval_loss_cp`

That means a card no longer has to be graded as “play the one exact move”. A move is accepted if the resulting Stockfish eval stays within the allowed loss window from the best continuation for the trainee side.
