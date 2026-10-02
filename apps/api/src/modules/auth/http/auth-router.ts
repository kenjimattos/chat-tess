import { randomBytes } from 'node:crypto';
import { testLoginRequestSchema, type CurrentUser, type LoginError } from '@chat-tess/shared';
import { Router, type RequestHandler, type Response } from 'express';
import type { Logger } from '../../../infra/logging/logger';
import type { GetCurrentUser } from '../application/get-current-user';
import type { SignIn } from '../application/sign-in';
import { EmailNotAllowedError } from '../domain/auth-errors';
import type { IdentityProvider } from '../domain/ports';
import type { User } from '../domain/user';
import { authenticatedUser, createRequireAuthentication } from './require-authentication';
import type { SessionCookie } from './session-cookie';

const OAUTH_STATE_COOKIE = 'chat_tess_oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type LoginMethod =
  { mode: 'google'; identityProvider: IdentityProvider; publicBaseUrl: string } | { mode: 'test' };

export interface AuthRouterOptions {
  signIn: SignIn;
  getCurrentUser: GetCurrentUser;
  sessionCookie: SessionCookie;
  loginMethod: LoginMethod;
  secureCookies: boolean;
  logger: Logger;
}

/**
 * Rotas de autenticação, sob /auth:
 * - GET  /me                  usuário da sessão atual
 * - POST /logout              encerra a sessão
 * - GET  /google, /google/callback   login com Google (modo "google")
 * - POST /test-login          login sem senha, só no modo "test"
 */
export function createAuthRouter(options: AuthRouterOptions): Router {
  const { getCurrentUser, sessionCookie, loginMethod } = options;
  const requireAuthentication = createRequireAuthentication(getCurrentUser, sessionCookie);
  const router = Router();

  router.get('/auth/me', requireAuthentication, (_request, response) => {
    response.json(toCurrentUser(authenticatedUser(response)));
  });

  router.post('/auth/logout', (_request, response) => {
    sessionCookie.clear(response);
    response.status(204).end();
  });

  if (loginMethod.mode === 'google') {
    router.get(
      '/auth/google',
      startGoogleLogin(loginMethod.identityProvider, options.secureCookies),
    );
    router.get('/auth/google/callback', finishGoogleLogin(options, loginMethod));
  } else {
    router.post('/auth/test-login', testLogin(options));
  }

  return router;
}

function startGoogleLogin(identityProvider: IdentityProvider, secure: boolean): RequestHandler {
  return (_request, response) => {
    // O state liga a volta do Google a este navegador e impede CSRF no login.
    const state = randomBytes(24).toString('base64url');

    response.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: OAUTH_STATE_TTL_MS,
    });
    response.redirect(identityProvider.buildAuthorizationUrl(state));
  };
}

function finishGoogleLogin(
  { signIn, sessionCookie, logger }: AuthRouterOptions,
  { identityProvider, publicBaseUrl }: Extract<LoginMethod, { mode: 'google' }>,
): RequestHandler {
  const redirectHome = (response: Response, error?: LoginError) =>
    response.redirect(error ? `${publicBaseUrl}/?login_error=${error}` : `${publicBaseUrl}/`);

  return async (request, response) => {
    const { code, state, error } = request.query;
    const expectedState: unknown = request.cookies?.[OAUTH_STATE_COOKIE];
    response.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth' });

    if (error) {
      redirectHome(response, 'cancelled');
      return;
    }
    if (typeof code !== 'string' || typeof state !== 'string' || state !== expectedState) {
      redirectHome(response, 'invalid_state');
      return;
    }

    try {
      const identity = await identityProvider.verifyAuthorizationCode(code);
      const { sessionToken } = await signIn.execute(identity);
      sessionCookie.write(response, sessionToken);
      redirectHome(response);
    } catch (loginError) {
      if (loginError instanceof EmailNotAllowedError) {
        redirectHome(response, 'email_not_allowed');
        return;
      }
      logger.error({ err: loginError }, 'Falha ao concluir o login com Google');
      redirectHome(response, 'login_failed');
    }
  };
}

function testLogin({ signIn, sessionCookie }: AuthRouterOptions): RequestHandler {
  return async (request, response) => {
    const { email, name } = testLoginRequestSchema.parse(request.body);

    const { user, sessionToken } = await signIn.execute({
      email,
      name: name ?? email,
      avatarUrl: null,
    });

    sessionCookie.write(response, sessionToken);
    response.json(toCurrentUser(user));
  };
}

function toCurrentUser(user: User): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}
