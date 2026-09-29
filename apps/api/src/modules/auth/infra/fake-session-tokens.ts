import type { SessionTokens } from '../domain/ports';

const PREFIX = 'session-of:';

/** Tokens previsíveis para testes: "session-of:<id do usuário>". */
export class FakeSessionTokens implements SessionTokens {
  async issue(userId: string): Promise<string> {
    return `${PREFIX}${userId}`;
  }

  async verify(token: string): Promise<string | null> {
    return token.startsWith(PREFIX) ? token.slice(PREFIX.length) : null;
  }
}
