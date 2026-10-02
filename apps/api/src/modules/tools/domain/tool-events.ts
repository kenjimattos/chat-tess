import type { DomainEvent } from '../../../kernel/events/domain-event';

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

export type ToolPreferenceChanged = DomainEvent<
  'tool.preference_changed',
  { toolName: string; enabled: boolean }
>;
