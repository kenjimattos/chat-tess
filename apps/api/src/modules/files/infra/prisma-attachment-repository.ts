import type { Database } from '../../../shared/database/database';
import type { Attachment as AttachmentRecord } from '../../../generated/prisma/client';
import type { Attachment } from '../domain/attachment';
import { detectableMimeTypes } from '../domain/file-type';
import type { AttachmentRepository, NewAttachment } from '../domain/ports';

export class PrismaAttachmentRepository implements AttachmentRepository {
  constructor(private readonly database: Database) {}

  async create(attachment: NewAttachment): Promise<Attachment> {
    return toAttachment(await this.database.attachment.create({ data: attachment }));
  }

  async findById(id: string): Promise<Attachment | null> {
    const record = await this.database.attachment.findUnique({ where: { id } });
    return record && toAttachment(record);
  }

  async findByIds(ids: string[]): Promise<Attachment[]> {
    const records = await this.database.attachment.findMany({ where: { id: { in: ids } } });
    return records.map(toAttachment);
  }

  async linkToMessage(ids: string[], messageId: string): Promise<void> {
    await this.database.attachment.updateMany({ where: { id: { in: ids } }, data: { messageId } });
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
