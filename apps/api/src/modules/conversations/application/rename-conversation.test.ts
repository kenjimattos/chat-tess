import { describe, expect, it } from 'vitest';
import { ConversationNotFoundError } from '../domain/conversation-errors';
import { ANA_ID, BIA_ID, START, conversationTestBed } from './conversation-test-bed.test-support';
import { RenameConversation } from './rename-conversation';

describe('RenameConversation', () => {
  it('troca o título, sem espaços nas pontas, e publica o evento', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Nova conversa');

    const renamed = await new RenameConversation(store, events, clock).execute({
      conversationId: conversation.id,
      userId: ANA_ID,
      title: '  Planejamento  ',
    });

    expect(renamed.title).toBe('Planejamento');
    expect(events.ofType('conversation.renamed')).toEqual([
      {
        type: 'conversation.renamed',
        occurredAt: START,
        actorUserId: ANA_ID,
        payload: { conversationId: conversation.id, title: 'Planejamento' },
      },
    ]);
  });

  it.each(['', '   ', 'x'.repeat(81)])('recusa o título "%s"', async (title) => {
    const { store, events, clock } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Nova conversa');

    const renaming = new RenameConversation(store, events, clock).execute({
      conversationId: conversation.id,
      userId: ANA_ID,
      title,
    });

    await expect(renaming).rejects.toMatchObject({ code: 'invalid_title' });
  });

  it('não permite renomear a conversa de outro usuário', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversationOfBia = await store.create(BIA_ID, 'Da Bia');

    const renaming = new RenameConversation(store, events, clock).execute({
      conversationId: conversationOfBia.id,
      userId: ANA_ID,
      title: 'Invadida',
    });

    await expect(renaming).rejects.toThrow(ConversationNotFoundError);
    expect((await store.findOwned(conversationOfBia.id, BIA_ID))?.title).toBe('Da Bia');
  });
});
