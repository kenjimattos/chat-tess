import { describe, expect, it } from 'vitest';
import { AttachmentNotFoundError } from '../domain/file-errors';
import { ANA, PDF_CONTENT, filesTestBed } from './files-test-bed.test-support';
import { ReadSharedAttachment } from './read-shared-attachment';

const TOKEN = 'a'.repeat(32);

async function sharedConversationWithPdf({ sent = true } = {}) {
  const bed = await filesTestBed();
  const part = await bed.upload.execute({
    userId: ANA,
    conversationId: bed.anaConversation.id,
    fileName: 'contrato.pdf',
    content: PDF_CONTENT,
  });
  if (sent) {
    await bed.attachments.linkToMessage([part.attachmentId], 'message-1');
  }
  await bed.conversations.createIfAbsent(bed.anaConversation.id, TOKEN);
  const read = new ReadSharedAttachment(bed.conversations, bed.attachments, bed.storage);
  return { ...bed, attachmentId: part.attachmentId, read };
}

describe('ReadSharedAttachment', () => {
  it('entrega o anexo de uma mensagem da conversa compartilhada', async () => {
    const { read, attachmentId } = await sharedConversationWithPdf();

    const { attachment, content } = await read.execute(TOKEN, attachmentId);

    expect(attachment.fileName).toBe('contrato.pdf');
    expect(content).toEqual(PDF_CONTENT);
  });

  it('não entrega anexo carregado e ainda não enviado', async () => {
    const { read, attachmentId } = await sharedConversationWithPdf({ sent: false });

    await expect(read.execute(TOKEN, attachmentId)).rejects.toThrow(AttachmentNotFoundError);
  });

  it('não entrega anexo de outra conversa pelo link', async () => {
    const { read, upload, attachments, biaConversation } = await sharedConversationWithPdf();
    const other = await upload.execute({
      userId: 'user-bia',
      conversationId: biaConversation.id,
      fileName: 'da-bia.pdf',
      content: PDF_CONTENT,
    });
    await attachments.linkToMessage([other.attachmentId], 'message-2');

    await expect(read.execute(TOKEN, other.attachmentId)).rejects.toThrow(AttachmentNotFoundError);
  });

  it('não entrega nada depois que o link é revogado', async () => {
    const { read, attachmentId, conversations, anaConversation } =
      await sharedConversationWithPdf();
    await conversations.revoke(anaConversation.id);

    await expect(read.execute(TOKEN, attachmentId)).rejects.toThrow(AttachmentNotFoundError);
  });
});
