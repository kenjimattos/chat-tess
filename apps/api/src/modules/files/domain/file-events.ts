import type { DomainEvent } from '../../../shared/events/domain-event';

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
