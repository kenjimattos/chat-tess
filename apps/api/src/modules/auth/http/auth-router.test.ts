import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import { RecordingEventPublisher } from '../../../shared/events/recording-event-publisher';
import { silentLogger } from '../../../shared/logging/logger';
import { fixedClock } from '../../../shared/time/clock';
import { GetCurrentUser } from '../application/get-current-user';
import { SignIn } from '../application/sign-in';
import { FakeIdentityProvider } from '../infra/fake-identity-provider';
import { FakeSessionTokens } from '../infra/fake-session-tokens';
import { InMemoryAllowedEmailRepository } from '../infra/in-memory-allowed-email-repository';
import { InMemoryUserRepository } from '../infra/in-memory-user-repository';
import { createAuthRouter, type LoginMethod } from './auth-router';
import { SessionCookie } from './session-cookie';

const PUBLIC_BASE_URL = 'https://chat.example.com';
const ana = { email: 'ana@empresa.com', name: 'Ana Souza', avatarUrl: null };

function buildApp(loginMethod: LoginMethod) {
  const users = new InMemoryUserRepository();
  const sessionTokens = new FakeSessionTokens();
  const sessionCookie = new SessionCookie({ secure: false, ttlSeconds: 3600 });
  const authRouter = createAuthRouter({
    signIn: new SignIn(
      users,
      new InMemoryAllowedEmailRepository(['ana@empresa.com']),
      sessionTokens,
      new RecordingEventPublisher(),
      fixedClock('2026-09-30T10:00:00Z'),
    ),
    getCurrentUser: new GetCurrentUser(users, sessionTokens),
    sessionCookie,
    loginMethod,
    secureCookies: false,
    logger: silentLogger,
  });

  return createApp({ logger: silentLogger, apiRouters: [authRouter], readinessChecks: {} });
}

function cookieNamed(response: request.Response, name: string): string | undefined {
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

describe('rotas de sessão', () => {
  it('GET /api/auth/me responde 401 sem sessão', async () => {
    const response = await request(buildApp({ mode: 'test' })).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('not_authenticated');
  });

  it('POST /api/auth/logout encerra a sessão', async () => {
    const agent = request.agent(buildApp({ mode: 'test' }));
    await agent.post('/api/auth/test-login').send({ email: ana.email });

    const logout = await agent.post('/api/auth/logout');
    const me = await agent.get('/api/auth/me');

    expect(logout.status).toBe(204);
    expect(me.status).toBe(401);
  });
});

describe('login de teste (modo "test")', () => {
  it('abre a sessão para um e-mail permitido', async () => {
    const agent = request.agent(buildApp({ mode: 'test' }));

    const login = await agent
      .post('/api/auth/test-login')
      .send({ email: ana.email, name: ana.name });
    const me = await agent.get('/api/auth/me');

    expect(login.status).toBe(200);
    expect(cookieNamed(login, 'chat_tess_session')).toMatch(/HttpOnly/);
    expect(me.body).toEqual({
      id: expect.any(String),
      email: 'ana@empresa.com',
      name: 'Ana Souza',
      avatarUrl: null,
      role: 'user',
    });
  });

  it('recusa um e-mail fora da lista de permitidos', async () => {
    const response = await request(buildApp({ mode: 'test' }))
      .post('/api/auth/test-login')
      .send({ email: 'intruso@outro.com' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('email_not_allowed');
    expect(cookieNamed(response, 'chat_tess_session')).toBeUndefined();
  });

  it('recusa um e-mail inválido', async () => {
    const response = await request(buildApp({ mode: 'test' }))
      .post('/api/auth/test-login')
      .send({ email: 'nao-e-email' });

    expect(response.status).toBe(400);
  });

  it('não expõe as rotas do Google', async () => {
    const response = await request(buildApp({ mode: 'test' })).get('/api/auth/google');

    expect(response.status).toBe(404);
  });
});

describe('login com Google (modo "google")', () => {
  let identityProvider: FakeIdentityProvider;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(() => {
    identityProvider = new FakeIdentityProvider();
    agent = request.agent(
      buildApp({ mode: 'google', identityProvider, publicBaseUrl: PUBLIC_BASE_URL }),
    );
  });

  /** Inicia o login e devolve o state que o Google devolveria na volta. */
  async function startLogin(): Promise<string> {
    const response = await agent.get('/api/auth/google');
    const location = new URL(response.headers.location ?? '');
    return location.searchParams.get('state') ?? '';
  }

  it('redireciona para o provedor com um state guardado em cookie', async () => {
    const response = await agent.get('/api/auth/google');

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/^https:\/\/identity\.example\/authorize\?state=.+/);
    expect(cookieNamed(response, 'chat_tess_oauth_state')).toMatch(/HttpOnly/);
  });

  it('abre a sessão e volta para a aplicação quando o login é concluído', async () => {
    identityProvider.acceptCode('code-ana', ana);
    const state = await startLogin();

    const callback = await agent.get(`/api/auth/google/callback?code=code-ana&state=${state}`);
    const me = await agent.get('/api/auth/me');

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe(`${PUBLIC_BASE_URL}/`);
    expect(me.body.email).toBe('ana@empresa.com');
  });

  it('recusa a volta com um state diferente do guardado', async () => {
    identityProvider.acceptCode('code-ana', ana);
    await startLogin();

    const callback = await agent.get('/api/auth/google/callback?code=code-ana&state=forjado');

    expect(callback.headers.location).toBe(`${PUBLIC_BASE_URL}/?login_error=invalid_state`);
    expect(cookieNamed(callback, 'chat_tess_session')).toBeUndefined();
  });

  it('recusa a volta sem ter iniciado o login neste navegador', async () => {
    identityProvider.acceptCode('code-ana', ana);

    const callback = await agent.get('/api/auth/google/callback?code=code-ana&state=qualquer');

    expect(callback.headers.location).toBe(`${PUBLIC_BASE_URL}/?login_error=invalid_state`);
  });

  it('informa quando o usuário cancela no Google', async () => {
    const state = await startLogin();

    const callback = await agent.get(
      `/api/auth/google/callback?error=access_denied&state=${state}`,
    );

    expect(callback.headers.location).toBe(`${PUBLIC_BASE_URL}/?login_error=cancelled`);
  });

  it('informa quando o e-mail não está na lista de permitidos', async () => {
    identityProvider.acceptCode('code-intruso', { ...ana, email: 'intruso@outro.com' });
    const state = await startLogin();

    const callback = await agent.get(`/api/auth/google/callback?code=code-intruso&state=${state}`);

    expect(callback.headers.location).toBe(`${PUBLIC_BASE_URL}/?login_error=email_not_allowed`);
    expect(cookieNamed(callback, 'chat_tess_session')).toBeUndefined();
  });

  it('informa falha genérica quando o provedor rejeita o código', async () => {
    const state = await startLogin();

    const callback = await agent.get(`/api/auth/google/callback?code=invalido&state=${state}`);

    expect(callback.headers.location).toBe(`${PUBLIC_BASE_URL}/?login_error=login_failed`);
  });

  it('não permite reutilizar o state depois da volta', async () => {
    identityProvider.acceptCode('code-ana', ana);
    const state = await startLogin();
    await agent.get(`/api/auth/google/callback?code=code-ana&state=${state}`);

    const replay = await agent.get(`/api/auth/google/callback?code=code-ana&state=${state}`);

    expect(replay.headers.location).toBe(`${PUBLIC_BASE_URL}/?login_error=invalid_state`);
  });

  it('não expõe o login de teste', async () => {
    const response = await agent.post('/api/auth/test-login').send({ email: ana.email });

    expect(response.status).toBe(404);
  });
});
