import type { Conversation } from '../domain/conversation';
import { ConversationNotFoundError } from '../domain/conversation-errors';
import type { ConversationRepository } from '../domain/ports';

/** Busca a conversa do usuário ou lança `ConversationNotFoundError`. */
export async function findOwnedConversation(
  conversations: ConversationRepository,
  conversationId: string,
  userId: string,
): Promise<Conversation> {
  const conversation = await conversations.findOwned(conversationId, userId);
  if (!conversation) {
    throw new ConversationNotFoundError(conversationId);
  }
  return conversation;
}
