import { sendMessageRequestSchema } from '@chat-tess/shared';
import { Router, type RequestHandler } from 'express';
import { openEventStream } from '../../../shared/http/event-stream';
import { authenticatedUser } from '../../auth/http/require-authentication';
import { conversationIdOf } from '../../conversations/http/conversations-router';
import type { RunAgentTurn } from '../application/run-agent-turn';

export interface MessagesRouterOptions {
  requireAuthentication: RequestHandler;
  runAgentTurn: RunAgentTurn;
}

/**
 * POST /conversations/:id/messages
 * Envia uma mensagem e devolve a resposta do agente como Server-Sent Events.
 * Erros de validação respondem em JSON, antes de o stream começar.
 */
export function createMessagesRouter({
  requireAuthentication,
  runAgentTurn,
}: MessagesRouterOptions): Router {
  const router = Router();

  router.post(
    '/conversations/:conversationId/messages',
    requireAuthentication,
    async (request, response) => {
      const { text, attachmentIds } = sendMessageRequestSchema.parse(request.body);
      const disconnection = new AbortController();
      response.on('close', () => {
        if (!response.writableEnded) {
          disconnection.abort();
        }
      });

      const replyStream = await runAgentTurn.start({
        userId: authenticatedUser(response).id,
        conversationId: conversationIdOf(request),
        text,
        attachmentIds,
        signal: disconnection.signal,
      });

      const eventStream = openEventStream(response);
      try {
        for await (const event of replyStream) {
          eventStream.send(event);
        }
      } finally {
        eventStream.close();
      }
    },
  );

  return router;
}
