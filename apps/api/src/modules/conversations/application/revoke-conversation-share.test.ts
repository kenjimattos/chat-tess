import { describe, expect, it } from 'vitest';
import { ConversationNotFoundError } from '../domain/conversation-errors';
import { ANA_ID, BIA_ID, START, conversationTestBed } from './conversation-test-bed.test-support';
import { GetConversationShare } from './get-conversation-share';
import { RevokeConversationShare } from './revoke-conversation-share';

describe('RevokeConversationShare', () => {
  it('desativa o link e publica o evento', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Viagem');
    const { token } = await store.createIfAbsent(conversation.id, 'x'.repeat(32));

    await new RevokeConversationShare(store, store, events, clock).execute(conversation.id, ANA_ID);

    expect(await store.findSharedConversation(token)).toBeNull();
    expect(events.ofType('conversation.share_revoked')).toEqual([
      {
        type: 'conversation.share_revoked',
        occurredAt: START,
        actorUserId: ANA_ID,
        payload: { conversationId: conversation.id },
      },
    ]);
  });

  it('não faz nada se a conversa não tem link', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Viagem');

    await new RevokeConversationShare(store, store, events, clock).execute(conversation.id, ANA_ID);

    expect(events.ofType('conversation.share_revoked')).toEqual([]);
  });

  it('só o dono revoga', async () => {
    const { store, events, clock } = conversationTestBed();
    const conversationOfBia = await store.create(BIA_ID, 'Privada');
    await store.createIfAbsent(conversationOfBia.id, 'x'.repeat(32));

    const revoking = new RevokeConversationShare(store, store, events, clock).execute(
      conversationOfBia.id,
      ANA_ID,
    );

    await expect(revoking).rejects.toThrow(ConversationNotFoundError);
    expect(await store.findByConversation(conversationOfBia.id)).not.toBeNull();
  });
});

describe('GetConversationShare', () => {
  it('devolve o link atual, ou null se não há', async () => {
    const { store } = conversationTestBed();
    const shared = await store.create(ANA_ID, 'Compartilhada');
    const notShared = await store.create(ANA_ID, 'Só minha');
    const share = await store.createIfAbsent(shared.id, 'x'.repeat(32));
    const getShare = new GetConversationShare(store, store);

    expect(await getShare.execute(shared.id, ANA_ID)).toEqual(share);
    expect(await getShare.execute(notShared.id, ANA_ID)).toBeNull();
  });

  it('não revela o link da conversa de outro usuário', async () => {
    const { store } = conversationTestBed();
    const conversationOfBia = await store.create(BIA_ID, 'Privada');
    await store.createIfAbsent(conversationOfBia.id, 'x'.repeat(32));

    const reading = new GetConversationShare(store, store).execute(conversationOfBia.id, ANA_ID);

    await expect(reading).rejects.toThrow(ConversationNotFoundError);
  });
});
