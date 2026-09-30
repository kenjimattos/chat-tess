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
});
