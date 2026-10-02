import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../infra/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaConversationRepository } from './prisma-conversation-repository';
import { PrismaConversationShareRepository } from './prisma-conversation-share-repository';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const conversations = new PrismaConversationRepository(database);
const shares = new PrismaConversationShareRepository(database);

const TOKEN = 'a'.repeat(32);

describe('PrismaConversationShareRepository', () => {
  let conversationId: string;

  beforeEach(async () => {
    await resetDatabase(database);
    const user = await database.user.create({ data: { email: 'ana@empresa.com', name: 'Ana' } });
    conversationId = (await conversations.create(user.id, 'Receitas')).id;
  });
  afterAll(() => database.$disconnect());

  it('grava o link e encontra a conversa pelo token', async () => {
    const share = await shares.createIfAbsent(conversationId, TOKEN);

    expect(share).toMatchObject({ conversationId, token: TOKEN });
    expect(await shares.findByConversation(conversationId)).toEqual(share);
    expect(await shares.findSharedConversation(TOKEN)).toMatchObject({
      id: conversationId,
      title: 'Receitas',
    });
  });

  it('mantém o link existente quando outro token chega depois', async () => {
    await shares.createIfAbsent(conversationId, TOKEN);

    const second = await shares.createIfAbsent(conversationId, 'b'.repeat(32));

    expect(second.token).toBe(TOKEN);
  });

  it('pedidos simultâneos terminam com um único link', async () => {
    const results = await Promise.all(
      ['c', 'd', 'e'].map((letter) => shares.createIfAbsent(conversationId, letter.repeat(32))),
    );

    expect(new Set(results.map(({ token }) => token)).size).toBe(1);
  });

  it('revogar apaga o link', async () => {
    await shares.createIfAbsent(conversationId, TOKEN);

    await shares.revoke(conversationId);

    expect(await shares.findByConversation(conversationId)).toBeNull();
    expect(await shares.findSharedConversation(TOKEN)).toBeNull();
  });

  it('apagar a conversa apaga o link', async () => {
    await shares.createIfAbsent(conversationId, TOKEN);

    await conversations.delete(conversationId);

    expect(await shares.findSharedConversation(TOKEN)).toBeNull();
  });
});
