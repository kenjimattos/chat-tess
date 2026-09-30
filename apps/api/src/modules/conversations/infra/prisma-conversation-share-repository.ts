import type { Database } from '../../../shared/database/database';
import type { Conversation } from '../domain/conversation';
import type { ConversationShare } from '../domain/conversation-share';
import type { ConversationShareRepository } from '../domain/ports';

export class PrismaConversationShareRepository implements ConversationShareRepository {
  constructor(private readonly database: Database) {}

  async findByConversation(conversationId: string): Promise<ConversationShare | null> {
    return this.database.conversationShare.findUnique({ where: { conversationId } });
  }

  async createIfAbsent(conversationId: string, token: string): Promise<ConversationShare> {
    // Com `update` vazio, o upsert mantém o link existente: dois pedidos
    // simultâneos terminam com o mesmo token, sem erro de chave duplicada.
    return this.database.conversationShare.upsert({
      where: { conversationId },
      create: { conversationId, token },
      update: {},
    });
  }

  async findSharedConversation(token: string): Promise<Conversation | null> {
    const share = await this.database.conversationShare.findUnique({
      where: { token },
      include: { conversation: true },
    });
    if (!share) {
      return null;
    }
    const { id, userId, title, createdAt, updatedAt } = share.conversation;
    return { id, userId, title, createdAt, updatedAt };
  }

  async revoke(conversationId: string): Promise<void> {
    await this.database.conversationShare.deleteMany({ where: { conversationId } });
  }
}
