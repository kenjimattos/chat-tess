import { describe, expect, it } from 'vitest';
import { ANA_ID, START, conversationTestBed } from './conversation-test-bed.test-support';
import { CreateConversation } from './create-conversation';

describe('CreateConversation', () => {
  it('cria a conversa com o título padrão', async () => {
    const { store, events, clock } = conversationTestBed();

    const conversation = await new CreateConversation(store, events, clock).execute(ANA_ID);

    expect(conversation).toMatchObject({ userId: ANA_ID, title: 'Nova conversa' });
    expect(await store.findOwned(conversation.id, ANA_ID)).toEqual(conversation);
  });

  it('aceita um título informado', async () => {
    const { store, events, clock } = conversationTestBed();

    const conversation = await new CreateConversation(store, events, clock).execute(
      ANA_ID,
      'Viagem',
    );

    expect(conversation.title).toBe('Viagem');
  });

  it('publica o evento de criação', async () => {
    const { store, events, clock } = conversationTestBed();

    const conversation = await new CreateConversation(store, events, clock).execute(ANA_ID);

    expect(events.events).toEqual([
      {
        type: 'conversation.created',
        occurredAt: START,
        actorUserId: ANA_ID,
        payload: { conversationId: conversation.id, title: 'Nova conversa' },
      },
    ]);
  });
});
