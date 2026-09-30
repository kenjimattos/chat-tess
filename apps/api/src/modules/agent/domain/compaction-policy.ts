import type { Message } from '../../conversations/domain/conversation';

/** Aproximação usada antes de saber a contagem real: ~4 caracteres por token. */
const CHARACTERS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}

export interface CompactionThreshold {
  contextTokenLimit: number;
  /** Fração do limite que dispara a compactação, entre 0 e 1. */
  thresholdRatio: number;
}

/**
 * Decide se o histórico precisa ser compactado antes do próximo turno: o
 * contexto do último turno mais a nova mensagem chegam perto do limite?
 */
export function shouldCompact(
  lastContextTokens: number,
  incomingText: string,
  { contextTokenLimit, thresholdRatio }: CompactionThreshold,
): boolean {
  const projectedTokens = lastContextTokens + estimateTokens(incomingText);
  return projectedTokens >= contextTokenLimit * thresholdRatio;
}

/**
 * Escolhe quantas das mensagens mais antigas serão resumidas, mantendo as
 * `keepRecent` mais novas. O corte sempre cai no início de um turno (uma
 * mensagem do usuário), para nunca separar uma chamada de tool do resultado.
 * Devolve 0 quando não há o que resumir.
 */
export function countMessagesToSummarize(messages: readonly Message[], keepRecent: number): number {
  for (let cut = messages.length - keepRecent; cut > 0; cut--) {
    if (messages[cut]?.role === 'user') {
      return cut;
    }
  }
  return 0;
}
