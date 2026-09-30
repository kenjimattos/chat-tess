import type { ToolPreferences } from '../domain/ports';

export class InMemoryToolPreferences implements ToolPreferences {
  private readonly settings = new Map<string, Map<string, boolean>>();

  async settingsOf(userId: string): Promise<Map<string, boolean>> {
    return new Map(this.settings.get(userId));
  }

  async set(userId: string, toolName: string, enabled: boolean): Promise<void> {
    const userSettings = this.settings.get(userId) ?? new Map<string, boolean>();
    userSettings.set(toolName, enabled);
    this.settings.set(userId, userSettings);
  }
}
