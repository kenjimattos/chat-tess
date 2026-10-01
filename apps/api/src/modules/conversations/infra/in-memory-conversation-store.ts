import type { MessagePart } from '@chat-tess/shared';
import { randomUUID } from 'node:crypto';
import type { Clock } from '../../../shared/time/clock';
import type { Conversation, Message } from '../domain/conversation';
import type { ConversationShare } from '../domain/conversation-share';
import type {
  ConversationRepository,
  ConversationShareRepository,
  MessagePage,
  MessagePageRequest,
  MessageRepository,
  NewMessage,
} from '../domain/ports';

/**
 * Conversas, mensagens e links em memória, para testes. Implementa os três
 * ports porque, como no banco, apagar uma conversa apaga o que depende dela.
 */
export class InMemoryConversationStore
  implements ConversationRepository, MessageRepository, ConversationShareRepository
{
  private readonly conversationsById = new Map<string, Conversation>();
  private readonly messagesByConversation = new Map<string, Message[]>();
  private readonly sharesByConversation = new Map<string, ConversationShare>();

  constructor(private readonly clock: Clock) {}

  async create(userId: string, title: string): Promise<Conversation> {
    const now = this.clock.now();
    const conversation = { id: randomUUID(), userId, title, createdAt: now, updatedAt: now };
    this.conversationsById.set(conversation.id, conversation);
    this.messagesByConversation.set(conversation.id, []);
    return conversation;
  }

  async findOwned(conversationId: string, userId: string): Promise<Conversation | null> {
    const conversation = this.conversationsById.get(conversationId);
    return conversation?.userId === userId ? conversation : null;
  }

  async listOwned(userId: string): Promise<Conversation[]> {
    return [...this.conversationsById.values()]
      .filter((conversation) => conversation.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async rename(conversationId: string, title: string): Promise<Conversation> {
    return this.update(conversationId, { title });
  }

  async delete(conversationId: string): Promise<void> {
    this.conversationsById.delete(conversationId);
    this.messagesByConversation.delete(conversationId);
    this.sharesByConversation.delete(conversationId);
  }

  async append(conversationId: string, { role, parts }: NewMessage): Promise<Message> {
    const messages = this.messagesByConversation.get(conversationId);
    if (!messages) {
      throw new Error(`Conversa não encontrada: ${conversationId}`);
    }

    const message: Message = {
      id: randomUUID(),
      conversationId,
      sequence: messages.length + 1,
      role,
      parts,
      createdAt: this.clock.now(),
    };
    messages.push(message);
    this.update(conversationId, {});
    return message;
  }

  async listByConversation(conversationId: string, afterSequence = 0): Promise<Message[]> {
    const messages = this.messagesByConversation.get(conversationId) ?? [];
    return messages.filter((message) => message.sequence > afterSequence);
  }

  async replaceParts(messageId: string, parts: MessagePart[]): Promise<void> {
    for (const [conversationId, messages] of this.messagesByConversation) {
      this.messagesByConversation.set(
        conversationId,
        messages.map((message) => (message.id === messageId ? { ...message, parts } : message)),
      );
    }
  }

  async deleteAfter(conversationId: string, sequence: number): Promise<void> {
    const messages = this.messagesByConversation.get(conversationId) ?? [];
    this.messagesByConversation.set(
      conversationId,
      messages.filter((message) => message.sequence <= sequence),
    );
  }

  async listPage(
    conversationId: string,
    { beforeSequence = Infinity, limit, roles }: MessagePageRequest,
  ): Promise<MessagePage> {
    const candidates = (await this.listByConversation(conversationId)).filter(
      (message) => message.sequence < beforeSequence && (!roles || roles.includes(message.role)),
    );
    return {
      messages: candidates.slice(-limit),
      hasEarlier: candidates.length > limit,
    };
  }

  async findByConversation(conversationId: string): Promise<ConversationShare | null> {
    return this.sharesByConversation.get(conversationId) ?? null;
  }

  async createIfAbsent(conversationId: string, token: string): Promise<ConversationShare> {
    const existing = this.sharesByConversation.get(conversationId);
    if (existing) {
      return existing;
    }
    const share = { conversationId, token, createdAt: this.clock.now() };
    this.sharesByConversation.set(conversationId, share);
    return share;
  }

  async findSharedConversation(token: string): Promise<Conversation | null> {
    const share = [...this.sharesByConversation.values()].find((item) => item.token === token);
    return (share && this.conversationsById.get(share.conversationId)) ?? null;
  }

  async revoke(conversationId: string): Promise<void> {
    this.sharesByConversation.delete(conversationId);
  }

  private update(conversationId: string, changes: Partial<Conversation>): Conversation {
    const conversation = this.conversationsById.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversa não encontrada: ${conversationId}`);
    }
    const updated = { ...conversation, ...changes, updatedAt: this.clock.now() };
    this.conversationsById.set(conversationId, updated);
    return updated;
  }
}
