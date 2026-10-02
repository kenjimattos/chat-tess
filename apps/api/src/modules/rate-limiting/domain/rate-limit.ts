import type { DomainEvent } from '../../../kernel/events/domain-event';
import { AppError } from '../../../kernel/errors/app-error';

/** Quantas requisições de um tipo cada usuário pode fazer por janela de tempo. */
export interface RateLimitPolicy {
  /** Identifica a política na chave do contador e na auditoria. */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Contadores por janela fixa. Precisa ser compartilhado entre as instâncias da
 * API: um contador em memória por instância multiplicaria o limite real.
 */
export interface RateLimitCounter {
  /** Soma uma requisição na janela e devolve o total dela, já com esta. */
  increment(key: string, windowStart: Date): Promise<number>;
}

/** Início da janela fixa que contém `now`. */
export function windowStartOf(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export class RateLimitExceededError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(
      'limit_exceeded',
      'rate_limited',
      `Muitas requisições em pouco tempo. Tente de novo em ${retryAfterSeconds} s.`,
      { retryAfterSeconds },
    );
  }
}

export type RateLimitExceeded = DomainEvent<
  'rate_limit.exceeded',
  { policy: string; limit: number; windowSeconds: number }
>;
