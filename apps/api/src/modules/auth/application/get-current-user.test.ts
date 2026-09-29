import { beforeEach, describe, expect, it } from 'vitest';
import { NotAuthenticatedError } from '../domain/auth-errors';
import type { User } from '../domain/user';
import { FakeSessionTokens } from '../infra/fake-session-tokens';
import { InMemoryUserRepository } from '../infra/in-memory-user-repository';
import { GetCurrentUser } from './get-current-user';

describe('GetCurrentUser', () => {
  let users: InMemoryUserRepository;
  let getCurrentUser: GetCurrentUser;
  let ana: User;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    getCurrentUser = new GetCurrentUser(users, new FakeSessionTokens());
    ana = await users.create({ email: 'ana@empresa.com', name: 'Ana', avatarUrl: null });
  });

  it('devolve o usuário dono do token de sessão', async () => {
    const user = await getCurrentUser.execute(`session-of:${ana.id}`);

    expect(user).toEqual(ana);
  });

  it('recusa quando não há token', async () => {
    await expect(getCurrentUser.execute(undefined)).rejects.toThrow(NotAuthenticatedError);
  });

  it('recusa um token inválido', async () => {
    await expect(getCurrentUser.execute('token-adulterado')).rejects.toThrow(NotAuthenticatedError);
  });

  it('recusa um token válido de um usuário que não existe mais', async () => {
    await expect(getCurrentUser.execute('session-of:usuario-removido')).rejects.toThrow(
      NotAuthenticatedError,
    );
  });
});
