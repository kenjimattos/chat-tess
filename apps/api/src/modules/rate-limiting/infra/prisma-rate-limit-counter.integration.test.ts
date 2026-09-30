import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../shared/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaRateLimitCounter } from './prisma-rate-limit-counter';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const counter = new PrismaRateLimitCounter(database);
const firstWindow = new Date('2026-09-30T10:00:00Z');
const nextWindow = new Date('2026-09-30T10:01:00Z');

describe('PrismaRateLimitCounter', () => {
  beforeEach(() => resetDatabase(database));
  afterAll(() => database.$disconnect());

  it('soma as requisições da janela', async () => {
    expect(await counter.increment('messages:ana', firstWindow)).toBe(1);
    expect(await counter.increment('messages:ana', firstWindow)).toBe(2);
    expect(await counter.increment('messages:bia', firstWindow)).toBe(1);
  });

  it('não perde incrementos simultâneos', async () => {
    const counts = await Promise.all(
      Array.from({ length: 10 }, () => counter.increment('messages:ana', firstWindow)),
    );

    expect(counts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('recomeça na janela seguinte e apaga as janelas antigas da chave', async () => {
    await counter.increment('messages:ana', firstWindow);

    expect(await counter.increment('messages:ana', nextWindow)).toBe(1);
    expect(await database.rateLimitWindow.count()).toBe(1);
  });
});
