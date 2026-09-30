import type { TextPart, TokenUsage, ToolCallPart, ToolResultPart } from '@chat-tess/shared';

/**
 * Contrato entre o agente e qualquer provedor de LLM. O agente só conhece
 * estes tipos; o adapter de cada provedor traduz para o formato dele.
 */

export type AttachmentSource =
  { kind: 'uri'; uri: string } | { kind: 'inline'; base64Data: string };

/** Anexo já resolvido para envio: o provedor recebe o endereço ou o conteúdo. */
export interface LlmAttachmentPart {
  type: 'attachment';
  fileName: string;
  mimeType: string;
  source: AttachmentSource;
}

export type LlmContentPart = TextPart | LlmAttachmentPart | ToolCallPart | ToolResultPart;

export interface LlmMessage {
  role: 'user' | 'assistant' | 'tool';
  parts: LlmContentPart[];
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  /** JSON Schema dos argumentos. */
  inputSchema: Record<string, unknown>;
}

export interface LlmRequest {
  systemPrompt: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
}

export type LlmFinishReason = 'stop' | 'max_tokens' | 'blocked' | 'other';

export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; call: ToolCallPart }
  | { type: 'completed'; usage: TokenUsage; finishReason: LlmFinishReason };

export interface LlmProvider {
  /** Identificador do modelo, registrado no consumo. */
  readonly model: string;
  /**
   * Gera a resposta em stream. Termina sempre com um evento `completed`.
   * Lança `ContextWindowExceededError` quando a entrada não cabe no modelo.
   */
  stream(request: LlmRequest, signal?: AbortSignal): AsyncIterable<LlmStreamEvent>;
}
