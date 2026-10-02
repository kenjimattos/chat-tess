import type { EventPublisher } from '../../../kernel/events/domain-event';
import type { Clock } from '../../../kernel/time/clock';
import type { ConversationDeleted } from '../domain/conversation-events';
import type { ConversationRepository } from '../domain/ports';
import { findOwnedConversation } from './find-owned-conversation';

/** Apaga a conversa com mensagens, anexos e resumos. O registro de auditoria permanece. */
export class DeleteConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(conversationId: string, userId: string): Promise<void> {
    await findOwnedConversation(this.conversations, conversationId, userId);
    await this.conversations.delete(conversationId);

    await this.events.publish({
      type: 'conversation.deleted',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: { conversationId },
    } satisfies ConversationDeleted);
  }
}
