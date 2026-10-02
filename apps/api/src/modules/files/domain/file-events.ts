import type { DomainEvent } from '../../../kernel/events/domain-event';

export type PendingAttachmentRemoved = DomainEvent<
  'attachment.removed',
  { attachmentId: string; conversationId: string; fileName: string }
>;

export type AttachmentUploaded = DomainEvent<
  'attachment.uploaded',
  {
    attachmentId: string;
    conversationId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }
>;
