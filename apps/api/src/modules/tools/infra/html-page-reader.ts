import * as cheerio from 'cheerio';
import type { PageReader, ReadablePage } from '../domain/ports';
import type { SafeHttpFetcher } from './safe-http-fetcher';

/** Elementos que não fazem parte do conteúdo legível da página. */
const NON_CONTENT_SELECTOR =
  'script, style, noscript, template, svg, canvas, iframe, form, nav, footer, aside, [aria-hidden="true"]';

/** Elementos após os quais o texto quebra a linha. */
const BLOCK_SELECTOR =
  'p, div, section, article, li, tr, br, h1, h2, h3, h4, h5, h6, pre, blockquote';

/** Lê uma página pública e extrai o título e o texto principal. */
export class HtmlPageReader implements PageReader {
  constructor(private readonly fetcher: SafeHttpFetcher) {}

  async read(url: string, signal?: AbortSignal): Promise<ReadablePage> {
    const document = await this.fetcher.fetchDocument(url, signal);
    if (document.contentType === 'text/plain') {
      return { url: document.url, title: '', text: normalizeWhitespace(document.body) };
    }
    return { url: document.url, ...extractReadableContent(document.body) };
  }
}

export function extractReadableContent(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() || $('title').first().text().trim();

  $(NON_CONTENT_SELECTOR).remove();
  $(BLOCK_SELECTOR).after('\n');
  const mainContent = $('main, article').first();
  const text = (mainContent.length ? mainContent : $('body')).text();

  return { title, text: normalizeWhitespace(text) };
}

function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
