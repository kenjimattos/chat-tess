import type { ConversationShare } from '../domain/conversation-share';
import type { ConversationRepository, ConversationShareRepository } from '../domain/ports';
import { findOwnedConversation } from './find-owned-conversation';

/** Link atual da conversa, para o dono copiar ou revogar; `null` se não foi compartilhada. */
export class GetConversationShare {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly shares: ConversationShareRepository,
  ) {}

  async execute(conversationId: string, userId: string): Promise<ConversationShare | null> {
    await findOwnedConversation(this.conversations, conversationId, userId);
    return this.shares.findByConversation(conversationId);
  }
}
