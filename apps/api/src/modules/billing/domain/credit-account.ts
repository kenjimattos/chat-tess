import type { TokenUsage } from '@chat-tess/shared';
import type { LlmCallPurpose } from '../../agent/domain/agent-events';

/** Cap de tokens do usuário e quanto já foi consumido. */
export interface CreditAccount {
  userId: string;
  tokenLimit: number;
  tokensUsed: number;
}

export function remainingTokens(account: CreditAccount): number {
  return Math.max(account.tokenLimit - account.tokensUsed, 0);
}

export function hasCredit(account: CreditAccount): boolean {
  return account.tokensUsed < account.tokenLimit;
}

/** Uma chamada ao LLM, como registrada no consumo. */
export interface UsageRecord {
  userId: string;
  conversationId: string | null;
  model: string;
  purpose: LlmCallPurpose;
  usage: TokenUsage;
  occurredAt: Date;
}

export interface UsageLedger {
  /** Devolve a conta do usuário, criando-a com o limite padrão no primeiro uso. */
  accountOf(userId: string): Promise<CreditAccount>;
  /** Registra a chamada e soma os tokens ao consumo da conta, de forma atômica. */
  record(usage: UsageRecord): Promise<void>;
  setLimit(userId: string, tokenLimit: number): Promise<CreditAccount>;
  /** Chamadas mais recentes primeiro. */
  recentUsage(userId: string, limit: number): Promise<UsageRecord[]>;
}
