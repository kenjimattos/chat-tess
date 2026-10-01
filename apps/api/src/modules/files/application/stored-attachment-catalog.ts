import type { AttachmentPart } from '@chat-tess/shared';
import type { AttachmentCatalog, AttachmentOwner } from '../../agent/domain/attachment-catalog';
import type { AttachmentSource } from '../../agent/domain/llm';
import { toAttachmentPart, type Attachment } from '../domain/attachment';
import { InvalidAttachmentError } from '../domain/file-errors';
import type { AttachmentRepository, FileStorage } from '../domain/ports';

/** Implementa, com os anexos armazenados, o catálogo de que o agente precisa. */
export class StoredAttachmentCatalog implements AttachmentCatalog {
  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStorage,
  ) {}

  async findPendingForMessage(ids: string[], owner: AttachmentOwner): Promise<AttachmentPart[]> {
    const uniqueIds = [...new Set(ids)];
    const found = await this.attachments.findByIds(uniqueIds);
    const isPendingForOwner = (attachment: Attachment) =>
      attachment.userId === owner.userId &&
      attachment.conversationId === owner.conversationId &&
      attachment.messageId === null;

    if (found.length !== uniqueIds.length || !found.every(isPendingForOwner)) {
      throw new InvalidAttachmentError();
    }

    const byId = new Map(found.map((attachment) => [attachment.id, attachment]));
    return uniqueIds.map((id) => toAttachmentPart(byId.get(id) as Attachment));
  }

  attachToMessage(ids: string[], messageId: string): Promise<void> {
    return this.attachments.linkToMessage(ids, messageId);
  }

  async resolveSources(ids: string[]): Promise<Map<string, AttachmentSource>> {
    const found = await this.attachments.findByIds([...new Set(ids)]);
    const entries = await Promise.all(
      found.map(async (attachment) => [attachment.id, await this.sourceOf(attachment)] as const),
    );
    return new Map(entries);
  }

  private async sourceOf(attachment: Attachment): Promise<AttachmentSource> {
    const uri = this.storage.uriReadableByModel(attachment.storageUri);
    if (uri) {
      return { kind: 'uri', uri };
    }
    const content = await this.storage.read(attachment.storageUri);
    return { kind: 'inline', base64Data: content.toString('base64') };
  }
}
