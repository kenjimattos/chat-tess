import type { Conversation } from '../domain/conversation';
import type { ConversationRepository } from '../domain/ports';

export class ListConversations {
  constructor(private readonly conversations: ConversationRepository) {}

  execute(userId: string): Promise<Conversation[]> {
    return this.conversations.listOwned(userId);
  }
}
