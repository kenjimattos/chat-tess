import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleIdentityProvider } from './google-identity-provider';

const provider = new GoogleIdentityProvider({
  clientId: 'client-id.apps.googleusercontent.com',
  clientSecret: 'client-secret',
  redirectUri: 'https://chat.example.com/api/auth/google/callback',
});

/** Simula as respostas do Google sem acessar a rede. */
function stubGoogle(idToken: string | undefined, payload: Record<string, unknown> | undefined) {
  vi.spyOn(OAuth2Client.prototype, 'getToken').mockImplementation(async () => ({
    tokens: { id_token: idToken },
    res: null,
  }));
  const verifyIdToken = vi
    .spyOn(OAuth2Client.prototype, 'verifyIdToken')
    .mockImplementation(async () => ({ getPayload: () => payload }) as unknown as LoginTicket);
  return { verifyIdToken };
}

afterEach(() => vi.restoreAllMocks());

describe('GoogleIdentityProvider', () => {
  describe('buildAuthorizationUrl', () => {
    it('pede só os escopos de login e devolve o state recebido', () => {
      const url = new URL(provider.buildAuthorizationUrl('state-123'));

      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('state')).toBe('state-123');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://chat.example.com/api/auth/google/callback',
      );
    });
  });

  describe('verifyAuthorizationCode', () => {
    it('devolve a identidade de uma conta com e-mail verificado', async () => {
      const { verifyIdToken } = stubGoogle('id-token', {
        email: 'ana@empresa.com',
        email_verified: true,
        name: 'Ana Souza',
        picture: 'https://fotos.example/ana.png',
      });

      const identity = await provider.verifyAuthorizationCode('code-123');

      expect(identity).toEqual({
        email: 'ana@empresa.com',
        name: 'Ana Souza',
        avatarUrl: 'https://fotos.example/ana.png',
      });
      expect(verifyIdToken).toHaveBeenCalledWith({
        idToken: 'id-token',
        audience: 'client-id.apps.googleusercontent.com',
      });
    });

    it('usa o e-mail como nome quando a conta não tem nome', async () => {
      stubGoogle('id-token', { email: 'ana@empresa.com', email_verified: true });

      const identity = await provider.verifyAuthorizationCode('code-123');

      expect(identity).toEqual({
        email: 'ana@empresa.com',
        name: 'ana@empresa.com',
        avatarUrl: null,
      });
    });

    it('recusa uma conta com e-mail não verificado', async () => {
      stubGoogle('id-token', { email: 'ana@empresa.com', email_verified: false });

      await expect(provider.verifyAuthorizationCode('code-123')).rejects.toMatchObject({
        code: 'email_not_verified',
      });
    });

    it('recusa quando o Google não devolve o id_token', async () => {
      stubGoogle(undefined, undefined);

      await expect(provider.verifyAuthorizationCode('code-123')).rejects.toMatchObject({
        code: 'missing_id_token',
      });
    });
  });
});
