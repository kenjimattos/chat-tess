import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import { AttachmentAlreadySentError, AttachmentNotFoundError } from '../domain/file-errors';
import type { PendingAttachmentRemoved } from '../domain/file-events';
import type { AttachmentRepository, FileStorage } from '../domain/ports';

/**
 * Remove um anexo que o usuário desistiu de enviar: o registro e o arquivo no
 * armazenamento. Anexos já enviados fazem parte do histórico e só saem com a conversa.
 */
export class RemovePendingAttachment {
  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStorage,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(attachmentId: string, userId: string): Promise<void> {
    const attachment = await this.attachments.findById(attachmentId);
    if (!attachment || attachment.userId !== userId) {
      throw new AttachmentNotFoundError(attachmentId);
    }
    if (attachment.messageId !== null) {
      throw new AttachmentAlreadySentError();
    }

    // O registro sai primeiro: se apagar o arquivo falhar, não sobra um anexo
    // que a tela mostra e o modelo não consegue ler.
    await this.attachments.delete(attachment.id);
    await this.storage.delete(attachment.storageUri);

    await this.events.publish({
      type: 'attachment.removed',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: {
        attachmentId: attachment.id,
        conversationId: attachment.conversationId,
        fileName: attachment.fileName,
      },
    } satisfies PendingAttachmentRemoved);
  }
}
