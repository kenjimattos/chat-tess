import type { Express } from 'express';
import { createApp } from './app';
import type { AppConfig } from './shared/config/env';
import { createLogger, type Logger } from './shared/logging/logger';

export interface Application {
  app: Express;
  logger: Logger;
}

/**
 * Único lugar onde adapters concretos são instanciados e injetados nos use cases.
 * Para entender como as peças se conectam, comece por aqui.
 */
export function composeApplication(config: AppConfig): Application {
  const logger = createLogger(config.logging);

  const app = createApp({
    logger,
    apiRouters: [],
    webDistDir: config.web.distDir,
  });

  return { app, logger };
}
