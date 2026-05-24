# Supabase Setup

Use the local scripts in this order:

```sh
npm run supabase:migrate
npm run supabase:seed
npm run supabase:seed:cards
npm run supabase:smoke
```

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
