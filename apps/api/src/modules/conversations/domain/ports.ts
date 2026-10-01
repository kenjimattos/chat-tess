import type { MessagePart } from '@chat-tess/shared';
import type { Conversation, Message, MessageRole } from './conversation';
import type { ConversationShare } from './conversation-share';

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

export interface MessagePageRequest {
  /** Só mensagens anteriores a esta sequência; sem ela, as mais recentes. */
  beforeSequence?: number;
  limit: number;
  /** Papéis que entram na página; sem ele, todos. */
  roles?: MessageRole[];
}

export interface MessagePage {
  /** Em ordem de sequência. */
  messages: Message[];
  /** Há mensagens mais antigas que as desta página. */
  hasEarlier: boolean;
}

export interface MessageRepository {
  /** Grava a mensagem no fim da conversa e atualiza a data da conversa. */
  append(conversationId: string, message: NewMessage): Promise<Message>;
  /**
   * Em ordem de sequência. Com `afterSequence`, só as mensagens posteriores a ela:
   * o agente usa para não carregar o que o resumo da conversa já cobre.
   */
  listByConversation(conversationId: string, afterSequence?: number): Promise<Message[]>;
  /** Troca o conteúdo de uma mensagem já gravada. */
  replaceParts(messageId: string, parts: MessagePart[]): Promise<void>;
  /** Apaga as mensagens posteriores a `sequence`, para refazer o fim da conversa. */
  deleteAfter(conversationId: string, sequence: number): Promise<void>;
  /** Uma página do histórico para exibição, das mensagens mais recentes para as mais antigas. */
  listPage(conversationId: string, request: MessagePageRequest): Promise<MessagePage>;
}

export interface ConversationShareRepository {
  findByConversation(conversationId: string): Promise<ConversationShare | null>;
  /**
   * Grava o link com o token informado, se a conversa ainda não tiver um.
   * Devolve o link que ficou valendo: o novo ou o que já existia.
   */
  createIfAbsent(conversationId: string, token: string): Promise<ConversationShare>;
  /** Conversa do link, ou `null` se o token não existe ou foi revogado. */
  findSharedConversation(token: string): Promise<Conversation | null>;
  revoke(conversationId: string): Promise<void>;
}
