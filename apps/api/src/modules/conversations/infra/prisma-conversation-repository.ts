import type { Database } from '../../../shared/database/database';
import type { Conversation as ConversationRecord } from '../../../generated/prisma/client';
import type { Conversation } from '../domain/conversation';
import type { ConversationRepository } from '../domain/ports';

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly database: Database) {}

  async create(userId: string, title: string): Promise<Conversation> {
    return toConversation(await this.database.conversation.create({ data: { userId, title } }));
  }

  async findOwned(conversationId: string, userId: string): Promise<Conversation | null> {
    const record = await this.database.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    return record && toConversation(record);
  }

  async listOwned(userId: string): Promise<Conversation[]> {
    const records = await this.database.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(toConversation);
  }

  async rename(conversationId: string, title: string): Promise<Conversation> {
    const record = await this.database.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
    return toConversation(record);
  }

  async delete(conversationId: string): Promise<void> {
    await this.database.conversation.delete({ where: { id: conversationId } });
  }
}

function toConversation(record: ConversationRecord): Conversation {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
