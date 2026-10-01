import type { ToolCallPart, ToolResultPart } from '@chat-tess/shared';
import type { LlmToolDefinition } from './llm';

export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
  signal?: AbortSignal;
}

/** O que o agente precisa saber sobre tools; o registro fica no módulo de tools. */
export interface Toolbox {
  /** Tools disponíveis para o usuário neste momento. */
  definitionsFor(userId: string): Promise<LlmToolDefinition[]>;
  /** A chamada só pode executar depois de o usuário autorizar. */
  requiresApproval(call: ToolCallPart, context: ToolExecutionContext): Promise<boolean>;
  /** Executa a chamada. Falhas voltam como resultado com `isError`, nunca como exceção. */
  execute(call: ToolCallPart, context: ToolExecutionContext): Promise<ToolResultPart>;
}
