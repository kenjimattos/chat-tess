import { AppError } from '../../../shared/errors/app-error';
import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import type { ToolPreferences } from '../domain/ports';
import type { ToolPreferenceChanged } from '../domain/tool-events';
import type { ToolRegistry } from './tool-registry';

export interface SetToolEnabledInput {
  userId: string;
  toolName: string;
  enabled: boolean;
}

/** Liga ou desliga uma tool para o usuário. */
export class SetToolEnabled {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly preferences: ToolPreferences,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute({ userId, toolName, enabled }: SetToolEnabledInput): Promise<void> {
    const catalog = await this.registry.catalogFor(userId);
    if (!catalog.some(({ tool }) => tool.name === toolName)) {
      throw new AppError('not_found', 'tool_not_found', `A tool "${toolName}" não existe.`);
    }

    await this.preferences.set(userId, toolName, enabled);
    await this.events.publish({
      type: 'tool.preference_changed',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: { toolName, enabled },
    } satisfies ToolPreferenceChanged);
  }
}
