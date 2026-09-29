import { describe, expect, it } from 'vitest';
import { ANA_ID, BIA_ID, conversationTestBed } from './conversation-test-bed.test-support';
import { ListConversations } from './list-conversations';

describe('ListConversations', () => {
  it('lista só as conversas do usuário, com a de atividade mais recente primeiro', async () => {
    const { store, clock } = conversationTestBed();
    const older = await store.create(ANA_ID, 'Mais antiga');
    clock.advanceBy(1000);
    const newer = await store.create(ANA_ID, 'Mais nova');
    await store.create(BIA_ID, 'Da Bia');
    clock.advanceBy(1000);
    await store.append(older.id, { role: 'user', parts: [{ type: 'text', text: 'oi' }] });

    const conversations = await new ListConversations(store).execute(ANA_ID);

    expect(conversations.map(({ id }) => id)).toEqual([older.id, newer.id]);
  });

  it('devolve lista vazia para quem ainda não tem conversas', async () => {
    const { store } = conversationTestBed();

    expect(await new ListConversations(store).execute(ANA_ID)).toEqual([]);
  });
});
