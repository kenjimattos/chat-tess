import { randomUUID } from 'node:crypto';
import type { Attachment } from '../domain/attachment';
import type { AttachmentRepository, NewAttachment } from '../domain/ports';

export class InMemoryAttachmentRepository implements AttachmentRepository {
  private readonly attachments = new Map<string, Attachment>();

  async create(attachment: NewAttachment): Promise<Attachment> {
    const created = { ...attachment, id: randomUUID(), messageId: null };
    this.attachments.set(created.id, created);
    return created;
  }

  async findById(id: string): Promise<Attachment | null> {
    return this.attachments.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Attachment[]> {
    return ids.flatMap((id) => this.attachments.get(id) ?? []);
  }

  async linkToMessage(ids: string[], messageId: string): Promise<void> {
    for (const id of ids) {
      const attachment = this.attachments.get(id);
      if (attachment) {
        this.attachments.set(id, { ...attachment, messageId });
      }
    }
  }
}
