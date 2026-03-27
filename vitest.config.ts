import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
  resolve: {
    alias: {
      '@remi/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@remi/queue': path.resolve(__dirname, 'packages/queue/src/index.ts'),
      '@remi/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
      '@remi/storage': path.resolve(__dirname, 'packages/storage/src/index.ts'),
      '@remi/jira': path.resolve(__dirname, 'packages/jira/src/index.ts'),
      '@remi/slack': path.resolve(__dirname, 'packages/slack/src/index.ts'),
      '@remi/summary-engine': path.resolve(__dirname, 'packages/summary-engine/src/index.ts'),
      '@remi/email': path.resolve(__dirname, 'packages/email/src/index.ts'),
    },
  },
});
