import { ApiError } from '@google/genai';

/** Status que indicam falha passageira do provedor: vale tentar de novo. */
const TRANSIENT_STATUSES = new Set([429, 500, 503]);

/**
 * Quantas vezes e com que espera repetir uma chamada ao provedor. A espera
 * cresce a cada tentativa e ganha uma variação aleatória, para que várias
 * requisições recusadas juntas não voltem todas no mesmo instante.
 */
export interface RetryPolicy {
  /** Espera antes de cada nova tentativa; o tamanho da lista é o número de novas tentativas. */
  delaysMs: readonly number[];
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

export const defaultRetryPolicy: RetryPolicy = {
  delaysMs: [500, 1000, 2000],
  sleep: (milliseconds, signal) => sleep(milliseconds * (1 + Math.random() * 0.25), signal),
};

/** Sem novas tentativas; para testes que tratam a primeira falha. */
export const noRetry: RetryPolicy = { delaysMs: [], sleep: async () => {} };

export function isTransientProviderError(error: unknown): boolean {
  return error instanceof ApiError && TRANSIENT_STATUSES.has(error.status);
}

/**
 * Repete `operation` enquanto ela falhar com erro passageiro. Use só na
 * abertura da chamada: repetir depois de o texto começar a chegar duplicaria a resposta.
 */
export async function retryTransient<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const delay = policy.delaysMs[attempt];
      if (delay === undefined || signal?.aborted || !isTransientProviderError(error)) {
        throw error;
      }
      await policy.sleep(delay, signal);
    }
  }
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
