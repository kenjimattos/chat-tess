import { randomUUID } from 'node:crypto';
import type { Attachment } from '../domain/attachment';
import type {
  AttachmentRepository,
  NewAttachment,
  PendingAttachmentLimits,
  PendingAttachmentResult,
} from '../domain/ports';

export class InMemoryAttachmentRepository implements AttachmentRepository {
  private readonly attachments = new Map<string, Attachment>();

  async createPending(
    attachment: NewAttachment,
    limits: PendingAttachmentLimits,
  ): Promise<PendingAttachmentResult> {
    const pending = [...this.attachments.values()].filter(({ messageId }) => messageId === null);
    const inConversation = pending.filter(
      ({ conversationId }) => conversationId === attachment.conversationId,
    );
    if (inConversation.length >= limits.maxPerConversation) {
      return { status: 'conversation_full' };
    }
    const pendingBytes = pending
      .filter(({ userId }) => userId === attachment.userId)
      .reduce((total, { sizeBytes }) => total + sizeBytes, 0);
    if (pendingBytes + attachment.sizeBytes > limits.maxBytesPerUser) {
      return { status: 'user_quota_exceeded' };
    }

    const created = { ...attachment, id: randomUUID(), messageId: null };
    this.attachments.set(created.id, created);
    return { status: 'created', attachment: created };
  }

  async findById(id: string): Promise<Attachment | null> {
    return this.attachments.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Attachment[]> {
    return ids.flatMap((id) => this.attachments.get(id) ?? []);
  }

  async listPending(conversationId: string): Promise<Attachment[]> {
    return [...this.attachments.values()].filter(
      (attachment) => attachment.conversationId === conversationId && attachment.messageId === null,
    );
  }

  async delete(id: string): Promise<void> {
    this.attachments.delete(id);
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
