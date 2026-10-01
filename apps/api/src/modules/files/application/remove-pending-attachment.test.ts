import { describe, expect, it } from 'vitest';
import { AttachmentAlreadySentError, AttachmentNotFoundError } from '../domain/file-errors';
import { ANA, BIA, PDF_CONTENT, filesTestBed } from './files-test-bed.test-support';
import { RemovePendingAttachment } from './remove-pending-attachment';

/** Ana com um PDF já enviado à API, ainda fora de qualquer mensagem. */
async function pendingAttachmentOfAna() {
  const bed = await filesTestBed();
  const part = await bed.upload.execute({
    userId: ANA,
    conversationId: bed.anaConversation.id,
    fileName: 'rascunho.pdf',
    content: PDF_CONTENT,
  });
  return {
    ...bed,
    part,
    remove: new RemovePendingAttachment(bed.attachments, bed.storage, bed.events, bed.clock),
  };
}

describe('RemovePendingAttachment', () => {
  it('apaga o registro e o arquivo do anexo ainda não enviado', async () => {
    const { remove, part, attachments, storage } = await pendingAttachmentOfAna();

    await remove.execute(part.attachmentId, ANA);

    expect(await attachments.findById(part.attachmentId)).toBeNull();
    expect(storage.files.size).toBe(0);
  });

  it('registra a remoção', async () => {
    const { remove, part, events, anaConversation } = await pendingAttachmentOfAna();

    await remove.execute(part.attachmentId, ANA);

    expect(events.ofType('attachment.removed')).toEqual([
      expect.objectContaining({
        actorUserId: ANA,
        payload: {
          attachmentId: part.attachmentId,
          conversationId: anaConversation.id,
          fileName: 'rascunho.pdf',
        },
      }),
    ]);
  });

  it('não remove o anexo que já foi enviado em uma mensagem', async () => {
    const { remove, part, attachments, storage } = await pendingAttachmentOfAna();
    await attachments.linkToMessage([part.attachmentId], 'message-1');

    await expect(remove.execute(part.attachmentId, ANA)).rejects.toThrow(
      AttachmentAlreadySentError,
    );
    expect(storage.files.size).toBe(1);
  });

  it('não remove o anexo de outro usuário', async () => {
    const { remove, part, storage } = await pendingAttachmentOfAna();

    await expect(remove.execute(part.attachmentId, BIA)).rejects.toThrow(AttachmentNotFoundError);
    expect(storage.files.size).toBe(1);
  });

  it('informa quando o anexo não existe', async () => {
    const { remove } = await pendingAttachmentOfAna();

    await expect(remove.execute('inexistente', ANA)).rejects.toThrow(AttachmentNotFoundError);
  });
});
