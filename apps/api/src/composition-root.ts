import type { Express } from 'express';
import { createApp } from './app';
import { createAgentModule } from './modules/agent/agent-module';
import { createAuditModule } from './modules/audit/audit-module';
import { createBillingModule } from './modules/billing/billing-module';
import { createAuthModule } from './modules/auth/auth-module';
import { createConversationsModule } from './modules/conversations/conversations-module';
import { createFilesModule } from './modules/files/files-module';
import { createRateLimitingModule } from './modules/rate-limiting/rate-limiting-module';
import { createToolsModule } from './modules/tools/tools-module';
import type { AppConfig } from './shared/config/env';
import { assertDatabaseIsReachable, createDatabase } from './shared/database/database';
import { InProcessEventBus } from './shared/events/in-process-event-bus';
import { createLogger, type Logger } from './shared/logging/logger';
import { systemClock } from './shared/time/clock';

export interface Application {
  app: Express;
  logger: Logger;
  /** Tarefas que precisam terminar antes de aceitar requisições. */
  initialize(): Promise<void>;
  shutDown(): Promise<void>;
}

/**
 * Único lugar onde a aplicação é montada. Cria a infraestrutura compartilhada,
 * instancia cada módulo e registra as rotas deles.
 * Para entender como as peças se conectam, comece por aqui.
 */
export function composeApplication(config: AppConfig): Application {
  const logger = createLogger(config.logging);
  const database = createDatabase(config.database.url, config.database.poolMax);
  const clock = systemClock;
  const events = new InProcessEventBus((error, event) =>
    logger.error({ err: error, eventType: event.type }, 'Falha ao processar evento de domínio'),
  );

  const shared = { database, events, clock };

  const auth = createAuthModule({ ...shared, config, logger });
  const { requireAuthentication } = auth;
  const rateLimiting = createRateLimitingModule({ ...shared, config: config.rateLimits });
  const conversations = createConversationsModule({ ...shared, requireAuthentication });
  const files = createFilesModule({
    ...shared,
    requireAuthentication,
    limitUploads: rateLimiting.limitUploads,
    conversations: conversations.conversations,
    storage: config.files.storage,
    maxSizeBytes: config.files.maxSizeBytes,
  });
  const audit = createAuditModule({ database, eventBus: events, requireAuthentication });
  const billing = createBillingModule({
    database,
    eventBus: events,
    clock,
    requireAuthentication,
    users: auth.users,
    defaultTokenLimit: config.billing.defaultTokenLimit,
  });
  const tools = createToolsModule({
    database,
    eventBus: events,
    clock,
    requireAuthentication,
    llmConfig: config.llm,
    toolsConfig: config.tools,
  });
  const agent = createAgentModule({
    ...shared,
    requireAuthentication,
    limitMessages: rateLimiting.limitMessages,
    llmConfig: config.llm,
    agentConfig: config.agent,
    conversations: conversations.conversations,
    messages: conversations.messages,
    attachments: files.attachmentCatalog,
    toolbox: tools.toolbox,
    usageLimiter: billing.usageLimiter,
  });

  const app = createApp({
    logger,
    apiRouters: [
      auth.router,
      conversations.router,
      files.router,
      agent.router,
      audit.router,
      billing.router,
      tools.router,
    ],
    readinessChecks: {
      database: () => assertDatabaseIsReachable(database),
    },
    webDistDir: config.web.distDir,
  });

  return {
    app,
    logger,
    initialize: async () => {
      await auth.seedAllowedEmails();
      await tools.syncCatalog();
    },
    shutDown: () => database.$disconnect(),
  };
}
