import { messagePartsSchema, type MessagePart } from '@chat-tess/shared';
import type { Database } from '../../../infra/database/database';
import type {
  Message as MessageRecord,
  MessageRole as MessageRoleRecord,
  Prisma,
} from '../../../generated/prisma/client';
import type { Message, MessageRole } from '../domain/conversation';
import type {
  MessagePage,
  MessagePageRequest,
  MessageRepository,
  NewMessage,
} from '../domain/ports';

const ROLE_TO_RECORD: Record<MessageRole, MessageRoleRecord> = {
  user: 'USER',
  assistant: 'ASSISTANT',
  tool: 'TOOL',
};

const RECORD_TO_ROLE: Record<MessageRoleRecord, MessageRole> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
};

export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly database: Database) {}

  async append(conversationId: string, { role, parts }: NewMessage): Promise<Message> {
    const record = await this.database.$transaction(async (transaction) => {
      // Trava a conversa: duas gravações simultâneas não podem pegar a mesma sequência.
      await transaction.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;

      const { _max } = await transaction.message.aggregate({
        where: { conversationId },
        _max: { sequence: true },
      });

      const created = await transaction.message.create({
        data: {
          conversationId,
          sequence: (_max.sequence ?? 0) + 1,
          role: ROLE_TO_RECORD[role],
          // As partes já foram validadas pelo schema; `output: unknown` das tools
          // é sempre serializável, mas o tipo do Prisma não consegue provar isso.
          parts: parts as Prisma.InputJsonValue,
        },
      });
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return created;
    });

    return toMessage(record);
  }

  async listByConversation(conversationId: string, afterSequence = 0): Promise<Message[]> {
    const records = await this.database.message.findMany({
      where: { conversationId, sequence: { gt: afterSequence } },
      orderBy: { sequence: 'asc' },
    });
    return records.map(toMessage);
  }

  async replaceParts(messageId: string, parts: MessagePart[]): Promise<void> {
    await this.database.message.update({
      where: { id: messageId },
      data: { parts: parts as Prisma.InputJsonValue },
    });
  }

  async deleteAfter(conversationId: string, sequence: number): Promise<void> {
    await this.database.message.deleteMany({
      where: { conversationId, sequence: { gt: sequence } },
    });
  }

  async listPage(
    conversationId: string,
    { beforeSequence, limit, roles }: MessagePageRequest,
  ): Promise<MessagePage> {
    // Busca uma mensagem além da página só para saber se há mais antigas.
    const records = await this.database.message.findMany({
      where: {
        conversationId,
        ...(beforeSequence !== undefined && { sequence: { lt: beforeSequence } }),
        ...(roles && { role: { in: roles.map((role) => ROLE_TO_RECORD[role]) } }),
      },
      orderBy: { sequence: 'desc' },
      take: limit + 1,
    });

    return {
      messages: records.slice(0, limit).reverse().map(toMessage),
      hasEarlier: records.length > limit,
    };
  }
}

function toMessage(record: MessageRecord): Message {
  return {
    id: record.id,
    conversationId: record.conversationId,
    sequence: record.sequence,
    role: RECORD_TO_ROLE[record.role],
    // O JSONB não tem tipo no banco; a validação garante o formato na leitura.
    parts: messagePartsSchema.parse(record.parts),
    createdAt: record.createdAt,
  };
}
