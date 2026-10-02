import type { Database } from '../../../infra/database/database';
import type { AllowedEmailRepository } from '../domain/ports';

export class PrismaAllowedEmailRepository implements AllowedEmailRepository {
  constructor(private readonly database: Database) {}

  async listPatterns(): Promise<string[]> {
    const records = await this.database.allowedEmail.findMany({
      select: { pattern: true },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => record.pattern);
  }

  async addPatterns(patterns: string[]): Promise<void> {
    await this.database.allowedEmail.createMany({
      data: patterns.map((pattern) => ({ pattern })),
      skipDuplicates: true,
    });
  }
}
