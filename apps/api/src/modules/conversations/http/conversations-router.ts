import {
  createConversationRequestSchema,
  renameConversationRequestSchema,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationShareResponse,
  type ConversationShareState,
  type ConversationSummary,
  type SharedConversation,
} from '@chat-tess/shared';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticatedUser } from '../../auth/http/require-authentication';
import type { CreateConversation } from '../application/create-conversation';
import type { DeleteConversation } from '../application/delete-conversation';
import type { GetConversation } from '../application/get-conversation';
import type { GetConversationShare } from '../application/get-conversation-share';
import type { ListConversations } from '../application/list-conversations';
import type { RenameConversation } from '../application/rename-conversation';
import type { RevokeConversationShare } from '../application/revoke-conversation-share';
import type { ShareConversation } from '../application/share-conversation';
import type { ViewSharedConversation } from '../application/view-shared-conversation';
import type { Conversation, Message } from '../domain/conversation';
import type { ConversationShare } from '../domain/conversation-share';
import { ConversationNotFoundError } from '../domain/conversation-errors';

export interface ConversationsRouterOptions {
  requireAuthentication: RequestHandler;
  createConversation: CreateConversation;
  listConversations: ListConversations;
  getConversation: GetConversation;
  renameConversation: RenameConversation;
  deleteConversation: DeleteConversation;
  shareConversation: ShareConversation;
  getConversationShare: GetConversationShare;
  revokeConversationShare: RevokeConversationShare;
  viewSharedConversation: ViewSharedConversation;
}

/**
 * Rotas de conversa, todas autenticadas:
 * - GET    /conversations       lista as conversas do usuário
 * - POST   /conversations       cria uma conversa
 * - GET    /conversations/:id   abre a conversa com o histórico
 * - PATCH  /conversations/:id   renomeia
 * - DELETE /conversations/:id   apaga
 * - GET    /conversations/:id/share   link atual da conversa, para o dono
 * - PUT    /conversations/:id/share   gera o link (ou devolve o existente)
 * - DELETE /conversations/:id/share   revoga o link
 * - GET    /shared/:token      conversa compartilhada, para qualquer usuário logado
 */
export function createConversationsRouter(options: ConversationsRouterOptions): Router {
  const router = Router();
  router.use(['/conversations', '/shared'], options.requireAuthentication);

  router.get('/conversations', async (_request, response) => {
    const conversations = await options.listConversations.execute(authenticatedUser(response).id);
    response.json(conversations.map(toSummary));
  });

  router.post('/conversations', async (request, response) => {
    const { title } = createConversationRequestSchema.parse(request.body ?? {});
    const conversation = await options.createConversation.execute(
      authenticatedUser(response).id,
      title,
    );
    response.status(201).json(toSummary(conversation));
  });

  router.get('/conversations/:conversationId', async (request, response) => {
    const { conversation, messages } = await options.getConversation.execute(
      conversationIdOf(request),
      authenticatedUser(response).id,
    );
    const detail: ConversationDetail = {
      conversation: toSummary(conversation),
      messages: messages.map(toMessageResponse),
    };
    response.json(detail);
  });

  router.patch('/conversations/:conversationId', async (request, response) => {
    const { title } = renameConversationRequestSchema.parse(request.body);
    const conversation = await options.renameConversation.execute({
      conversationId: conversationIdOf(request),
      userId: authenticatedUser(response).id,
      title,
    });
    response.json(toSummary(conversation));
  });

  router.delete('/conversations/:conversationId', async (request, response) => {
    await options.deleteConversation.execute(
      conversationIdOf(request),
      authenticatedUser(response).id,
    );
    response.status(204).end();
  });

  router.get('/conversations/:conversationId/share', async (request, response) => {
    const share = await options.getConversationShare.execute(
      conversationIdOf(request),
      authenticatedUser(response).id,
    );
    const state: ConversationShareState = { share: share && toShareResponse(share) };
    response.json(state);
  });

  router.put('/conversations/:conversationId/share', async (request, response) => {
    const share = await options.shareConversation.execute(
      conversationIdOf(request),
      authenticatedUser(response).id,
    );
    response.json(toShareResponse(share));
  });

  router.delete('/conversations/:conversationId/share', async (request, response) => {
    await options.revokeConversationShare.execute(
      conversationIdOf(request),
      authenticatedUser(response).id,
    );
    response.status(204).end();
  });

  router.get('/shared/:token', async (request, response) => {
    const { conversation, messages } = await options.viewSharedConversation.execute(
      String(request.params.token),
      authenticatedUser(response).id,
    );
    const shared: SharedConversation = {
      title: conversation.title,
      messages: messages.map(toMessageResponse),
    };
    response.json(shared);
  });

  return router;
}

/** Um id que não é UUID não pode existir; responde como conversa inexistente. */
export function conversationIdOf(request: Request): string {
  const conversationId = String(request.params.conversationId);
  if (!z.uuid().safeParse(conversationId).success) {
    throw new ConversationNotFoundError(conversationId);
  }
  return conversationId;
}

function toSummary(conversation: Conversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function toShareResponse(share: ConversationShare): ConversationShareResponse {
  return { token: share.token, createdAt: share.createdAt.toISOString() };
}

export function toMessageResponse(message: Message): ConversationMessage {
  return {
    id: message.id,
    sequence: message.sequence,
    role: message.role,
    parts: message.parts,
    createdAt: message.createdAt.toISOString(),
  };
}
