import { randomUUID } from 'node:crypto';
import type { Clock } from '../../../shared/time/clock';
import type { Conversation, Message } from '../domain/conversation';
import type { ConversationRepository, MessageRepository, NewMessage } from '../domain/ports';

/**
 * Conversas e mensagens em memória, para testes. Implementa os dois ports
 * porque, como no banco, apagar uma conversa apaga as mensagens dela.
 */
export class InMemoryConversationStore implements ConversationRepository, MessageRepository {
  private readonly conversationsById = new Map<string, Conversation>();
  private readonly messagesByConversation = new Map<string, Message[]>();

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

  async listByConversation(conversationId: string): Promise<Message[]> {
    return [...(this.messagesByConversation.get(conversationId) ?? [])];
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
