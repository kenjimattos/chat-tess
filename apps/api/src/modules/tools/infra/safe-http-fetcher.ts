import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { Agent, fetch, type Response } from 'undici';
import { isPublicAddress } from './network-address-policy';

export interface SafeHttpFetcherOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  /** Só para testes locais: permite acessar localhost e redes privadas. Proibido em produção. */
  allowPrivateNetworks: boolean;
}

export interface FetchedDocument {
  url: string;
  contentType: string;
  body: string;
  /** O corpo passou do limite e foi cortado. */
  truncated: boolean;
}

const READABLE_CONTENT_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];
const USER_AGENT = 'chat-tess/1.0 (assistente de IA; tool web_scrape)';

/**
 * Cliente HTTP para URLs escolhidas pelo LLM, protegido contra SSRF: o IP é
 * validado no momento da conexão (o que cobre DNS rebinding), redirecionamentos
 * são seguidos um a um e revalidados, e tempo e tamanho da resposta são limitados.
 */
export class SafeHttpFetcher {
  private readonly agent: Agent;

  constructor(private readonly options: SafeHttpFetcherOptions) {
    this.agent = new Agent({ connect: { lookup: this.createGuardedLookup() } });
  }

  async fetchDocument(url: string, signal?: AbortSignal): Promise<FetchedDocument> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let currentUrl = this.validateUrl(url);

    for (let redirect = 0; redirect <= this.options.maxRedirects; redirect++) {
      const response = await this.request(currentUrl, combinedSignal);
      const location = response.headers.get('location');

      if (isRedirect(response.status) && location) {
        await response.body?.cancel();
        currentUrl = this.validateUrl(new URL(location, currentUrl).href);
        continue;
      }
      return this.readDocument(currentUrl, response);
    }

    throw new Error(`A página redirecionou mais de ${this.options.maxRedirects} vezes.`);
  }

  private async request(url: URL, signal: AbortSignal): Promise<Response> {
    try {
      return await fetch(url, {
        dispatcher: this.agent,
        redirect: 'manual',
        signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      });
    } catch (error) {
      throw new Error(describeNetworkError(error), { cause: error });
    }
  }

  private async readDocument(url: URL, response: Response): Promise<FetchedDocument> {
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`A página respondeu com status ${response.status}.`);
    }
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!READABLE_CONTENT_TYPES.includes(contentType)) {
      await response.body?.cancel();
      throw new Error(`Conteúdo não suportado para leitura: ${contentType || 'desconhecido'}.`);
    }

    const { text, truncated } = await readLimitedText(response, this.options.maxBytes);
    return { url: url.href, contentType, body: text, truncated };
  }

  private validateUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error(`URL inválida: ${rawUrl}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Só é possível acessar endereços http ou https.');
    }
    // IPs escritos na URL não passam pela resolução de DNS: valida aqui.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (ipaddr.isValid(host) && !this.isAllowedAddress(host)) {
      throw blockedAddressError();
    }
    return url;
  }

  private isAllowedAddress(address: string): boolean {
    return this.options.allowPrivateNetworks || isPublicAddress(address);
  }

  /** Resolve o nome e recusa a conexão se algum endereço resolvido não for permitido. */
  private createGuardedLookup() {
    return (
      hostname: string,
      options: LookupOptions,
      callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void,
    ) => {
      dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) {
          callback(error, []);
          return;
        }
        if (
          addresses.length === 0 ||
          !addresses.every(({ address }) => this.isAllowedAddress(address))
        ) {
          callback(blockedAddressError(), []);
          return;
        }
        if (options.all) {
          callback(null, addresses);
        } else {
          const [first] = addresses;
          callback(null, first?.address ?? '', first?.family);
        }
      });
    };
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function blockedAddressError(): Error {
  return new Error('Acesso bloqueado: o endereço aponta para uma rede interna ou reservada.');
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'A página demorou demais para responder.';
  }
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return cause instanceof Error ? cause.message : 'Falha de rede ao acessar a página.';
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;

  for await (const chunk of response.body ?? []) {
    const bytes = chunk as Uint8Array;
    const remaining = maxBytes - totalBytes;
    if (bytes.length > remaining) {
      chunks.push(bytes.subarray(0, remaining));
      truncated = true;
      break;
    }
    chunks.push(bytes);
    totalBytes += bytes.length;
  }

  return { text: new TextDecoder().decode(Buffer.concat(chunks)), truncated };
}
