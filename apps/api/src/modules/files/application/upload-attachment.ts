import { randomUUID } from 'node:crypto';
import { MAX_ATTACHMENTS_PER_MESSAGE, type AttachmentPart } from '@chat-tess/shared';
import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import { findOwnedConversation } from '../../conversations/application/find-owned-conversation';
import type { ConversationRepository } from '../../conversations/domain/ports';
import { conversationFolderKey, sanitizeFileName, toAttachmentPart } from '../domain/attachment';
import {
  EmptyFileError,
  FileTooLargeError,
  PendingAttachmentsQuotaExceededError,
  TooManyPendingAttachmentsError,
  UnsupportedFileTypeError,
} from '../domain/file-errors';
import type { AttachmentUploaded } from '../domain/file-events';
import { detectMimeType } from '../domain/file-type';
import type { AttachmentRepository, FileStorage } from '../domain/ports';

export interface UploadAttachmentInput {
  userId: string;
  conversationId: string;
  fileName: string;
  content: Buffer;
}

export interface UploadLimits {
  maxSizeBytes: number;
  /** Teto dos anexos pendentes de um usuário, somando todas as conversas. */
  maxPendingBytesPerUser: number;
}

/**
 * Recebe um arquivo para uma conversa. Ele fica pendente até ser enviado
 * junto com uma mensagem. A conversa guarda no máximo os pendentes que cabem
 * em uma mensagem, e o usuário tem um teto de bytes pendentes: assim os
 * arquivos nunca enviados, que não gastam crédito, não se acumulam.
 */
export class UploadAttachment {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStorage,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
    private readonly limits: UploadLimits,
  ) {}

  async execute({
    userId,
    conversationId,
    fileName,
    content,
  }: UploadAttachmentInput): Promise<AttachmentPart> {
    if (content.length === 0) {
      throw new EmptyFileError();
    }
    if (content.length > this.limits.maxSizeBytes) {
      throw new FileTooLargeError(this.limits.maxSizeBytes);
    }
    const mimeType = detectMimeType(content);
    if (!mimeType) {
      throw new UnsupportedFileTypeError();
    }
    await findOwnedConversation(this.conversations, conversationId, userId);

    // Grava antes de reservar a vaga: o anexo só existe com o endereço do arquivo.
    const key = `${conversationFolderKey(userId, conversationId)}/${randomUUID()}`;
    const storageUri = await this.storage.save(key, content, mimeType);
    const result = await this.attachments.createPending(
      {
        userId,
        conversationId,
        fileName: sanitizeFileName(fileName),
        mimeType,
        sizeBytes: content.length,
        storageUri,
      },
      {
        maxPerConversation: MAX_ATTACHMENTS_PER_MESSAGE,
        maxBytesPerUser: this.limits.maxPendingBytesPerUser,
      },
    );
    if (result.status !== 'created') {
      await this.storage.delete(storageUri);
      throw result.status === 'conversation_full'
        ? new TooManyPendingAttachmentsError(MAX_ATTACHMENTS_PER_MESSAGE)
        : new PendingAttachmentsQuotaExceededError(this.limits.maxPendingBytesPerUser);
    }
    const { attachment } = result;

    await this.events.publish({
      type: 'attachment.uploaded',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: {
        attachmentId: attachment.id,
        conversationId,
        fileName: attachment.fileName,
        mimeType,
        sizeBytes: attachment.sizeBytes,
      },
    } satisfies AttachmentUploaded);

    return toAttachmentPart(attachment);
  }
}
