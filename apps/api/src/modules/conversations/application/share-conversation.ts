import { randomBytes } from 'node:crypto';
import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import type { ConversationShare } from '../domain/conversation-share';
import type { ConversationShared } from '../domain/conversation-events';
import type { ConversationRepository, ConversationShareRepository } from '../domain/ports';
import { findOwnedConversation } from './find-owned-conversation';

/** Gera o link somente leitura da conversa. Se ela já tiver um, devolve o mesmo. */
export class ShareConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly shares: ConversationShareRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(conversationId: string, userId: string): Promise<ConversationShare> {
    await findOwnedConversation(this.conversations, conversationId, userId);

    const token = randomBytes(24).toString('base64url');
    const share = await this.shares.createIfAbsent(conversationId, token);

    if (share.token === token) {
      await this.events.publish({
        type: 'conversation.shared',
        occurredAt: this.clock.now(),
        actorUserId: userId,
        payload: { conversationId },
      } satisfies ConversationShared);
    }
    return share;
  }
}
