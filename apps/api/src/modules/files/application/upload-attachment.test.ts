import { MAX_ATTACHMENTS_PER_MESSAGE } from '@chat-tess/shared';
import { describe, expect, it } from 'vitest';
import { ConversationNotFoundError } from '../../conversations/domain/conversation-errors';
import {
  ANA,
  BIA,
  MAX_PENDING_BYTES_PER_USER,
  MAX_SIZE_BYTES,
  PDF_CONTENT,
  PNG_CONTENT,
  filesTestBed,
} from './files-test-bed.test-support';

describe('UploadAttachment', () => {
  it('guarda o arquivo e devolve o anexo pendente', async () => {
    const { upload, storage, attachments, anaConversation } = await filesTestBed();

    const part = await upload.execute({
      userId: ANA,
      conversationId: anaConversation.id,
      fileName: 'contrato.pdf',
      content: PDF_CONTENT,
    });

    expect(part).toEqual({
      type: 'attachment',
      attachmentId: expect.any(String),
      fileName: 'contrato.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF_CONTENT.length,
    });
    const stored = await attachments.findById(part.attachmentId);
    expect(stored).toMatchObject({
      userId: ANA,
      conversationId: anaConversation.id,
      messageId: null,
    });
    expect(await storage.read(stored?.storageUri ?? '')).toEqual(PDF_CONTENT);
  });

  it('usa o tipo detectado no conteúdo, e não o nome do arquivo', async () => {
    const { upload, anaConversation } = await filesTestBed();

    const part = await upload.execute({
      userId: ANA,
      conversationId: anaConversation.id,
      fileName: 'foto.pdf',
      content: PNG_CONTENT,
    });

    expect(part.mimeType).toBe('image/png');
  });

  it('limpa o nome do arquivo', async () => {
    const { upload, anaConversation } = await filesTestBed();

    const part = await upload.execute({
      userId: ANA,
      conversationId: anaConversation.id,
      fileName: '../../segredo.pdf',
      content: PDF_CONTENT,
    });

    expect(part.fileName).toBe('segredo.pdf');
  });

  it('publica o evento de upload', async () => {
    const { upload, events, anaConversation } = await filesTestBed();

    const part = await upload.execute({
      userId: ANA,
      conversationId: anaConversation.id,
      fileName: 'contrato.pdf',
      content: PDF_CONTENT,
    });

    expect(events.ofType('attachment.uploaded')[0]).toMatchObject({
      actorUserId: ANA,
      payload: { attachmentId: part.attachmentId, mimeType: 'application/pdf' },
    });
  });

  it.each([
    ['vazio', Buffer.alloc(0), 'empty_file'],
    ['grande demais', Buffer.concat([PDF_CONTENT, Buffer.alloc(MAX_SIZE_BYTES)]), 'file_too_large'],
    ['de tipo não suportado', Buffer.from('<html></html>'), 'unsupported_file_type'],
  ])('recusa arquivo %s', async (_description, content, code) => {
    const { upload, storage, anaConversation } = await filesTestBed();

    const uploading = upload.execute({
      userId: ANA,
      conversationId: anaConversation.id,
      fileName: 'arquivo',
      content,
    });

    await expect(uploading).rejects.toMatchObject({ code });
    expect(storage.files.size).toBe(0);
  });

  it('recusa enviar para a conversa de outro usuário', async () => {
    const { upload, storage, biaConversation } = await filesTestBed();

    const uploading = upload.execute({
      userId: ANA,
      conversationId: biaConversation.id,
      fileName: 'contrato.pdf',
      content: PDF_CONTENT,
    });

    await expect(uploading).rejects.toThrow(ConversationNotFoundError);
    expect(storage.files.size).toBe(0);
  });

  describe('com a conversa cheia de anexos por enviar', () => {
    async function conversationFullOfPendingAttachments() {
      const bed = await filesTestBed();
      for (let index = 1; index <= MAX_ATTACHMENTS_PER_MESSAGE; index++) {
        await bed.upload.execute({
          userId: ANA,
          conversationId: bed.anaConversation.id,
          fileName: `anexo-${index}.pdf`,
          content: PDF_CONTENT,
        });
      }
      return bed;
    }

    it('recusa mais um arquivo', async () => {
      const { upload, storage, anaConversation } = await conversationFullOfPendingAttachments();

      const uploading = upload.execute({
        userId: ANA,
        conversationId: anaConversation.id,
        fileName: 'excedente.pdf',
        content: PDF_CONTENT,
      });

      await expect(uploading).rejects.toMatchObject({ code: 'too_many_pending_attachments' });
      expect(storage.files.size).toBe(MAX_ATTACHMENTS_PER_MESSAGE);
    });

    it('volta a aceitar depois que os anexos são enviados em uma mensagem', async () => {
      const { upload, attachments, anaConversation } = await conversationFullOfPendingAttachments();
      const pending = await attachments.listPending(anaConversation.id);
      await attachments.linkToMessage(
        pending.map(({ id }) => id),
        'mensagem-1',
      );

      const part = await upload.execute({
        userId: ANA,
        conversationId: anaConversation.id,
        fileName: 'seguinte.pdf',
        content: PDF_CONTENT,
      });

      expect(part.fileName).toBe('seguinte.pdf');
    });

    it('não conta os anexos de outras conversas', async () => {
      const { upload, conversations } = await conversationFullOfPendingAttachments();
      const otherConversation = await conversations.create(ANA, 'Outra da Ana');

      const part = await upload.execute({
        userId: ANA,
        conversationId: otherConversation.id,
        fileName: 'outra.pdf',
        content: PDF_CONTENT,
      });

      expect(part.fileName).toBe('outra.pdf');
    });
  });

  describe('com os anexos por enviar do usuário no teto de bytes', () => {
    /** PDF do maior tamanho aceito. */
    const LARGEST_PDF = Buffer.concat([PDF_CONTENT, Buffer.alloc(MAX_SIZE_BYTES)]).subarray(
      0,
      MAX_SIZE_BYTES,
    );

    /** A Ana enche o teto com anexos pendentes espalhados por várias conversas. */
    async function anaAtPendingBytesLimit() {
      const bed = await filesTestBed();
      for (let sent = 0; sent < MAX_PENDING_BYTES_PER_USER; sent += MAX_SIZE_BYTES) {
        const conversation = await bed.conversations.create(ANA, 'Rascunho');
        await bed.upload.execute({
          userId: ANA,
          conversationId: conversation.id,
          fileName: 'grande.pdf',
          content: LARGEST_PDF,
        });
      }
      return bed;
    }

    it('recusa mais um arquivo, mesmo em outra conversa', async () => {
      const { upload, storage, anaConversation } = await anaAtPendingBytesLimit();
      const storedBefore = storage.files.size;

      const uploading = upload.execute({
        userId: ANA,
        conversationId: anaConversation.id,
        fileName: 'excedente.pdf',
        content: PDF_CONTENT,
      });

      await expect(uploading).rejects.toMatchObject({
        code: 'pending_attachments_quota_exceeded',
      });
      expect(storage.files.size).toBe(storedBefore);
    });

    it('volta a aceitar depois que anexos são enviados em uma mensagem', async () => {
      const { upload, attachments, conversations, anaConversation } =
        await anaAtPendingBytesLimit();
      const [draft] = (await conversations.listOwned(ANA)).filter(
        ({ id }) => id !== anaConversation.id,
      );
      const pending = await attachments.listPending(draft?.id ?? '');
      await attachments.linkToMessage(
        pending.map(({ id }) => id),
        'mensagem-1',
      );

      const part = await upload.execute({
        userId: ANA,
        conversationId: anaConversation.id,
        fileName: 'seguinte.pdf',
        content: PDF_CONTENT,
      });

      expect(part.fileName).toBe('seguinte.pdf');
    });

    it('não conta os anexos de outros usuários', async () => {
      const { upload, biaConversation } = await anaAtPendingBytesLimit();

      const part = await upload.execute({
        userId: BIA,
        conversationId: biaConversation.id,
        fileName: 'da-bia.pdf',
        content: PDF_CONTENT,
      });

      expect(part.fileName).toBe('da-bia.pdf');
    });
  });
});
