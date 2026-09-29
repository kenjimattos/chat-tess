import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: 'packages/shared',
          environment: 'node',
        },
      },
      {
        test: {
          name: 'api',
          root: 'apps/api',
          environment: 'node',
        },
      },
      {
        extends: 'apps/web/vite.config.ts',
        test: {
          name: 'web',
          root: 'apps/web',
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/generated/**', '**/main.{ts,tsx}', '**/index.ts'],
      thresholds: {
        // Regras de negócio: a cobertura mínima é verificada no CI.
        'apps/api/src/modules/**/{domain,application}/**': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
