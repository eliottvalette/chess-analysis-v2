import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import pg from 'pg';

import { loadLocalEnv, requireEnv } from './env.mjs';

const { Client } = pg;
const RESET_DECK_SCHEMA_SQL = `
drop table if exists public.user_card_attempts cascade;
drop table if exists public.user_card_progress cascade;
drop table if exists public.deck_cards cascade;
drop table if exists public.opening_lines cascade;
drop table if exists public.decks cascade;
`;

export async function main() {
  const sql = buildCanonicalResetSql(readFileSync('supabase/migrations/0001_learning_decks.sql', 'utf8'));
  const client = new Client(getPgConfig(loadLocalEnv()));

  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }

  console.log('canonical deck schema recreated from: supabase/migrations/0001_learning_decks.sql');
}

export function buildCanonicalResetSql(schemaSql) {
  return `${RESET_DECK_SCHEMA_SQL}\n${schemaSql}`;
}

export function getPgConfig(env) {
  const password = env.SUPABASE_DB_PASSWORD?.trim();
  const supabaseUrl = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const ref = new URL(supabaseUrl).hostname.split('.')[0];

  if (password) {
    return {
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 6543,
      user: `postgres.${ref}`,
      database: 'postgres',
      password,
      ssl: {
        rejectUnauthorized: false,
      },
    };
  }

  const connectionString = env.SUPABASE_DB_URL?.trim();

  if (connectionString) {
    const supabaseUrl = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    const url = new URL(connectionString);

    if (url.hostname.includes('pooler.supabase.com') && url.username === 'postgres') {
      url.username = `postgres.${ref}`;
    }

    return {
      connectionString: url.toString(),
      ssl: {
        rejectUnauthorized: false,
      },
    };
  }

  requireEnv(env, 'SUPABASE_DB_PASSWORD');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
