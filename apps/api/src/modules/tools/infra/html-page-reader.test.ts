import { describe, expect, it } from 'vitest';
import { extractReadableContent } from './html-page-reader';

describe('extractReadableContent', () => {
  it('extrai o título e o texto, uma linha por bloco', () => {
    const content = extractReadableContent(`
      <html><head><title> Receita de bolo </title></head>
      <body><h1>Bolo de cenoura</h1><p>Rende   8 porções.</p><ul><li>3 cenouras</li><li>2 ovos</li></ul></body>
      </html>`);

    expect(content).toEqual({
      title: 'Receita de bolo',
      text: 'Bolo de cenoura\nRende 8 porções.\n3 cenouras\n2 ovos',
    });
  });

  it('prefere o conteúdo principal e descarta menus, rodapés e scripts', () => {
    const content = extractReadableContent(`
      <body>
        <nav>Início | Contato</nav>
        <main><p>Texto importante</p><script>rastreador()</script><style>p{}</style></main>
        <footer>© 2026</footer>
      </body>`);

    expect(content.text).toBe('Texto importante');
  });

  it('usa o título do Open Graph quando existe', () => {
    const content = extractReadableContent(
      '<head><title>Site</title><meta property="og:title" content="Artigo"></head><body>x</body>',
    );

    expect(content.title).toBe('Artigo');
  });
});
