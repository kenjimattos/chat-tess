import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SafeHttpFetcher } from './safe-http-fetcher';

/** Servidor local com rotas que simulam páginas e comportamentos da internet. */
function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    switch (request.url) {
      case '/pagina':
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<html><title>Olá</title><body>conteúdo</body></html>');
        return;
      case '/redireciona':
        response.writeHead(302, { location: '/pagina' });
        response.end();
        return;
      case '/laco':
        response.writeHead(302, { location: '/laco' });
        response.end();
        return;
      case '/grande':
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('x'.repeat(10_000));
        return;
      case '/imagem':
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end('png');
        return;
      case '/erro':
        response.writeHead(500, { 'content-type': 'text/html' });
        response.end('falhou');
        return;
      case '/lenta':
        setTimeout(() => response.end('tarde demais'), 2000);
        return;
      default:
        response.writeHead(404);
        response.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

const options = { timeoutMs: 500, maxBytes: 1000, maxRedirects: 3 };

describe('SafeHttpFetcher', () => {
  let server: Server;
  let baseUrl: string;
  let localhostUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await startTestServer());
    localhostUrl = baseUrl.replace('127.0.0.1', 'localhost');
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  describe('proteção contra SSRF', () => {
    const fetcher = new SafeHttpFetcher({ ...options, allowPrivateNetworks: false });

    it.each([
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://169.254.169.254/computeMetadata/v1/',
      'http://10.0.0.1/',
      'http://[::ffff:127.0.0.1]/',
    ])('recusa o IP interno na URL: %s', async (url) => {
      await expect(fetcher.fetchDocument(url)).rejects.toThrow(/rede interna/);
    });

    it('recusa um nome que resolve para endereço interno', async () => {
      await expect(fetcher.fetchDocument(`${localhostUrl}/pagina`)).rejects.toThrow(/rede interna/);
    });

    it.each(['file:///etc/passwd', 'ftp://exemplo.com/', 'gopher://exemplo.com/'])(
      'recusa o protocolo de %s',
      async (url) => {
        await expect(fetcher.fetchDocument(url)).rejects.toThrow(/http ou https/);
      },
    );

    it('recusa texto que não é URL', async () => {
      await expect(fetcher.fetchDocument('não é uma url')).rejects.toThrow(/URL inválida/);
    });
  });

  describe('leitura da página (rede local liberada, como nos testes)', () => {
    const fetcher = new SafeHttpFetcher({ ...options, allowPrivateNetworks: true });

    it('devolve o conteúdo e o tipo', async () => {
      const document = await fetcher.fetchDocument(`${baseUrl}/pagina`);

      expect(document).toEqual({
        url: `${baseUrl}/pagina`,
        contentType: 'text/html',
        body: '<html><title>Olá</title><body>conteúdo</body></html>',
        truncated: false,
      });
    });

    it('segue redirecionamentos e informa o endereço final', async () => {
      const document = await fetcher.fetchDocument(`${baseUrl}/redireciona`);

      expect(document.url).toBe(`${baseUrl}/pagina`);
    });

    it('interrompe laços de redirecionamento', async () => {
      await expect(fetcher.fetchDocument(`${baseUrl}/laco`)).rejects.toThrow(
        /redirecionou mais de 3/,
      );
    });

    it('corta respostas maiores que o limite', async () => {
      const document = await fetcher.fetchDocument(`${baseUrl}/grande`);

      expect(document.body).toHaveLength(1000);
      expect(document.truncated).toBe(true);
    });

    it('recusa conteúdo que não é texto', async () => {
      await expect(fetcher.fetchDocument(`${baseUrl}/imagem`)).rejects.toThrow(/não suportado/);
    });

    it('informa o status de erro da página', async () => {
      await expect(fetcher.fetchDocument(`${baseUrl}/erro`)).rejects.toThrow(/status 500/);
    });

    it('desiste de páginas lentas demais', async () => {
      await expect(fetcher.fetchDocument(`${baseUrl}/lenta`)).rejects.toThrow(/demorou demais/);
    });
  });
});
