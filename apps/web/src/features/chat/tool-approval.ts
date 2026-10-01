import type { ConversationMessage, ToolCallPart } from '@chat-tess/shared';

/**
 * Chamadas de tool que esperam a decisão do usuário. O turno para logo depois
 * de gravar o pedido, então a espera é o fim do histórico: a última mensagem é
 * a do assistente, com as chamadas ainda sem resultado.
 */
export function callsAwaitingApproval(messages: readonly ConversationMessage[]): ToolCallPart[] {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== 'assistant') {
    return [];
  }
  return lastMessage.parts
    .filter((part) => part.type === 'tool_call')
    .filter((call) => call.requiresApproval);
}
