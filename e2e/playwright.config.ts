import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_PORT, WEB_URL, apiEnvironment } from './test-environment';

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],

  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      name: 'api',
      // Aplica as migrações no banco de teste e sobe a API.
      command: 'npm run db:deploy -w @chat-tess/api && npx tsx apps/api/src/main.ts',
      cwd: '..',
      url: `${API_URL}/api/health/ready`,
      env: apiEnvironment,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      name: 'web',
      command: `npm run dev -w @chat-tess/web -- --port ${WEB_PORT} --strictPort`,
      cwd: '..',
      url: WEB_URL,
      env: { API_URL },
      reuseExistingServer: false,
    },
  ],
});
