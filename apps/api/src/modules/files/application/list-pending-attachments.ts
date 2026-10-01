import type { AttachmentPart } from '@chat-tess/shared';
import { findOwnedConversation } from '../../conversations/application/find-owned-conversation';
import type { ConversationRepository } from '../../conversations/domain/ports';
import { toAttachmentPart } from '../domain/attachment';
import type { AttachmentRepository } from '../domain/ports';

/**
 * Anexos que o usuário já subiu para a conversa e ainda não enviou em uma
 * mensagem. A tela usa para mostrar o rascunho como ele ficou, mesmo depois
 * de recarregar a página.
 */
export class ListPendingAttachments {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly attachments: AttachmentRepository,
  ) {}

  async execute(conversationId: string, userId: string): Promise<AttachmentPart[]> {
    const conversation = await findOwnedConversation(this.conversations, conversationId, userId);
    const pending = await this.attachments.listPending(conversation.id);
    return pending.map(toAttachmentPart);
  }
}
