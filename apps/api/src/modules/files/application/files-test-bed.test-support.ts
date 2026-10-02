import { RecordingEventPublisher } from '../../../test/recording-event-publisher';
import { ManualClock } from '../../../shared/time/clock';
import { InMemoryConversationStore } from '../../conversations/infra/in-memory-conversation-store';
import { InMemoryAttachmentRepository } from '../infra/in-memory-attachment-repository';
import { InMemoryFileStorage } from '../infra/in-memory-file-storage';
import { UploadAttachment } from './upload-attachment';

export const ANA = 'user-ana';
export const BIA = 'user-bia';
export const MAX_SIZE_BYTES = 1024;
export const MAX_PENDING_BYTES_PER_USER = 20 * MAX_SIZE_BYTES;

export const PDF_CONTENT = Buffer.from('%PDF-1.7\nconteúdo');
export const PNG_CONTENT = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

export async function filesTestBed({ readableByModel = false } = {}) {
  const clock = new ManualClock('2026-09-30T10:00:00Z');
  const conversations = new InMemoryConversationStore(clock);
  const attachments = new InMemoryAttachmentRepository();
  const storage = new InMemoryFileStorage(readableByModel);
  const events = new RecordingEventPublisher();
  const upload = new UploadAttachment(conversations, attachments, storage, events, clock, {
    maxSizeBytes: MAX_SIZE_BYTES,
    maxPendingBytesPerUser: MAX_PENDING_BYTES_PER_USER,
  });
  const anaConversation = await conversations.create(ANA, 'Da Ana');
  const biaConversation = await conversations.create(BIA, 'Da Bia');

  return {
    clock,
    conversations,
    attachments,
    storage,
    events,
    upload,
    anaConversation,
    biaConversation,
  };
}
