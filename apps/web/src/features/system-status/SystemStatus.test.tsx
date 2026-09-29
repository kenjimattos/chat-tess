import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemStatus } from './SystemStatus';

function stubApiResponse(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe('SystemStatus', () => {
  it('informa que a API está no ar quando a verificação de prontidão passa', async () => {
    stubApiResponse(200, { status: 'ok' });

    render(<SystemStatus />);

    expect(await screen.findByText('API e banco de dados no ar')).toBeInTheDocument();
  });

  it('informa indisponibilidade quando a verificação de prontidão falha', async () => {
    stubApiResponse(503, { status: 'unavailable' });

    render(<SystemStatus />);

    expect(await screen.findByText('API indisponível')).toBeInTheDocument();
  });
});
