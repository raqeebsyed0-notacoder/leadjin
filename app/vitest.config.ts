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
      'tests/artisan-module3.test.ts',
      'tests/artisan-module4.test.ts',
      'tests/artisan-module5.test.ts',
      'tests/artisan-modules-unit.test.ts',
      'tests/email-ladder.test.ts',
      'tests/hunt-orchestrate.test.ts',
      'tests/places-wiring.test.ts',
      'tests/pdpl-gate.test.ts',
      'tests/brain-slot.test.ts',
      'tests/memory-tiers.test.ts',
      'tests/company-interview.test.ts',
      'tests/autopilot-loop.test.ts',
      'tests/sending-policy.test.ts',
      'tests/observability.test.ts',
    ],
  },
});
