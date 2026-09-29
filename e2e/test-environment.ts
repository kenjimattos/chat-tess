/**
 * Ambiente isolado dos testes ponta a ponta: portas e banco próprios, para que
 * a suíte possa rodar com o ambiente de desenvolvimento aberto.
 */
export const API_PORT = 3100;
export const WEB_PORT = 5273;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

export const TEST_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://chat_tess:chat_tess@localhost:5433/chat_tess_test';

/** Variáveis de ambiente da API durante os testes. */
export const apiEnvironment: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  LOG_LEVEL: 'warn',
  DATABASE_URL: TEST_DATABASE_URL,
};
