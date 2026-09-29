import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

function visit(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  visit('');
});

describe('LoginPage', () => {
  it('leva ao login com Google', () => {
    render(<LoginPage />);

    expect(screen.getByRole('link', { name: 'Entrar com Google' })).toHaveAttribute(
      'href',
      '/api/auth/google',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explica quando o e-mail não tem permissão', () => {
    visit('?login_error=email_not_allowed');

    render(<LoginPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Este e-mail não tem permissão para acessar a aplicação.',
    );
  });

  it('ignora um código de erro desconhecido', () => {
    visit('?login_error=<script>');

    render(<LoginPage />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
