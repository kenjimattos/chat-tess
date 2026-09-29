import type { Conversation, Message } from '../domain/conversation';
import type { ConversationRepository, MessageRepository } from '../domain/ports';
import { findOwnedConversation } from './find-owned-conversation';

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

/** Abre uma conversa com o histórico completo, inclusive o que já foi compactado. */
export class GetConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
  ) {}

  async execute(conversationId: string, userId: string): Promise<ConversationWithMessages> {
    const conversation = await findOwnedConversation(this.conversations, conversationId, userId);
    const messages = await this.messages.listByConversation(conversation.id);

    return { conversation, messages };
  }
}
