import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, requestJson } from './http-client';

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('requestJson', () => {
  it('chama a rota sob /api e devolve o corpo', async () => {
    const fetchMock = stubFetch(200, { status: 'ok' });

    const body = await requestJson('/health');

    expect(body).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.any(Object));
  });

  it('lança ApiError com o código e a mensagem devolvidos pela API', async () => {
    stubFetch(404, {
      error: { code: 'conversation_not_found', message: 'Conversa não encontrada.' },
    });

    const failure = await requestJson('/conversations/1').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 404,
      code: 'conversation_not_found',
      message: 'Conversa não encontrada.',
    });
  });

  it('usa uma mensagem genérica quando a resposta de erro não é JSON', async () => {
    stubFetch(502, '<html>Bad Gateway</html>');

    const failure = await requestJson('/health').catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 502, code: 'unknown_error' });
  });
});
