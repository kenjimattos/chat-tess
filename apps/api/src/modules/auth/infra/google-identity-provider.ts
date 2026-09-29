import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../../../shared/errors/app-error';
import type { IdentityProvider } from '../domain/ports';
import type { VerifiedIdentity } from '../domain/user';

const LOGIN_SCOPES = ['openid', 'email', 'profile'];

export interface GoogleIdentityProviderOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Login com Google pelo fluxo de código de autorização, trocado no servidor. */
export class GoogleIdentityProvider implements IdentityProvider {
  private readonly client: OAuth2Client;

  constructor(private readonly options: GoogleIdentityProviderOptions) {
    this.client = new OAuth2Client(options.clientId, options.clientSecret, options.redirectUri);
  }

  buildAuthorizationUrl(state: string): string {
    return this.client.generateAuthUrl({
      scope: LOGIN_SCOPES,
      state,
      prompt: 'select_account',
    });
  }

  async verifyAuthorizationCode(code: string): Promise<VerifiedIdentity> {
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) {
      throw new AppError(
        'unauthenticated',
        'missing_id_token',
        'O Google não confirmou a identidade.',
      );
    }

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.options.clientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      throw new AppError(
        'unauthenticated',
        'email_not_verified',
        'A conta Google precisa ter um e-mail verificado.',
      );
    }

    return {
      email: payload.email,
      name: payload.name ?? payload.email,
      avatarUrl: payload.picture ?? null,
    };
  }
}
