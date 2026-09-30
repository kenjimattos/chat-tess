import type { SendMessageRequest, StreamEvent } from '@chat-tess/shared';
import { readEventStream } from './event-stream-reader';
import { toApiError } from './http-client';

/**
 * Envia a mensagem e devolve os eventos da resposta conforme chegam.
 * Erros de validação (antes do stream) são lançados como `ApiError`.
 */
export async function sendMessage(
  conversationId: string,
  message: SendMessageRequest,
  signal?: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>> {
  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(message),
    signal,
  });
  if (!response.ok || !response.body) {
    throw await toApiError(response);
  }
  return readEventStream(response.body);
}
