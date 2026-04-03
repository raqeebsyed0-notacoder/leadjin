import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
    globalSetup: ['./tests/global-setup.ts'],
    include: [
      'tests/auth.test.ts',
      'tests/subscription.test.ts',
      'tests/leads.test.ts',
      'tests/enrichment.test.ts',
      'tests/credits.test.ts',
      'tests/sequences.test.ts',
      'tests/signals.test.ts',
      'tests/whatsapp.test.ts',
      'tests/wa-sequences.test.ts',
      'tests/csv-upload.test.ts',
    ],
  },
});
