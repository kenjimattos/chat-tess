import type { TokenUsage } from '@chat-tess/shared';
import type { DomainEvent } from '../../../shared/events/domain-event';

export type LlmCallPurpose = 'chat' | 'compaction' | 'tool';

export type MessageSent = DomainEvent<
  'message.sent',
  { conversationId: string; messageId: string; attachmentCount: number }
>;

/** O usuário refez o último turno; `edited` diz se ele mudou o texto da mensagem antes. */
export type MessageResent = DomainEvent<
  'message.resent',
  { conversationId: string; messageId: string; edited: boolean }
>;

/** Uma chamada ao LLM terminou; base para o consumo de créditos. */
export type LlmCallCompleted = DomainEvent<
  'llm.call_completed',
  { conversationId: string; model: string; purpose: LlmCallPurpose; usage: TokenUsage }
>;

export type ConversationCompacted = DomainEvent<
  'conversation.compacted',
  { conversationId: string; summarizedMessageCount: number; coversUntilSequence: number }
>;

export type AgentTurnFailed = DomainEvent<
  'agent.turn_failed',
  { conversationId: string; errorCode: string; errorMessage: string }
>;

/** O turno parou à espera da autorização do usuário para estas chamadas de tool. */
export type ToolApprovalRequested = DomainEvent<
  'tool.approval_requested',
  {
    conversationId: string;
    calls: { callId: string; toolName: string; input: Record<string, unknown> }[];
  }
>;

export type ToolApprovalDecided = DomainEvent<
  'tool.approval_decided',
  { conversationId: string; approvedCallIds: string[]; deniedCallIds: string[] }
>;
