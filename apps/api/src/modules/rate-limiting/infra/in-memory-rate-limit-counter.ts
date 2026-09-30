import type { RateLimitCounter } from '../domain/rate-limit';

/** Dublê em memória de `RateLimitCounter` para testes. */
export class InMemoryRateLimitCounter implements RateLimitCounter {
  private readonly counts = new Map<string, number>();

  async increment(key: string, windowStart: Date): Promise<number> {
    const windowKey = `${key}@${windowStart.toISOString()}`;
    const count = (this.counts.get(windowKey) ?? 0) + 1;
    this.counts.set(windowKey, count);
    return count;
  }
}
