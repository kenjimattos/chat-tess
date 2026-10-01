import { describe, expect, it } from 'vitest';
import { ConversationNotFoundError } from '../../conversations/domain/conversation-errors';
import { ANA, BIA, PDF_CONTENT, PNG_CONTENT, filesTestBed } from './files-test-bed.test-support';
import { ListPendingAttachments } from './list-pending-attachments';

describe('ListPendingAttachments', () => {
  it('lista só os anexos da conversa que ainda não foram enviados', async () => {
    const { upload, attachments, conversations, anaConversation } = await filesTestBed();
    const uploadToAna = (fileName: string, content: Buffer) =>
      upload.execute({ userId: ANA, conversationId: anaConversation.id, fileName, content });
    const sent = await uploadToAna('enviado.pdf', PDF_CONTENT);
    const pending = await uploadToAna('pendente.png', PNG_CONTENT);
    await attachments.linkToMessage([sent.attachmentId], 'message-1');

    const listed = await new ListPendingAttachments(conversations, attachments).execute(
      anaConversation.id,
      ANA,
    );

    expect(listed).toEqual([pending]);
  });

  it('não revela os anexos da conversa de outro usuário', async () => {
    const { attachments, conversations, anaConversation } = await filesTestBed();

    const listing = new ListPendingAttachments(conversations, attachments).execute(
      anaConversation.id,
      BIA,
    );

    await expect(listing).rejects.toThrow(ConversationNotFoundError);
  });
});
