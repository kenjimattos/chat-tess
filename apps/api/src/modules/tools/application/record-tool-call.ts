import type { ToolCallLog } from '../domain/tool-call-log';
import type { ToolExecuted } from '../domain/tool-events';

/** Reage a cada execução de tool gravando entrada, saída, status e duração. */
export class RecordToolCall {
  constructor(private readonly log: ToolCallLog) {}

  async execute({ actorUserId, occurredAt, payload }: ToolExecuted): Promise<void> {
    if (!actorUserId) {
      return;
    }
    await this.log.record({ userId: actorUserId, occurredAt, ...payload });
  }
}
