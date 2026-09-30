import type { ConversationShareRepository } from '../../conversations/domain/ports';
import { AttachmentNotFoundError } from '../domain/file-errors';
import type { AttachmentRepository, FileStorage } from '../domain/ports';
import type { AttachmentContent } from './read-attachment';

/**
 * Devolve o anexo a quem abriu uma conversa compartilhada. Só vale para anexos
 * enviados em mensagens daquela conversa: um arquivo carregado e ainda não
 * enviado não aparece na conversa, então também não aparece pelo link.
 */
export class ReadSharedAttachment {
  constructor(
    private readonly shares: ConversationShareRepository,
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(token: string, attachmentId: string): Promise<AttachmentContent> {
    const [conversation, attachment] = await Promise.all([
      this.shares.findSharedConversation(token),
      this.attachments.findById(attachmentId),
    ]);
    const isVisibleThroughLink =
      conversation !== null &&
      attachment?.conversationId === conversation.id &&
      attachment.messageId !== null;
    if (!attachment || !isVisibleThroughLink) {
      throw new AttachmentNotFoundError(attachmentId);
    }

    return { attachment, content: await this.storage.read(attachment.storageUri) };
  }
}
