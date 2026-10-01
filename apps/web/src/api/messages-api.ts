import type { ResendLastMessageRequest, SendMessageRequest, StreamEvent } from '@chat-tess/shared';
import { readEventStream } from './event-stream-reader';
import { toApiError } from './http-client';

/**
 * Envia a mensagem e devolve os eventos da resposta conforme chegam.
 * Erros de validação (antes do stream) são lançados como `ApiError`.
 */
export function sendMessage(
  conversationId: string,
  message: SendMessageRequest,
  signal?: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>> {
  return openReplyStream(`/conversations/${conversationId}/messages`, message, signal);
}

/**
 * Refaz o último turno: a resposta à última mensagem do usuário é substituída
 * por uma nova. Com `text`, a mensagem é editada antes. Devolve os eventos como `sendMessage`.
 */
export function resendLastMessage(
  conversationId: string,
  request: ResendLastMessageRequest,
  signal?: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>> {
  return openReplyStream(`/conversations/${conversationId}/messages/last/resend`, request, signal);
}

async function openReplyStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    throw await toApiError(response);
  }
  return readEventStream(response.body);
}
