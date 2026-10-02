import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface LocalPage {
  server: Server;
  url: string;
  /** Caminho e query de cada requisição recebida, na ordem em que chegaram. */
  requests: string[];
}

/**
 * Serve uma página HTML local para a tool web_scrape ler durante o teste.
 * Com uma função, o HTML é montado a partir do endereço da própria página.
 */
export async function servePage(html: string | ((url: string) => string)): Promise<LocalPage> {
  const requests: string[] = [];
  const page = { url: '' };
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(typeof html === 'string' ? html : html(page.url));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  page.url = `http://127.0.0.1:${port}/receita`;
  return { server, url: page.url, requests };
}
