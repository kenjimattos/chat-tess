import type { Conversation, Message } from '../domain/conversation';
import type { ConversationRepository, MessageRepository } from '../domain/ports';
import { findOwnedConversation } from './find-owned-conversation';

/** Qual página do histórico abrir: as mensagens mais recentes ou as anteriores a uma sequência. */
export interface HistoryPage {
  beforeSequence?: number;
  limit: number;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
  hasEarlierMessages: boolean;
}

/**
 * Abre uma conversa com uma página do histórico, inclusive o que já foi
 * compactado. A conversa pode crescer sem limite; a tela pede as mensagens
 * mais antigas conforme o usuário sobe.
 */
export class GetConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
  ) {}

  async execute(
    conversationId: string,
    userId: string,
    page: HistoryPage,
  ): Promise<ConversationWithMessages> {
    const conversation = await findOwnedConversation(this.conversations, conversationId, userId);
    const { messages, hasEarlier } = await this.messages.listPage(conversation.id, page);

    return { conversation, messages, hasEarlierMessages: hasEarlier };
  }
}
