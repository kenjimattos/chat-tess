import type { Express } from 'express';
import { createApp } from './app';
import { createAuthModule } from './modules/auth/auth-module';
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
  const database = createDatabase(config.database.url);
  const clock = systemClock;
  const events = new InProcessEventBus((error, event) =>
    logger.error({ err: error, eventType: event.type }, 'Falha ao processar evento de domínio'),
  );

  const auth = createAuthModule({ config, database, events, clock, logger });

  const app = createApp({
    logger,
    apiRouters: [auth.router],
    readinessChecks: {
      database: () => assertDatabaseIsReachable(database),
    },
    webDistDir: config.web.distDir,
  });

  return {
    app,
    logger,
    initialize: () => auth.seedAllowedEmails(),
    shutDown: () => database.$disconnect(),
  };
}
