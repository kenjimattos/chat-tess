import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../shared/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaConversationMemory } from './prisma-conversation-memory';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const memory = new PrismaConversationMemory(database);

describe('PrismaConversationMemory', () => {
  let conversationId: string;

  beforeEach(async () => {
    await resetDatabase(database);
    const user = await database.user.create({ data: { email: 'ana@empresa.com', name: 'Ana' } });
    const conversation = await database.conversation.create({
      data: { userId: user.id, title: 'Longa' },
    });
    conversationId = conversation.id;
  });
  afterAll(() => database.$disconnect());

  it('começa sem resumo e sem contexto registrado', async () => {
    expect(await memory.load(conversationId)).toEqual({ summary: null, lastContextTokens: 0 });
  });

  it('guarda o tamanho do contexto da última chamada', async () => {
    await memory.recordContextTokens(conversationId, 1500);
    await memory.recordContextTokens(conversationId, 2300);

    expect((await memory.load(conversationId)).lastContextTokens).toBe(2300);
  });

  it('devolve o resumo que cobre mais mensagens', async () => {
    await memory.saveSummary(conversationId, {
      content: 'primeiro',
      coversUntilSequence: 4,
      summarizedMessageCount: 4,
    });
    await memory.saveSummary(conversationId, {
      content: 'segundo',
      coversUntilSequence: 10,
      summarizedMessageCount: 10,
    });

    expect((await memory.load(conversationId)).summary).toEqual({
      content: 'segundo',
      coversUntilSequence: 10,
      summarizedMessageCount: 10,
    });
  });
});
