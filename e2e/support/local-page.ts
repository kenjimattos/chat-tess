import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Serve uma página HTML local para a tool web_scrape ler durante o teste. */
export async function servePage(html: string): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/receita` };
}
