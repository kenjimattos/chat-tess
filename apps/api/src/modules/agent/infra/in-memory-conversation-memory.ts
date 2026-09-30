import type {
  ConversationMemory,
  ConversationMemoryRepository,
  ConversationSummary,
} from '../domain/conversation-memory';

export class InMemoryConversationMemory implements ConversationMemoryRepository {
  private readonly memories = new Map<string, ConversationMemory>();

  async load(conversationId: string): Promise<ConversationMemory> {
    return this.memories.get(conversationId) ?? { summary: null, lastContextTokens: 0 };
  }

  async saveSummary(conversationId: string, summary: ConversationSummary): Promise<void> {
    this.memories.set(conversationId, { ...(await this.load(conversationId)), summary });
  }

  async recordContextTokens(conversationId: string, tokens: number): Promise<void> {
    this.memories.set(conversationId, {
      ...(await this.load(conversationId)),
      lastContextTokens: tokens,
    });
  }
}
