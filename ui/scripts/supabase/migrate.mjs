import { readFileSync } from 'node:fs';

import pg from 'pg';

import { loadLocalEnv, requireEnv } from './env.mjs';

const { Client } = pg;

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const sql = readFileSync('supabase/migrations/0001_learning_decks.sql', 'utf8');
  const client = new Client(getPgConfig(loadLocalEnv()));

  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }

  console.log('migration applied: supabase/migrations/0001_learning_decks.sql');
}

function getPgConfig(env) {
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
