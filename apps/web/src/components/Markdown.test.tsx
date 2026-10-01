import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('formata o texto e abre os links em outra aba', () => {
    render(<Markdown>{'Veja a **receita** em [bolo](https://example.com/bolo).'}</Markdown>);

    expect(screen.getByText('receita').tagName).toBe('STRONG');
    const link = screen.getByRole('link', { name: 'bolo' });
    expect(link).toHaveAttribute('href', 'https://example.com/bolo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('mostra a imagem como link, sem carregá-la', () => {
    render(<Markdown>{'![gráfico](https://atacante.example/pixel.png?d=segredo)'}</Markdown>);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'gráfico' })).toHaveAttribute(
      'href',
      'https://atacante.example/pixel.png?d=segredo',
    );
  });

  it('usa o endereço como texto do link quando a imagem não tem descrição', () => {
    render(<Markdown>{'![](https://example.com/foto.png)'}</Markdown>);

    expect(screen.getByRole('link', { name: 'https://example.com/foto.png' })).toBeVisible();
  });

  it('não interpreta HTML bruto', () => {
    render(<Markdown>{'<img src="https://atacante.example/pixel.png" alt="x">'}</Markdown>);

    expect(screen.queryByRole('img')).toBeNull();
  });
});
