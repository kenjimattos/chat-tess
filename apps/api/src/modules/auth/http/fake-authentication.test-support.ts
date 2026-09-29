import type { RequestHandler } from 'express';
import { NotAuthenticatedError } from '../domain/auth-errors';
import type { User } from '../domain/user';

export const TEST_USER_HEADER = 'x-test-user-id';

/**
 * Substitui o middleware de autenticação nos testes de rota: o usuário vem do
 * cabeçalho `x-test-user-id`. Sem o cabeçalho, responde 401 como o real.
 */
export const fakeRequireAuthentication: RequestHandler = (request, response, next) => {
  const userId = request.header(TEST_USER_HEADER);
  if (!userId) {
    throw new NotAuthenticatedError();
  }

  const user: User = {
    id: userId,
    email: `${userId}@teste.example`,
    name: userId,
    avatarUrl: null,
    role: 'user',
  };
  response.locals.authenticatedUser = user;
  next();
};
