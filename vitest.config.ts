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
          exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
        },
      },
      {
        // Testes contra um Postgres real (docker compose ou serviço do CI).
        test: {
          name: 'api-integration',
          root: 'apps/api',
          environment: 'node',
          include: ['src/**/*.integration.test.ts'],
          globalSetup: ['src/test/prepare-integration-database.ts'],
          // Os arquivos compartilham o mesmo banco, então rodam um de cada vez.
          fileParallelism: false,
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
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.test-support.ts',
        '**/generated/**',
        '**/main.{ts,tsx}',
        '**/index.ts',
      ],
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
