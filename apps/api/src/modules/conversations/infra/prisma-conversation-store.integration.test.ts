import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../shared/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaConversationRepository } from './prisma-conversation-repository';
import { PrismaMessageRepository } from './prisma-message-repository';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const conversations = new PrismaConversationRepository(database);
const messages = new PrismaMessageRepository(database);

async function createUser(email: string): Promise<string> {
  const user = await database.user.create({ data: { email, name: email } });
  return user.id;
}

describe('repositórios Prisma de conversas e mensagens', () => {
  let anaId: string;
  let biaId: string;

  beforeEach(async () => {
    await resetDatabase(database);
    anaId = await createUser('ana@empresa.com');
    biaId = await createUser('bia@empresa.com');
  });
  afterAll(() => database.$disconnect());

  it('cria e encontra a conversa só para o dono', async () => {
    const conversation = await conversations.create(anaId, 'Dúvidas');

    expect(await conversations.findOwned(conversation.id, anaId)).toEqual(conversation);
    expect(await conversations.findOwned(conversation.id, biaId)).toBeNull();
  });

  it('lista as conversas do dono pela atividade mais recente', async () => {
    const older = await conversations.create(anaId, 'Antiga');
    const newer = await conversations.create(anaId, 'Nova');
    await conversations.create(biaId, 'Da Bia');
    await messages.append(older.id, { role: 'user', parts: [{ type: 'text', text: 'oi' }] });

    const listed = await conversations.listOwned(anaId);

    expect(listed.map(({ id }) => id)).toEqual([older.id, newer.id]);
  });

  it('grava as mensagens em sequência e preserva as partes', async () => {
    const conversation = await conversations.create(anaId, 'Dúvidas');
    const parts = [
      { type: 'text' as const, text: 'Veja o anexo' },
      {
        type: 'attachment' as const,
        attachmentId: 'att-1',
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      },
    ];

    await messages.append(conversation.id, { role: 'user', parts });
    await messages.append(conversation.id, {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Recebido' }],
    });

    const listed = await messages.listByConversation(conversation.id);
    expect(listed.map(({ sequence, role }) => [sequence, role])).toEqual([
      [1, 'user'],
      [2, 'assistant'],
    ]);
    expect(listed[0]?.parts).toEqual(parts);
  });

  it('lista só as mensagens posteriores a uma sequência', async () => {
    const conversation = await conversations.create(anaId, 'Longa');
    for (const text of ['primeira', 'segunda', 'terceira']) {
      await messages.append(conversation.id, { role: 'user', parts: [{ type: 'text', text }] });
    }

    const listed = await messages.listByConversation(conversation.id, 1);

    expect(listed.map(({ sequence }) => sequence)).toEqual([2, 3]);
  });

  it('pagina das mensagens mais recentes para as mais antigas, filtrando por papel', async () => {
    const conversation = await conversations.create(anaId, 'Longa');
    for (const role of ['user', 'assistant', 'tool', 'assistant', 'user'] as const) {
      await messages.append(conversation.id, { role, parts: [{ type: 'text', text: role }] });
    }

    const latest = await messages.listPage(conversation.id, { limit: 2 });
    const earlier = await messages.listPage(conversation.id, { beforeSequence: 4, limit: 5 });
    const withoutTools = await messages.listPage(conversation.id, {
      beforeSequence: 5,
      limit: 2,
      roles: ['user', 'assistant'],
    });

    expect(latest.messages.map(({ sequence }) => sequence)).toEqual([4, 5]);
    expect(latest.hasEarlier).toBe(true);
    expect(earlier.messages.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    expect(earlier.hasEarlier).toBe(false);
    expect(withoutTools.messages.map(({ sequence }) => sequence)).toEqual([2, 4]);
    expect(withoutTools.hasEarlier).toBe(true);
  });

  it('não repete a sequência em gravações simultâneas', async () => {
    const conversation = await conversations.create(anaId, 'Concorrência');

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        messages.append(conversation.id, {
          role: 'user',
          parts: [{ type: 'text', text: `mensagem ${index}` }],
        }),
      ),
    );

    const sequences = (await messages.listByConversation(conversation.id)).map((m) => m.sequence);
    expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('renomeia a conversa', async () => {
    const conversation = await conversations.create(anaId, 'Nova conversa');

    const renamed = await conversations.rename(conversation.id, 'Planejamento');

    expect(renamed.title).toBe('Planejamento');
  });

  it('apaga a conversa junto com as mensagens', async () => {
    const conversation = await conversations.create(anaId, 'Temporária');
    await messages.append(conversation.id, { role: 'user', parts: [{ type: 'text', text: 'oi' }] });

    await conversations.delete(conversation.id);

    expect(await conversations.findOwned(conversation.id, anaId)).toBeNull();
    expect(await messages.listByConversation(conversation.id)).toEqual([]);
  });
});
