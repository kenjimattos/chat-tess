import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../../kernel/time/clock';
import { JwtSessionTokens } from './jwt-session-tokens';

const SECRET = 'um-segredo-de-sessao-com-mais-de-32-caracteres';
const ONE_HOUR = 60 * 60;

function tokensAt(instant: string, secret = SECRET): JwtSessionTokens {
  return new JwtSessionTokens({ secret, ttlSeconds: ONE_HOUR, clock: fixedClock(instant) });
}

describe('JwtSessionTokens', () => {
  it('devolve o id do usuário para um token válido', async () => {
    const tokens = tokensAt('2026-09-30T10:00:00Z');

    const token = await tokens.issue('user-1');

    expect(await tokens.verify(token)).toBe('user-1');
  });

  it('recusa um token expirado', async () => {
    const token = await tokensAt('2026-09-30T10:00:00Z').issue('user-1');

    expect(await tokensAt('2026-09-30T11:00:01Z').verify(token)).toBeNull();
  });

  it('recusa um token assinado com outro segredo', async () => {
    const token = await tokensAt(
      '2026-09-30T10:00:00Z',
      'outro-segredo-de-sessao-com-32-caracteres',
    ).issue('user-1');

    expect(await tokensAt('2026-09-30T10:00:00Z').verify(token)).toBeNull();
  });

  it('recusa um token adulterado', async () => {
    const tokens = tokensAt('2026-09-30T10:00:00Z');
    const token = await tokens.issue('user-1');
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin', iss: 'chat-tess' })).toString(
      'base64url',
    );

    expect(await tokens.verify(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it('recusa um texto que não é um JWT', async () => {
    expect(await tokensAt('2026-09-30T10:00:00Z').verify('nao-sou-um-token')).toBeNull();
  });
});
