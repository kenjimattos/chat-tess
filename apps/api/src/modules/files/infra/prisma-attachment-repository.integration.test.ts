import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../infra/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaAttachmentRepository } from './prisma-attachment-repository';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const attachments = new PrismaAttachmentRepository(database);

describe('PrismaAttachmentRepository', () => {
  let owner: { userId: string; conversationId: string };

  beforeEach(async () => {
    await resetDatabase(database);
    const user = await database.user.create({ data: { email: 'ana@empresa.com', name: 'Ana' } });
    const conversation = await database.conversation.create({
      data: { userId: user.id, title: 'x' },
    });
    owner = { userId: user.id, conversationId: conversation.id };
  });
  afterAll(() => database.$disconnect());

  const newAttachment = (fileName: string) => ({
    ...owner,
    fileName,
    mimeType: 'application/pdf' as const,
    sizeBytes: 10,
    storageUri: `gs://bucket/${fileName}`,
  });

  const NO_LIMITS = { maxPerConversation: 1000, maxBytesPerUser: 1_000_000 };

  async function create(attachment: ReturnType<typeof newAttachment>) {
    const result = await attachments.createPending(attachment, NO_LIMITS);
    if (result.status !== 'created') {
      throw new Error(`Anexo recusado: ${result.status}`);
    }
    return result.attachment;
  }

  it('cria o anexo pendente e o encontra por id', async () => {
    const created = await create(newAttachment('a.pdf'));

    expect(created).toEqual({ id: expect.any(String), messageId: null, ...newAttachment('a.pdf') });
    expect(await attachments.findById(created.id)).toEqual(created);
  });

  it('encontra vários anexos por id, ignorando os inexistentes', async () => {
    const first = await create(newAttachment('a.pdf'));
    const second = await create(newAttachment('b.pdf'));

    const found = await attachments.findByIds([
      first.id,
      second.id,
      '00000000-0000-0000-0000-000000000000',
    ]);

    expect(found.map(({ fileName }) => fileName).sort()).toEqual(['a.pdf', 'b.pdf']);
  });

  it('liga os anexos à mensagem', async () => {
    const attachment = await create(newAttachment('a.pdf'));
    const message = await database.message.create({
      data: { conversationId: owner.conversationId, sequence: 1, role: 'USER', parts: [] },
    });

    await attachments.linkToMessage([attachment.id], message.id);

    expect((await attachments.findById(attachment.id))?.messageId).toBe(message.id);
  });

  it('lista só os anexos pendentes da conversa, do mais antigo para o mais novo', async () => {
    const sent = await create(newAttachment('enviado.pdf'));
    const first = await create(newAttachment('primeiro.pdf'));
    const second = await create(newAttachment('segundo.pdf'));
    const message = await database.message.create({
      data: { conversationId: owner.conversationId, sequence: 1, role: 'USER', parts: [] },
    });
    await attachments.linkToMessage([sent.id], message.id);

    const pending = await attachments.listPending(owner.conversationId);

    expect(pending.map(({ id }) => id)).toEqual([first.id, second.id]);
  });

  describe('tetos de anexos pendentes', () => {
    async function send(attachmentId: string) {
      const message = await database.message.create({
        data: { conversationId: owner.conversationId, sequence: 1, role: 'USER', parts: [] },
      });
      await attachments.linkToMessage([attachmentId], message.id);
    }

    it('recusa quando a conversa já tem o máximo de pendentes', async () => {
      const limits = { ...NO_LIMITS, maxPerConversation: 1 };
      await create(newAttachment('a.pdf'));

      const result = await attachments.createPending(newAttachment('b.pdf'), limits);

      expect(result).toEqual({ status: 'conversation_full' });
    });

    it('recusa quando os pendentes do usuário passariam do teto de bytes, somando as conversas', async () => {
      const limits = { ...NO_LIMITS, maxBytesPerUser: 15 };
      const otherConversation = await database.conversation.create({
        data: { userId: owner.userId, title: 'y' },
      });
      await create({ ...newAttachment('a.pdf'), conversationId: otherConversation.id });

      const result = await attachments.createPending(newAttachment('b.pdf'), limits);

      expect(result).toEqual({ status: 'user_quota_exceeded' });
    });

    it('não conta os anexos já enviados em mensagem', async () => {
      const limits = { maxPerConversation: 1, maxBytesPerUser: 10 };
      const sent = await create(newAttachment('enviado.pdf'));
      await send(sent.id);

      const result = await attachments.createPending(newAttachment('b.pdf'), limits);

      expect(result.status).toBe('created');
    });

    it('não conta os anexos de outros usuários', async () => {
      const limits = { ...NO_LIMITS, maxBytesPerUser: 10 };
      const otherUser = await database.user.create({
        data: { email: 'bia@empresa.com', name: 'Bia' },
      });
      const otherUserConversation = await database.conversation.create({
        data: { userId: otherUser.id, title: 'z' },
      });
      await create({
        ...newAttachment('da-bia.pdf'),
        userId: otherUser.id,
        conversationId: otherUserConversation.id,
      });

      const result = await attachments.createPending(newAttachment('a.pdf'), limits);

      expect(result.status).toBe('created');
    });

    it('uploads simultâneos não passam juntos do teto', async () => {
      const limits = { ...NO_LIMITS, maxBytesPerUser: 30 };

      const results = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          attachments.createPending(newAttachment(`${index}.pdf`), limits),
        ),
      );

      expect(results.filter(({ status }) => status === 'created')).toHaveLength(3);
      expect(await attachments.listPending(owner.conversationId)).toHaveLength(3);
    });
  });

  it('apaga o anexo', async () => {
    const attachment = await create(newAttachment('a.pdf'));

    await attachments.delete(attachment.id);

    expect(await attachments.findById(attachment.id)).toBeNull();
  });
});
