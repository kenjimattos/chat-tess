import type { RequestHandler, Response } from 'express';
import type { GetCurrentUser } from '../application/get-current-user';
import type { User } from '../domain/user';
import type { SessionCookie } from './session-cookie';

/**
 * Middleware das rotas protegidas: identifica o usuário pela sessão ou
 * responde 401. Os handlers seguintes obtêm o usuário com `authenticatedUser`.
 */
export function createRequireAuthentication(
  getCurrentUser: GetCurrentUser,
  sessionCookie: SessionCookie,
): RequestHandler {
  return async (request, response, next) => {
    response.locals.authenticatedUser = await getCurrentUser.execute(sessionCookie.read(request));
    next();
  };
}

export function authenticatedUser(response: Response): User {
  const user = response.locals.authenticatedUser as User | undefined;
  if (!user) {
    throw new Error('Rota protegida montada sem o middleware requireAuthentication.');
  }
  return user;
}
