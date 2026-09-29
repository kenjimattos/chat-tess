import { NotAuthenticatedError } from '../domain/auth-errors';
import type { SessionTokens, UserRepository } from '../domain/ports';
import type { User } from '../domain/user';

/** Identifica o usuário a partir do token de sessão enviado pelo navegador. */
export class GetCurrentUser {
  constructor(
    private readonly users: UserRepository,
    private readonly sessionTokens: SessionTokens,
  ) {}

  async execute(sessionToken: string | undefined): Promise<User> {
    if (!sessionToken) {
      throw new NotAuthenticatedError();
    }

    const userId = await this.sessionTokens.verify(sessionToken);
    const user = userId ? await this.users.findById(userId) : null;
    if (!user) {
      throw new NotAuthenticatedError();
    }

    return user;
  }
}
