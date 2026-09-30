import { describe, expect, it } from 'vitest';
import { InvalidAttachmentError } from '../domain/file-errors';
import { ANA, BIA, PDF_CONTENT, PNG_CONTENT, filesTestBed } from './files-test-bed.test-support';
import { StoredAttachmentCatalog } from './stored-attachment-catalog';

describe('StoredAttachmentCatalog', () => {
  async function scenario(options: { readableByModel?: boolean } = {}) {
    const bed = await filesTestBed(options);
    const pdf = await bed.upload.execute({
      userId: ANA,
      conversationId: bed.anaConversation.id,
      fileName: 'contrato.pdf',
      content: PDF_CONTENT,
    });
    const catalog = new StoredAttachmentCatalog(bed.attachments, bed.storage);
    const owner = { userId: ANA, conversationId: bed.anaConversation.id };
    return { ...bed, pdf, catalog, owner };
  }

  it('devolve os anexos pendentes do dono, na ordem pedida, sem repetição', async () => {
    const { upload, catalog, owner, pdf } = await scenario();
    const png = await upload.execute({ ...owner, fileName: 'foto.png', content: PNG_CONTENT });

    const parts = await catalog.findPendingForMessage(
      [png.attachmentId, pdf.attachmentId, png.attachmentId],
      owner,
    );

    expect(parts).toEqual([png, pdf]);
  });

  it('recusa anexo já usado em outra mensagem', async () => {
    const { catalog, owner, pdf } = await scenario();
    await catalog.attachToMessage([pdf.attachmentId], 'message-1');

    await expect(catalog.findPendingForMessage([pdf.attachmentId], owner)).rejects.toThrow(
      InvalidAttachmentError,
    );
  });

  it('recusa anexo de outro usuário ou de outra conversa', async () => {
    const { catalog, owner, pdf, biaConversation } = await scenario();

    await expect(
      catalog.findPendingForMessage([pdf.attachmentId], { ...owner, userId: BIA }),
    ).rejects.toThrow(InvalidAttachmentError);
    await expect(
      catalog.findPendingForMessage([pdf.attachmentId], {
        ...owner,
        conversationId: biaConversation.id,
      }),
    ).rejects.toThrow(InvalidAttachmentError);
  });

  it('recusa anexo inexistente', async () => {
    const { catalog, owner } = await scenario();

    await expect(catalog.findPendingForMessage(['nao-existe'], owner)).rejects.toThrow(
      InvalidAttachmentError,
    );
  });

  it('envia o conteúdo embutido quando o LLM não lê o armazenamento', async () => {
    const { catalog, pdf } = await scenario({ readableByModel: false });

    const sources = await catalog.resolveSources([pdf.attachmentId]);

    expect(sources.get(pdf.attachmentId)).toEqual({
      kind: 'inline',
      base64Data: PDF_CONTENT.toString('base64'),
    });
  });

  it('envia o endereço quando o LLM lê o armazenamento', async () => {
    const { catalog, pdf } = await scenario({ readableByModel: true });

    const sources = await catalog.resolveSources([pdf.attachmentId]);

    expect(sources.get(pdf.attachmentId)).toEqual({
      kind: 'uri',
      uri: expect.stringMatching(/^memory:\/\/users\/user-ana\//),
    });
  });
});
