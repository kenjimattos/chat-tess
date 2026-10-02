import { SignJWT, jwtVerify } from 'jose';
import type { Clock } from '../../../kernel/time/clock';
import type { SessionTokens } from '../domain/ports';

const ALGORITHM = 'HS256';
const ISSUER = 'chat-tess';

export interface JwtSessionTokensOptions {
  secret: string;
  ttlSeconds: number;
  clock: Clock;
}

/** Sessão sem estado: um JWT assinado com o segredo da aplicação. */
export class JwtSessionTokens implements SessionTokens {
  private readonly key: Uint8Array;

  constructor(private readonly options: JwtSessionTokensOptions) {
    this.key = new TextEncoder().encode(options.secret);
  }

  async issue(userId: string): Promise<string> {
    const issuedAt = toEpochSeconds(this.options.clock.now());

    return new SignJWT()
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.options.ttlSeconds)
      .sign(this.key);
  }

  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        currentDate: this.options.clock.now(),
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}

function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
