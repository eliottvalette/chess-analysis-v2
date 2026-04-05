import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const uiRoot = fileURLToPath(new URL('.', import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ['stockfish.wasm'],
  turbopack: {
    root: uiRoot,
  },
};

export default nextConfig;
