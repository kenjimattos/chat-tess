import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import { DEFAULT_CONVERSATION_TITLE, type Conversation } from '../domain/conversation';
import type { ConversationCreated } from '../domain/conversation-events';
import type { ConversationRepository } from '../domain/ports';

export class CreateConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, title = DEFAULT_CONVERSATION_TITLE): Promise<Conversation> {
    const conversation = await this.conversations.create(userId, title);

    await this.events.publish({
      type: 'conversation.created',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: { conversationId: conversation.id, title: conversation.title },
    } satisfies ConversationCreated);

    return conversation;
  }
}
