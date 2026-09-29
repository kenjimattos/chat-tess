import type { MessagePart } from '@chat-tess/shared';
import type { Conversation, Message, MessageRole } from './conversation';

/** Todas as consultas recebem o dono: um usuário nunca alcança conversas de outro. */
export interface ConversationRepository {
  create(userId: string, title: string): Promise<Conversation>;
  findOwned(conversationId: string, userId: string): Promise<Conversation | null>;
  /** Mais recentes primeiro. */
  listOwned(userId: string): Promise<Conversation[]>;
  rename(conversationId: string, title: string): Promise<Conversation>;
  delete(conversationId: string): Promise<void>;
}

export interface NewMessage {
  role: MessageRole;
  parts: MessagePart[];
}

export interface MessageRepository {
  /** Grava a mensagem no fim da conversa e atualiza a data da conversa. */
  append(conversationId: string, message: NewMessage): Promise<Message>;
  /** Em ordem de sequência. */
  listByConversation(conversationId: string): Promise<Message[]>;
}
