import type { MessagePart, ToolCallPart, ToolResultPart } from '@chat-tess/shared';

/**
 * Autorização do usuário para chamadas de tool. Quando o LLM pede uma tool que
 * depende dela, o turno grava o pedido e para. A decisão chega em outra
 * requisição, que retoma o turno: o estado da espera é o próprio histórico, cuja
 * última mensagem é a do assistente com chamadas ainda sem resultado.
 */

export const DENIED_BY_USER = 'O usuário não autorizou esta ação.';

export const LEFT_UNANSWERED =
  'Não executada: o usuário enviou outra mensagem antes de esta ação ser autorizada ou concluída.';

/** As chamadas de tool de uma mensagem do assistente. */
export function toolCallsIn(parts: readonly MessagePart[]): ToolCallPart[] {
  return parts.filter((part) => part.type === 'tool_call');
}

/** Resultado que o LLM recebe no lugar da execução de uma chamada que não aconteceu. */
export function notExecuted(call: ToolCallPart, reason: string): ToolResultPart {
  return {
    type: 'tool_result',
    callId: call.callId,
    toolName: call.toolName,
    output: reason,
    isError: true,
  };
}
