import type { RequestHandler, Router } from 'express';
import type { Database } from '../../shared/database/database';
import type { EventPublisher } from '../../shared/events/domain-event';
import type { Clock } from '../../shared/time/clock';
import { CreateConversation } from './application/create-conversation';
import { DeleteConversation } from './application/delete-conversation';
import { GetConversation } from './application/get-conversation';
import { ListConversations } from './application/list-conversations';
import { RenameConversation } from './application/rename-conversation';
import type { ConversationRepository, MessageRepository } from './domain/ports';
import { createConversationsRouter } from './http/conversations-router';
import { PrismaConversationRepository } from './infra/prisma-conversation-repository';
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
}

export function createConversationsModule({
  database,
  events,
  clock,
  requireAuthentication,
}: ConversationsModuleDependencies): ConversationsModule {
  const conversations = new PrismaConversationRepository(database);
  const messages = new PrismaMessageRepository(database);

  return {
    router: createConversationsRouter({
      requireAuthentication,
      createConversation: new CreateConversation(conversations, events, clock),
      listConversations: new ListConversations(conversations),
      getConversation: new GetConversation(conversations, messages),
      renameConversation: new RenameConversation(conversations, events, clock),
      deleteConversation: new DeleteConversation(conversations, events, clock),
    }),
    conversations,
    messages,
  };
}
