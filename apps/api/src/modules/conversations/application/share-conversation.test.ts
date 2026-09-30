import { describe, expect, it } from 'vitest';
import { ConversationNotFoundError } from '../domain/conversation-errors';
import { SHARE_TOKEN_PATTERN } from '../domain/conversation-share';
import { ANA_ID, BIA_ID, START, conversationTestBed } from './conversation-test-bed.test-support';
import { ShareConversation } from './share-conversation';

describe('ShareConversation', () => {
  it('gera um link com token imprevisível e publica o evento', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Viagem');

    const share = await new ShareConversation(store, store, events, clock).execute(
      conversation.id,
      ANA_ID,
    );

    expect(share).toEqual({
      conversationId: conversation.id,
      token: expect.stringMatching(SHARE_TOKEN_PATTERN),
      createdAt: START,
    });
    expect(events.ofType('conversation.shared')).toEqual([
      {
        type: 'conversation.shared',
        occurredAt: START,
        actorUserId: ANA_ID,
        payload: { conversationId: conversation.id },
      },
    ]);
  });

  it('devolve o mesmo link ao compartilhar de novo', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Viagem');
    const sharing = new ShareConversation(store, store, events, clock);

    const first = await sharing.execute(conversation.id, ANA_ID);
    const second = await sharing.execute(conversation.id, ANA_ID);

    expect(second).toEqual(first);
    expect(events.ofType('conversation.shared')).toHaveLength(1);
  });

  it('não compartilha a conversa de outro usuário', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversationOfBia = await store.create(BIA_ID, 'Privada');

    const sharing = new ShareConversation(store, store, events, clock).execute(
      conversationOfBia.id,
      ANA_ID,
    );

    await expect(sharing).rejects.toThrow(ConversationNotFoundError);
    expect(await store.findByConversation(conversationOfBia.id)).toBeNull();
  });
});
