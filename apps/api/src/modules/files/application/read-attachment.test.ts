import { describe, expect, it } from 'vitest';
import { AttachmentNotFoundError } from '../domain/file-errors';
import { ANA, BIA, PDF_CONTENT, filesTestBed } from './files-test-bed.test-support';
import { ReadAttachment } from './read-attachment';

describe('ReadAttachment', () => {
  it('devolve o arquivo ao dono', async () => {
    const { upload, attachments, storage, anaConversation } = await filesTestBed();
    const part = await upload.execute({
      userId: ANA,
      conversationId: anaConversation.id,
      fileName: 'contrato.pdf',
      content: PDF_CONTENT,
    });

    const { attachment, content } = await new ReadAttachment(attachments, storage).execute(
      part.attachmentId,
      ANA,
    );

    expect(attachment.fileName).toBe('contrato.pdf');
    expect(content).toEqual(PDF_CONTENT);
  });

  it('não entrega o arquivo de outro usuário', async () => {
    const { upload, attachments, storage, anaConversation } = await filesTestBed();
    const part = await upload.execute({
      userId: ANA,
      conversationId: anaConversation.id,
      fileName: 'contrato.pdf',
      content: PDF_CONTENT,
    });

    const reading = new ReadAttachment(attachments, storage).execute(part.attachmentId, BIA);

    await expect(reading).rejects.toThrow(AttachmentNotFoundError);
  });
});
