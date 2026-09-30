import type { Database } from '../../../shared/database/database';
import type { ToolPreferences } from '../domain/ports';

export class PrismaToolPreferences implements ToolPreferences {
  constructor(private readonly database: Database) {}

  async settingsOf(userId: string): Promise<Map<string, boolean>> {
    const records = await this.database.userToolSetting.findMany({ where: { userId } });
    return new Map(records.map(({ toolName, enabled }) => [toolName, enabled]));
  }

  async set(userId: string, toolName: string, enabled: boolean): Promise<void> {
    await this.database.userToolSetting.upsert({
      where: { userId_toolName: { userId, toolName } },
      create: { userId, toolName, enabled },
      update: { enabled },
    });
  }
}
