import type { IdentityProvider } from '../domain/ports';
import type { VerifiedIdentity } from '../domain/user';

/** Provedor de identidade para testes: cada código aceito corresponde a uma identidade. */
export class FakeIdentityProvider implements IdentityProvider {
  private readonly identitiesByCode = new Map<string, VerifiedIdentity>();

  acceptCode(code: string, identity: VerifiedIdentity): void {
    this.identitiesByCode.set(code, identity);
  }

  buildAuthorizationUrl(state: string): string {
    return `https://identity.example/authorize?state=${state}`;
  }

  async verifyAuthorizationCode(code: string): Promise<VerifiedIdentity> {
    const identity = this.identitiesByCode.get(code);
    if (!identity) {
      throw new Error(`Código de autorização desconhecido: ${code}`);
    }
    return identity;
  }
}
