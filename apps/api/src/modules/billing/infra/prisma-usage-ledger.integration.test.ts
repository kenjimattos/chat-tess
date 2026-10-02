import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../infra/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaUsageLedger } from './prisma-usage-ledger';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const ledger = new PrismaUsageLedger(database, 1000);

describe('PrismaUsageLedger', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDatabase(database);
    userId = (await database.user.create({ data: { email: 'ana@empresa.com', name: 'Ana' } })).id;
  });
  afterAll(() => database.$disconnect());

  const usage = (totalTokens: number, minute = 0) => ({
    userId,
    conversationId: null,
    model: 'gemini-teste',
    purpose: 'chat' as const,
    usage: { inputTokens: totalTokens - 1, outputTokens: 1, totalTokens },
    occurredAt: new Date(`2026-09-30T10:0${minute}:00Z`),
  });

  it('cria a conta com o limite padrão no primeiro acesso', async () => {
    expect(await ledger.accountOf(userId)).toEqual({ userId, tokenLimit: 1000, tokensUsed: 0 });
  });

  it('soma o consumo de chamadas simultâneas sem perder nenhuma', async () => {
    await Promise.all(Array.from({ length: 10 }, () => ledger.record(usage(7))));

    expect((await ledger.accountOf(userId)).tokensUsed).toBe(70);
  });

  it('muda o limite sem alterar o consumo', async () => {
    await ledger.record(usage(50));

    const account = await ledger.setLimit(userId, 5000);

    expect(account).toEqual({ userId, tokenLimit: 5000, tokensUsed: 50 });
  });

  it('lista as chamadas mais recentes primeiro', async () => {
    await ledger.record({ ...usage(10, 1), purpose: 'compaction' });
    await ledger.record(usage(20, 2));

    const recent = await ledger.recentUsage(userId, 10);

    expect(recent.map(({ purpose, usage: { totalTokens } }) => [purpose, totalTokens])).toEqual([
      ['chat', 20],
      ['compaction', 10],
    ]);
  });
});
