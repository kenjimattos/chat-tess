import { messagePartsSchema } from '@chat-tess/shared';
import type { Database } from '../../../shared/database/database';
import type {
  Message as MessageRecord,
  MessageRole as MessageRoleRecord,
  Prisma,
} from '../../../generated/prisma/client';
import type { Message, MessageRole } from '../domain/conversation';
import type { MessageRepository, NewMessage } from '../domain/ports';

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

  async listByConversation(conversationId: string): Promise<Message[]> {
    const records = await this.database.message.findMany({
      where: { conversationId },
      orderBy: { sequence: 'asc' },
    });
    return records.map(toMessage);
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
