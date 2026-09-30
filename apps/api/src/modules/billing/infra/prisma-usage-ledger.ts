import type { Database } from '../../../shared/database/database';
import type {
  CreditAccount as CreditAccountRecord,
  UsagePurpose,
} from '../../../generated/prisma/client';
import type { LlmCallPurpose } from '../../agent/domain/agent-events';
import type { CreditAccount, UsageLedger, UsageRecord } from '../domain/credit-account';

const PURPOSE_TO_RECORD: Record<LlmCallPurpose, UsagePurpose> = {
  chat: 'CHAT',
  compaction: 'COMPACTION',
};

const RECORD_TO_PURPOSE: Partial<Record<UsagePurpose, LlmCallPurpose>> = {
  CHAT: 'chat',
  COMPACTION: 'compaction',
};

export class PrismaUsageLedger implements UsageLedger {
  constructor(
    private readonly database: Database,
    private readonly defaultTokenLimit: number,
  ) {}

  async accountOf(userId: string): Promise<CreditAccount> {
    const record = await this.database.creditAccount.upsert({
      where: { userId },
      create: { userId, tokenLimit: this.defaultTokenLimit },
      update: {},
    });
    return toAccount(record);
  }

  async record({
    userId,
    conversationId,
    model,
    purpose,
    usage,
    occurredAt,
  }: UsageRecord): Promise<void> {
    await this.database.$transaction([
      this.database.usageRecord.create({
        data: {
          userId,
          conversationId,
          model,
          purpose: PURPOSE_TO_RECORD[purpose],
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          createdAt: occurredAt,
        },
      }),
      // O incremento é feito pelo banco, então chamadas simultâneas não se perdem.
      this.database.creditAccount.upsert({
        where: { userId },
        create: { userId, tokenLimit: this.defaultTokenLimit, tokensUsed: usage.totalTokens },
        update: { tokensUsed: { increment: usage.totalTokens } },
      }),
    ]);
  }

  async setLimit(userId: string, tokenLimit: number): Promise<CreditAccount> {
    const record = await this.database.creditAccount.upsert({
      where: { userId },
      create: { userId, tokenLimit },
      update: { tokenLimit },
    });
    return toAccount(record);
  }

  async recentUsage(userId: string, limit: number): Promise<UsageRecord[]> {
    const records = await this.database.usageRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map((record) => ({
      userId: record.userId,
      conversationId: record.conversationId,
      model: record.model,
      purpose: RECORD_TO_PURPOSE[record.purpose] ?? 'chat',
      usage: {
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        totalTokens: record.totalTokens,
      },
      occurredAt: record.createdAt,
    }));
  }
}

function toAccount(record: CreditAccountRecord): CreditAccount {
  return {
    userId: record.userId,
    tokenLimit: Number(record.tokenLimit),
    tokensUsed: Number(record.tokensUsed),
  };
}
