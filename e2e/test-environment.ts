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

/** Com a compactação a 80%, ela dispara quando o contexto passa de 1.600 tokens estimados. */
export const E2E_CONTEXT_TOKEN_LIMIT = 2000;

/** Domínio liberado na lista de permitidos: cada teste entra com um usuário próprio dele. */
export const ALLOWED_TEST_DOMAIN = '@e2e.test';

/** Rate limit de mensagens nos testes: acima do que qualquer outro spec envia por usuário. */
export const E2E_MESSAGES_PER_MINUTE = 5;

/** Recebe o papel de administrador no login (ADMIN_EMAILS). */
export const ADMIN_TEST_EMAIL = 'admin@e2e.test';

/**
 * `npm run e2e:live` roda os specs marcados com @live contra o Gemini real no
 * Vertex AI, com as credenciais locais do gcloud (ADC). Custa tokens de verdade.
 */
export const IS_LIVE = process.env.E2E_LIVE === 'true';

function liveLlmEnvironment(): Record<string, string> {
  const project = process.env.GCP_PROJECT_ID;
  if (!project) {
    throw new Error('Defina GCP_PROJECT_ID para rodar os testes @live contra o Gemini.');
  }
  return {
    LLM_MODE: 'gemini',
    GCP_PROJECT_ID: project,
    // Contexto folgado: os specs @live não testam compactação.
    CONTEXT_TOKEN_LIMIT: '100000',
  };
}

/** Variáveis de ambiente da API durante os testes. */
export const apiEnvironment: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  LOG_LEVEL: 'warn',
  DATABASE_URL: TEST_DATABASE_URL,
  PUBLIC_BASE_URL: WEB_URL,
  SESSION_SECRET: 'segredo-de-sessao-apenas-para-testes-e2e',
  // Habilita POST /api/auth/test-login: o login real do Google não é automatizável.
  AUTH_MODE: 'test',
  ALLOWED_EMAILS: ALLOWED_TEST_DOMAIN,
  ADMIN_EMAILS: ADMIN_TEST_EMAIL,
  // LLM roteirizado: respostas previsíveis, sem rede e sem custo.
  LLM_MODE: 'fake',
  FILE_STORAGE: 'local',
  LOCAL_STORAGE_DIR: 'e2e/.storage',
  // Limite baixo para que a compactação aconteça depois de poucas mensagens.
  CONTEXT_TOKEN_LIMIT: String(E2E_CONTEXT_TOKEN_LIMIT),
  COMPACTION_KEEP_RECENT_MESSAGES: '2',
  // O spec de tools faz scraping de uma página servida localmente pelo próprio teste.
  WEB_FETCH_ALLOW_PRIVATE_NETWORKS: 'true',
  RATE_LIMIT_MESSAGES_PER_MINUTE: String(E2E_MESSAGES_PER_MINUTE),
  ...(IS_LIVE && liveLlmEnvironment()),
};
