import type { AttachmentPart } from '@chat-tess/shared';
import { AppError } from '../../../shared/errors/app-error';
import type { AttachmentCatalog, AttachmentOwner } from '../domain/attachment-catalog';
import type { AttachmentSource } from '../domain/llm';

interface StoredAttachment {
  part: AttachmentPart;
  owner: AttachmentOwner;
  messageId: string | null;
}

export class InMemoryAttachmentCatalog implements AttachmentCatalog {
  private readonly attachments = new Map<string, StoredAttachment>();

  add(part: AttachmentPart, owner: AttachmentOwner): void {
    this.attachments.set(part.attachmentId, { part, owner, messageId: null });
  }

  async findPendingForMessage(ids: string[], owner: AttachmentOwner): Promise<AttachmentPart[]> {
    return ids.map((id) => {
      const stored = this.attachments.get(id);
      const isAvailable =
        stored?.owner.userId === owner.userId &&
        stored.owner.conversationId === owner.conversationId &&
        stored.messageId === null;
      if (!stored || !isAvailable) {
        throw new AppError('validation', 'invalid_attachment', 'Anexo inválido.');
      }
      return stored.part;
    });
  }

  async attachToMessage(ids: string[], messageId: string): Promise<void> {
    for (const id of ids) {
      const stored = this.attachments.get(id);
      if (stored) {
        stored.messageId = messageId;
      }
    }
  }

  async resolveSources(ids: string[]): Promise<Map<string, AttachmentSource>> {
    return new Map(
      ids
        .filter((id) => this.attachments.has(id))
        .map((id) => [id, { kind: 'uri', uri: `memory://${id}` }]),
    );
  }
}
