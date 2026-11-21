import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Synthesizing the stack takes a few seconds; bundling the handlers longer.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
