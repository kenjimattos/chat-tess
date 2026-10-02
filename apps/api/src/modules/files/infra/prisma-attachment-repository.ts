import type { Database } from '../../../infra/database/database';
import type { Attachment as AttachmentRecord } from '../../../generated/prisma/client';
import type { Attachment } from '../domain/attachment';
import { detectableMimeTypes } from '../domain/file-type';
import type {
  AttachmentRepository,
  NewAttachment,
  PendingAttachmentLimits,
  PendingAttachmentResult,
} from '../domain/ports';

export class PrismaAttachmentRepository implements AttachmentRepository {
  constructor(private readonly database: Database) {}

  /**
   * A linha do usuário é travada enquanto os pendentes são contados e o anexo
   * é criado, para que uploads simultâneos não contem os mesmos anexos e
   * passem todos.
   */
  async createPending(
    attachment: NewAttachment,
    limits: PendingAttachmentLimits,
  ): Promise<PendingAttachmentResult> {
    const { userId, conversationId } = attachment;
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      const pendingInConversation = await transaction.attachment.count({
        where: { conversationId, messageId: null },
      });
      if (pendingInConversation >= limits.maxPerConversation) {
        return { status: 'conversation_full' };
      }
      const { _sum } = await transaction.attachment.aggregate({
        where: { userId, messageId: null },
        _sum: { sizeBytes: true },
      });
      if ((_sum.sizeBytes ?? 0) + attachment.sizeBytes > limits.maxBytesPerUser) {
        return { status: 'user_quota_exceeded' };
      }

      const created = await transaction.attachment.create({ data: attachment });
      return { status: 'created', attachment: toAttachment(created) };
    });
  }

  async findById(id: string): Promise<Attachment | null> {
    const record = await this.database.attachment.findUnique({ where: { id } });
    return record && toAttachment(record);
  }

  async findByIds(ids: string[]): Promise<Attachment[]> {
    const records = await this.database.attachment.findMany({ where: { id: { in: ids } } });
    return records.map(toAttachment);
  }

  async listPending(conversationId: string): Promise<Attachment[]> {
    const records = await this.database.attachment.findMany({
      where: { conversationId, messageId: null },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(toAttachment);
  }

  async linkToMessage(ids: string[], messageId: string): Promise<void> {
    await this.database.attachment.updateMany({ where: { id: { in: ids } }, data: { messageId } });
  }

  async delete(id: string): Promise<void> {
    await this.database.attachment.deleteMany({ where: { id } });
  }
}

function toAttachment(record: AttachmentRecord): Attachment {
  const mimeType = detectableMimeTypes.find((type) => type === record.mimeType);
  if (!mimeType) {
    throw new Error(`Tipo de anexo inesperado no banco: ${record.mimeType}`);
  }
  return {
    id: record.id,
    userId: record.userId,
    conversationId: record.conversationId,
    messageId: record.messageId,
    fileName: record.fileName,
    mimeType,
    sizeBytes: record.sizeBytes,
    storageUri: record.storageUri,
  };
}
