import { remainingTokens, type UsageLedger, type UsageRecord } from '../domain/credit-account';

export interface UsageSummary {
  tokenLimit: number;
  tokensUsed: number;
  remainingTokens: number;
  recentUsage: UsageRecord[];
}

const RECENT_USAGE_COUNT = 20;

export class GetUsageSummary {
  constructor(private readonly ledger: UsageLedger) {}

  async execute(userId: string): Promise<UsageSummary> {
    const [account, recentUsage] = await Promise.all([
      this.ledger.accountOf(userId),
      this.ledger.recentUsage(userId, RECENT_USAGE_COUNT),
    ]);

    return {
      tokenLimit: account.tokenLimit,
      tokensUsed: account.tokensUsed,
      remainingTokens: remainingTokens(account),
      recentUsage,
    };
  }
}
