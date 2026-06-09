import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const uiRoot = fileURLToPath(new URL('.', import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: uiRoot,
  },
  outputFileTracingIncludes: {
    '/api/analyze-game': ['./bin/**/*'],
    '/api/analyze-position': ['./bin/**/*'],
    '/api/training-deck': [
      './scripts/chesscom/**/*',
      './scripts/supabase/env.mjs',
      './node_modules/@supabase/**/*',
      './node_modules/chess.js/**/*',
    ],
  },
};

export default nextConfig;
