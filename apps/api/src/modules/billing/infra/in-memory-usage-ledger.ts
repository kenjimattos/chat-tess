import type { CreditAccount, UsageLedger, UsageRecord } from '../domain/credit-account';

export class InMemoryUsageLedger implements UsageLedger {
  private readonly accounts = new Map<string, CreditAccount>();
  readonly records: UsageRecord[] = [];

  constructor(private readonly defaultTokenLimit: number) {}

  async accountOf(userId: string): Promise<CreditAccount> {
    const account = this.accounts.get(userId) ?? {
      userId,
      tokenLimit: this.defaultTokenLimit,
      tokensUsed: 0,
    };
    this.accounts.set(userId, account);
    return { ...account };
  }

  async record(usage: UsageRecord): Promise<void> {
    const account = await this.accountOf(usage.userId);
    this.records.push(usage);
    this.accounts.set(usage.userId, {
      ...account,
      tokensUsed: account.tokensUsed + usage.usage.totalTokens,
    });
  }

  async setLimit(userId: string, tokenLimit: number): Promise<CreditAccount> {
    const account = { ...(await this.accountOf(userId)), tokenLimit };
    this.accounts.set(userId, account);
    return { ...account };
  }

  async recentUsage(userId: string, limit: number): Promise<UsageRecord[]> {
    return this.records
      .filter((record) => record.userId === userId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }
}
