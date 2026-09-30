import type { Database } from '../../../shared/database/database';
import type { RateLimitCounter } from '../domain/rate-limit';

/**
 * Contadores no Postgres, somados com um upsert atômico: valem para todas as
 * instâncias da API. As janelas antigas da mesma chave são apagadas a cada
 * incremento, então a tabela guarda só as janelas recentes.
 */
export class PrismaRateLimitCounter implements RateLimitCounter {
  constructor(private readonly database: Database) {}

  async increment(key: string, windowStart: Date): Promise<number> {
    const [, [row]] = await this.database.$transaction([
      this.database.$executeRaw`
        DELETE FROM rate_limit_windows WHERE key = ${key} AND window_start < ${windowStart}`,
      this.database.$queryRaw<{ count: number }[]>`
        INSERT INTO rate_limit_windows (key, window_start, count)
        VALUES (${key}, ${windowStart}, 1)
        ON CONFLICT (key, window_start)
        DO UPDATE SET count = rate_limit_windows.count + 1
        RETURNING count`,
    ]);
    return Number(row?.count ?? 0);
  }
}
