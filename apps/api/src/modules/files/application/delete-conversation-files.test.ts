import { describe, expect, it } from 'vitest';
import type { ConversationDeleted } from '../../conversations/domain/conversation-events';
import { DeleteConversationFiles } from './delete-conversation-files';
import { ANA, PDF_CONTENT, PNG_CONTENT, filesTestBed } from './files-test-bed.test-support';

function conversationDeleted(
  conversationId: string,
  actorUserId: string | null,
): ConversationDeleted {
  return {
    type: 'conversation.deleted',
    occurredAt: new Date('2026-10-01T10:00:00Z'),
    actorUserId,
    payload: { conversationId },
  };
}

describe('DeleteConversationFiles', () => {
  it('apaga os arquivos da conversa apagada e preserva os das outras', async () => {
    const { upload, storage, conversations, anaConversation } = await filesTestBed();
    const otherConversation = await conversations.create(ANA, 'Outra');
    for (const content of [PDF_CONTENT, PNG_CONTENT]) {
      await upload.execute({
        userId: ANA,
        conversationId: anaConversation.id,
        fileName: 'arquivo',
        content,
      });
    }
    await upload.execute({
      userId: ANA,
      conversationId: otherConversation.id,
      fileName: 'fica.pdf',
      content: PDF_CONTENT,
    });

    await new DeleteConversationFiles(storage).execute(
      conversationDeleted(anaConversation.id, ANA),
    );

    expect([...storage.files.keys()]).toEqual([
      expect.stringContaining(`/conversations/${otherConversation.id}/`),
    ]);
  });

  it('ignora o evento sem autor', async () => {
    const { upload, storage, anaConversation } = await filesTestBed();
    await upload.execute({
      userId: ANA,
      conversationId: anaConversation.id,
      fileName: 'a.pdf',
      content: PDF_CONTENT,
    });

    await new DeleteConversationFiles(storage).execute(
      conversationDeleted(anaConversation.id, null),
    );

    expect(storage.files.size).toBe(1);
  });
});
