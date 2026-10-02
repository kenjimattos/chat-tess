import type { Database } from '../../../infra/database/database';
import type {
  ConversationMemory,
  ConversationMemoryRepository,
  ConversationSummary,
} from '../domain/conversation-memory';

/**
 * Cada compactação grava um novo resumo; o vigente é o que cobre mais
 * mensagens. Os anteriores ficam como histórico.
 */
export class PrismaConversationMemory implements ConversationMemoryRepository {
  constructor(private readonly database: Database) {}

  async load(conversationId: string): Promise<ConversationMemory> {
    const [conversation, latestSummary] = await Promise.all([
      this.database.conversation.findUnique({
        where: { id: conversationId },
        select: { lastContextTokens: true },
      }),
      this.database.conversationSummary.findFirst({
        where: { conversationId },
        orderBy: { coversUntilSequence: 'desc' },
      }),
    ]);

    return {
      lastContextTokens: conversation?.lastContextTokens ?? 0,
      summary: latestSummary && {
        content: latestSummary.content,
        coversUntilSequence: latestSummary.coversUntilSequence,
        summarizedMessageCount: latestSummary.summarizedMessageCount,
      },
    };
  }

  async saveSummary(conversationId: string, summary: ConversationSummary): Promise<void> {
    await this.database.conversationSummary.create({ data: { conversationId, ...summary } });
  }

  async recordContextTokens(conversationId: string, tokens: number): Promise<void> {
    await this.database.conversation.update({
      where: { id: conversationId },
      data: { lastContextTokens: tokens },
    });
  }
}
