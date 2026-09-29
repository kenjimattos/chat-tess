import { describe, expect, it } from 'vitest';
import { ConversationNotFoundError } from '../domain/conversation-errors';
import { ANA_ID, BIA_ID, START, conversationTestBed } from './conversation-test-bed.test-support';
import { DeleteConversation } from './delete-conversation';

describe('DeleteConversation', () => {
  it('apaga a conversa e as mensagens dela', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Temporária');
    await store.append(conversation.id, { role: 'user', parts: [{ type: 'text', text: 'oi' }] });

    await new DeleteConversation(store, events, clock).execute(conversation.id, ANA_ID);

    expect(await store.findOwned(conversation.id, ANA_ID)).toBeNull();
    expect(await store.listByConversation(conversation.id)).toEqual([]);
  });

  it('publica o evento de exclusão', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Temporária');

    await new DeleteConversation(store, events, clock).execute(conversation.id, ANA_ID);

    expect(events.events).toEqual([
      {
        type: 'conversation.deleted',
        occurredAt: START,
        actorUserId: ANA_ID,
        payload: { conversationId: conversation.id },
      },
    ]);
  });

  it('não permite apagar a conversa de outro usuário', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversationOfBia = await store.create(BIA_ID, 'Da Bia');

    const deleting = new DeleteConversation(store, events, clock).execute(
      conversationOfBia.id,
      ANA_ID,
    );

    await expect(deleting).rejects.toThrow(ConversationNotFoundError);
    expect(await store.findOwned(conversationOfBia.id, BIA_ID)).not.toBeNull();
    expect(events.events).toEqual([]);
  });
});
