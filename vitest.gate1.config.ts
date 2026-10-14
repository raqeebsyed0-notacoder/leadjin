/**
 * vitest.gate1.config.ts
 * Standalone config for the Gate-1 integration test.
 * No global-setup (no live server needed — test uses in-memory DB + stubbed WATHQ).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    include: [
      'tests/hunt-orchestrate.test.ts',
    ],
  },
});
