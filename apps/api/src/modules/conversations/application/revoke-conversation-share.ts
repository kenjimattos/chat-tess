import type { EventPublisher } from '../../../kernel/events/domain-event';
import type { Clock } from '../../../kernel/time/clock';
import type { ConversationShareRevoked } from '../domain/conversation-events';
import type { ConversationRepository, ConversationShareRepository } from '../domain/ports';
import { findOwnedConversation } from './find-owned-conversation';

/** Desativa o link: quem o tiver deixa de ver a conversa. Sem link, não faz nada. */
export class RevokeConversationShare {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly shares: ConversationShareRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(conversationId: string, userId: string): Promise<void> {
    await findOwnedConversation(this.conversations, conversationId, userId);
    if (!(await this.shares.findByConversation(conversationId))) {
      return;
    }

    await this.shares.revoke(conversationId);
    await this.events.publish({
      type: 'conversation.share_revoked',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: { conversationId },
    } satisfies ConversationShareRevoked);
  }
}
