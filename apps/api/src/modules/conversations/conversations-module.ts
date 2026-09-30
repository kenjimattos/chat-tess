import type { RequestHandler, Router } from 'express';
import type { Database } from '../../shared/database/database';
import type { EventPublisher } from '../../shared/events/domain-event';
import type { Clock } from '../../shared/time/clock';
import { CreateConversation } from './application/create-conversation';
import { DeleteConversation } from './application/delete-conversation';
import { GetConversation } from './application/get-conversation';
import { GetConversationShare } from './application/get-conversation-share';
import { ListConversations } from './application/list-conversations';
import { RenameConversation } from './application/rename-conversation';
import { RevokeConversationShare } from './application/revoke-conversation-share';
import { ShareConversation } from './application/share-conversation';
import { ViewSharedConversation } from './application/view-shared-conversation';
import type {
  ConversationRepository,
  ConversationShareRepository,
  MessageRepository,
} from './domain/ports';
import { createConversationsRouter } from './http/conversations-router';
import { PrismaConversationRepository } from './infra/prisma-conversation-repository';
import { PrismaConversationShareRepository } from './infra/prisma-conversation-share-repository';
import { PrismaMessageRepository } from './infra/prisma-message-repository';

export interface ConversationsModuleDependencies {
  database: Database;
  events: EventPublisher;
  clock: Clock;
  requireAuthentication: RequestHandler;
}

export interface ConversationsModule {
  router: Router;
  /** Usados pelo módulo do agente para ler e gravar o histórico. */
  conversations: ConversationRepository;
  messages: MessageRepository;
  /** Usado pelo módulo de arquivos para liberar os anexos de uma conversa compartilhada. */
  shares: ConversationShareRepository;
}

export function createConversationsModule({
  database,
  events,
  clock,
  requireAuthentication,
}: ConversationsModuleDependencies): ConversationsModule {
  const conversations = new PrismaConversationRepository(database);
  const messages = new PrismaMessageRepository(database);
  const shares = new PrismaConversationShareRepository(database);

  return {
    router: createConversationsRouter({
      requireAuthentication,
      createConversation: new CreateConversation(conversations, events, clock),
      listConversations: new ListConversations(conversations),
      getConversation: new GetConversation(conversations, messages),
      renameConversation: new RenameConversation(conversations, events, clock),
      deleteConversation: new DeleteConversation(conversations, events, clock),
      shareConversation: new ShareConversation(conversations, shares, events, clock),
      getConversationShare: new GetConversationShare(conversations, shares),
      revokeConversationShare: new RevokeConversationShare(conversations, shares, events, clock),
      viewSharedConversation: new ViewSharedConversation(shares, messages, events, clock),
    }),
    conversations,
    messages,
    shares,
  };
}
