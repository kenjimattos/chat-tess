import {
  resendLastMessageRequestSchema,
  sendMessageRequestSchema,
  type StreamEvent,
} from '@chat-tess/shared';
import { Router, type RequestHandler, type Response } from 'express';
import { openEventStream } from '../../../shared/http/event-stream';
import { authenticatedUser } from '../../auth/http/require-authentication';
import { conversationIdOf } from '../../conversations/http/conversations-router';
import type { RunAgentTurn } from '../application/run-agent-turn';

export interface MessagesRouterOptions {
  requireAuthentication: RequestHandler;
  /** Rate limit por usuário, aplicado antes de qualquer trabalho do agente. */
  rateLimit: RequestHandler;
  runAgentTurn: RunAgentTurn;
}

/**
 * As duas rotas devolvem a resposta do agente como Server-Sent Events. Erros
 * de validação respondem em JSON, antes de o stream começar.
 * - POST /conversations/:id/messages               envia uma mensagem
 * - POST /conversations/:id/messages/last/resend   refaz o último turno; com `text`, edita a
 *   última mensagem do usuário antes
 */
export function createMessagesRouter({
  requireAuthentication,
  rateLimit,
  runAgentTurn,
}: MessagesRouterOptions): Router {
  const router = Router();

  router.post(
    '/conversations/:conversationId/messages',
    requireAuthentication,
    rateLimit,
    async (request, response) => {
      const { text, attachmentIds } = sendMessageRequestSchema.parse(request.body);
      const disconnection = abortOnDisconnect(response);

      const replyStream = await runAgentTurn.start({
        userId: authenticatedUser(response).id,
        conversationId: conversationIdOf(request),
        text,
        attachmentIds,
        signal: disconnection.signal,
      });
      await streamReply(response, replyStream);
    },
  );

  router.post(
    '/conversations/:conversationId/messages/last/resend',
    requireAuthentication,
    rateLimit,
    async (request, response) => {
      const { text } = resendLastMessageRequestSchema.parse(request.body ?? {});
      const disconnection = abortOnDisconnect(response);

      const replyStream = await runAgentTurn.resend({
        userId: authenticatedUser(response).id,
        conversationId: conversationIdOf(request),
        text,
        signal: disconnection.signal,
      });
      await streamReply(response, replyStream);
    },
  );

  return router;
}

/** Avisa o agente quando o cliente fecha a conexão antes de a resposta terminar. */
function abortOnDisconnect(response: Response): AbortController {
  const disconnection = new AbortController();
  response.on('close', () => {
    if (!response.writableEnded) {
      disconnection.abort();
    }
  });
  return disconnection;
}

async function streamReply(response: Response, reply: AsyncIterable<StreamEvent>): Promise<void> {
  const eventStream = openEventStream(response);
  try {
    for await (const event of reply) {
      eventStream.send(event);
    }
  } finally {
    eventStream.close();
  }
}
