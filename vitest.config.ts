import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // Migration suites each start a PostgreSQL WASM instance; bound resource contention.
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
});
