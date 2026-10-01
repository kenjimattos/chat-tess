import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ana = {
  id: 'user-1',
  email: 'ana@empresa.com',
  name: 'Ana Souza',
  avatarUrl: null,
  role: 'user',
};

const DEFAULT_ROUTES: Record<string, { status: number; body?: unknown }> = {
  '/api/conversations': { status: 200, body: [] },
  '/api/usage': {
    status: 200,
    body: { tokenLimit: 1000, tokensUsed: 0, remainingTokens: 1000, recentUsage: [] },
  },
  '/api/health/ready': { status: 200, body: { status: 'ok' } },
};

/** Responde cada rota da API com o status e corpo informados. */
function stubApi(routes: Record<string, { status: number; body?: unknown }>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const route = routes[String(input)] ?? DEFAULT_ROUTES[String(input)] ?? { status: 404 };
    const hasBody = route.status !== 204;
    return new Response(hasBody ? JSON.stringify(route.body ?? {}) : null, {
      status: route.status,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('App', () => {
  it('mostra o login quando não há sessão', async () => {
    stubApi({ '/api/auth/me': { status: 401, body: { error: { code: 'not_authenticated' } } } });

    render(<App />);

    expect(await screen.findByRole('link', { name: 'Entrar com Google' })).toBeInTheDocument();
  });

  it('mostra o usuário quando há sessão', async () => {
    stubApi({ '/api/auth/me': { status: 200, body: ana } });

    render(<App />);

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
  });

  it('volta ao login ao sair', async () => {
    const fetchMock = stubApi({
      '/api/auth/me': { status: 200, body: ana },
      '/api/auth/logout': { status: 204 },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('link', { name: 'Entrar com Google' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('avisa quando a API não responde', async () => {
    stubApi({ '/api/auth/me': { status: 502 } });

    render(<App />);

    expect(await screen.findByText('Não foi possível conectar à API.')).toBeInTheDocument();
  });

  describe('link de compartilhamento', () => {
    const TOKEN = 'a'.repeat(32);

    it('mostra a conversa compartilhada sem campo de mensagem', async () => {
      window.history.replaceState(null, '', `/shared/${TOKEN}`);
      stubApi({
        '/api/auth/me': { status: 200, body: ana },
        [`/api/shared/${TOKEN}`]: {
          status: 200,
          body: {
            title: 'Receitas',
            messages: [
              {
                id: 'm1',
                sequence: 1,
                role: 'user',
                parts: [{ type: 'text', text: 'Como fazer bolo?' }],
                createdAt: '2026-09-30T10:00:00.000Z',
              },
            ],
            hasEarlierMessages: false,
          },
        },
      });

      render(<App />);

      expect(await screen.findByRole('heading', { name: 'Receitas' })).toBeInTheDocument();
      expect(screen.getByText('Como fazer bolo?')).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Mensagem' })).not.toBeInTheDocument();
    });

    it('avisa quando o link foi revogado', async () => {
      window.history.replaceState(null, '', `/shared/${TOKEN}`);
      stubApi({
        '/api/auth/me': { status: 200, body: ana },
        [`/api/shared/${TOKEN}`]: {
          status: 404,
          body: { error: { code: 'shared_conversation_not_found' } },
        },
      });

      render(<App />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Este link de compartilhamento não existe ou foi revogado.',
      );
    });
  });
});
