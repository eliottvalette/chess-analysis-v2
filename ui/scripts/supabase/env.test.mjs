import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadLocalEnv, requireAdminKey, requireEnv } from './env.mjs';

test('loadLocalEnv reads .env.local values and strips wrapping quotes', async () => {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'supabase-env-'));

  try {
    await writeFile(
      path.join(tempDir, '.env.local'),
      [
        '# comment',
        'NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co"',
        "SUPABASE_ADMIN_KEY='sb_secret_test'",
        'EMPTY_VALUE=',
      ].join('\n'),
    );

    process.chdir(tempDir);

    const env = loadLocalEnv();

    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://example.supabase.co');
    assert.equal(env.SUPABASE_ADMIN_KEY, 'sb_secret_test');
    assert.equal(env.EMPTY_VALUE, '');
  } finally {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('requireAdminKey prefers the generic admin key, then legacy fallbacks', () => {
  assert.equal(
    requireAdminKey({
      SUPABASE_ADMIN_KEY: 'admin',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SUPABASE_SECRET_KEY: 'secret',
    }),
    'admin',
  );
  assert.equal(requireAdminKey({ SUPABASE_SERVICE_ROLE_KEY: 'service-role' }), 'service-role');
  assert.equal(requireAdminKey({ SUPABASE_SECRET_KEY: 'secret' }), 'secret');
});

test('requireAdminKey and requireEnv fail with actionable messages', () => {
  assert.throws(() => requireAdminKey({}), /Missing SUPABASE_ADMIN_KEY/);
  assert.throws(() => requireEnv({}, 'NEXT_PUBLIC_SUPABASE_URL'), /Missing NEXT_PUBLIC_SUPABASE_URL/);
});
