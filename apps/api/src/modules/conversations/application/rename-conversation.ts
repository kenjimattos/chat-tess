import { AppError } from '../../../kernel/errors/app-error';
import type { EventPublisher } from '../../../kernel/events/domain-event';
import type { Clock } from '../../../kernel/time/clock';
import { MAX_TITLE_LENGTH, type Conversation } from '../domain/conversation';
import type { ConversationRenamed } from '../domain/conversation-events';
import type { ConversationRepository } from '../domain/ports';
import { findOwnedConversation } from './find-owned-conversation';

export interface RenameConversationInput {
  conversationId: string;
  userId: string;
  title: string;
}

export class RenameConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute({ conversationId, userId, title }: RenameConversationInput): Promise<Conversation> {
    const newTitle = title.trim();
    if (!newTitle || newTitle.length > MAX_TITLE_LENGTH) {
      throw new AppError(
        'validation',
        'invalid_title',
        `O título precisa ter entre 1 e ${MAX_TITLE_LENGTH} caracteres.`,
      );
    }

    await findOwnedConversation(this.conversations, conversationId, userId);
    const conversation = await this.conversations.rename(conversationId, newTitle);

    await this.events.publish({
      type: 'conversation.renamed',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: { conversationId, title: newTitle },
    } satisfies ConversationRenamed);

    return conversation;
  }
}
