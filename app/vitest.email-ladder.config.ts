/**
 * Standalone vitest config for the email-ladder test.
 * This test is OFFLINE — it needs no running server, no globalSetup.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/email-ladder.test.ts'],
  },
});
