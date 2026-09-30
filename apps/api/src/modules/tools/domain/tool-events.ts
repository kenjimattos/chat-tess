import type { DomainEvent } from '../../../shared/events/domain-event';

export type ToolExecuted = DomainEvent<
  'tool.executed',
  {
    conversationId: string;
    callId: string;
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
    isError: boolean;
    durationMs: number;
  }
>;
