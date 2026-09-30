import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../shared/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaActiveTurns } from './prisma-active-turns';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const activeTurns = new PrismaActiveTurns(database);
const longAgo = new Date('2000-01-01T00:00:00Z');

describe('PrismaActiveTurns', () => {
  let userId: string;
  let conversationIds: string[];

  beforeEach(async () => {
    await resetDatabase(database);
    const user = await database.user.create({ data: { email: 'ana@empresa.com', name: 'Ana' } });
    userId = user.id;
    conversationIds = await Promise.all(
      ['A', 'B', 'C'].map(
        async (title) => (await database.conversation.create({ data: { userId, title } })).id,
      ),
    );
  });
  afterAll(() => database.$disconnect());

  function reserve(conversationId: string, staleBefore = longAgo) {
    return activeTurns.tryAcquire({ userId, conversationId, maxPerUser: 2, staleBefore });
  }

  it('reserva uma conversa livre e a libera no fim do turno', async () => {
    const first = await reserve(conversationIds[0]!);
    expect(first.status).toBe('acquired');
    expect((await reserve(conversationIds[0]!)).status).toBe('conversation_busy');

    await activeTurns.release(first.status === 'acquired' ? first.turnId : '');

    expect((await reserve(conversationIds[0]!)).status).toBe('acquired');
  });

  it('aplica o limite por usuário', async () => {
    await reserve(conversationIds[0]!);
    await reserve(conversationIds[1]!);

    expect((await reserve(conversationIds[2]!)).status).toBe('user_limit_reached');
  });

  it('só deixa uma de duas reservas simultâneas da mesma conversa passar', async () => {
    const results = await Promise.all([reserve(conversationIds[0]!), reserve(conversationIds[0]!)]);

    expect(results.map(({ status }) => status).sort()).toEqual(['acquired', 'conversation_busy']);
  });

  it('não deixa reservas simultâneas passarem do limite por usuário', async () => {
    const results = await Promise.all(conversationIds.map((id) => reserve(id)));

    expect(results.filter(({ status }) => status === 'acquired')).toHaveLength(2);
  });

  it('descarta reservas abandonadas', async () => {
    await reserve(conversationIds[0]!);

    const result = await reserve(conversationIds[0]!, new Date(Date.now() + 60_000));

    expect(result.status).toBe('acquired');
  });
});
