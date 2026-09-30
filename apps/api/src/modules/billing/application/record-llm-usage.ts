import type { LlmCallCompleted } from '../../agent/domain/agent-events';
import type { UsageLedger } from '../domain/credit-account';

/** Reage a cada chamada ao LLM: registra o consumo e o soma à conta do usuário. */
export class RecordLlmUsage {
  constructor(private readonly ledger: UsageLedger) {}

  async execute(event: LlmCallCompleted): Promise<void> {
    if (!event.actorUserId) {
      return;
    }
    await this.ledger.record({
      userId: event.actorUserId,
      conversationId: event.payload.conversationId,
      model: event.payload.model,
      purpose: event.payload.purpose,
      usage: event.payload.usage,
      occurredAt: event.occurredAt,
    });
  }
}
