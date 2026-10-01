import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../shared/database/database';
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

  it('cria o anexo pendente e o encontra por id', async () => {
    const created = await attachments.create(newAttachment('a.pdf'));

    expect(created).toEqual({ id: expect.any(String), messageId: null, ...newAttachment('a.pdf') });
    expect(await attachments.findById(created.id)).toEqual(created);
  });

  it('encontra vários anexos por id, ignorando os inexistentes', async () => {
    const first = await attachments.create(newAttachment('a.pdf'));
    const second = await attachments.create(newAttachment('b.pdf'));

    const found = await attachments.findByIds([
      first.id,
      second.id,
      '00000000-0000-0000-0000-000000000000',
    ]);

    expect(found.map(({ fileName }) => fileName).sort()).toEqual(['a.pdf', 'b.pdf']);
  });

  it('liga os anexos à mensagem', async () => {
    const attachment = await attachments.create(newAttachment('a.pdf'));
    const message = await database.message.create({
      data: { conversationId: owner.conversationId, sequence: 1, role: 'USER', parts: [] },
    });

    await attachments.linkToMessage([attachment.id], message.id);

    expect((await attachments.findById(attachment.id))?.messageId).toBe(message.id);
  });

  it('lista só os anexos pendentes da conversa, do mais antigo para o mais novo', async () => {
    const sent = await attachments.create(newAttachment('enviado.pdf'));
    const first = await attachments.create(newAttachment('primeiro.pdf'));
    const second = await attachments.create(newAttachment('segundo.pdf'));
    const message = await database.message.create({
      data: { conversationId: owner.conversationId, sequence: 1, role: 'USER', parts: [] },
    });
    await attachments.linkToMessage([sent.id], message.id);

    const pending = await attachments.listPending(owner.conversationId);

    expect(pending.map(({ id }) => id)).toEqual([first.id, second.id]);
  });

  it('soma só os anexos pendentes do usuário, em todas as conversas', async () => {
    const otherConversation = await database.conversation.create({
      data: { userId: owner.userId, title: 'y' },
    });
    const otherUser = await database.user.create({
      data: { email: 'bia@empresa.com', name: 'Bia' },
    });
    const otherUserConversation = await database.conversation.create({
      data: { userId: otherUser.id, title: 'z' },
    });
    const sent = await attachments.create(newAttachment('enviado.pdf'));
    await attachments.create(newAttachment('pendente.pdf'));
    await attachments.create({
      ...newAttachment('em-outra-conversa.pdf'),
      conversationId: otherConversation.id,
    });
    await attachments.create({
      ...newAttachment('de-outro-usuario.pdf'),
      userId: otherUser.id,
      conversationId: otherUserConversation.id,
    });
    const message = await database.message.create({
      data: { conversationId: owner.conversationId, sequence: 1, role: 'USER', parts: [] },
    });
    await attachments.linkToMessage([sent.id], message.id);

    expect(await attachments.pendingBytesOf(owner.userId)).toBe(20);
    expect(await attachments.pendingBytesOf(otherUser.id)).toBe(10);
  });

  it('não tem bytes pendentes quem nunca anexou nada', async () => {
    expect(await attachments.pendingBytesOf(owner.userId)).toBe(0);
  });

  it('apaga o anexo', async () => {
    const attachment = await attachments.create(newAttachment('a.pdf'));

    await attachments.delete(attachment.id);

    expect(await attachments.findById(attachment.id)).toBeNull();
  });
});
