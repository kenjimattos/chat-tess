import express, { type Express, type Router } from 'express';
import { pinoHttp } from 'pino-http';
import { apiNotFoundHandler, createErrorHandler } from './shared/http/error-handler';
import { createHealthRouter } from './shared/http/health-router';
import { createWebAppRouter } from './shared/http/web-app';
import type { Logger } from './shared/logging/logger';

export interface AppOptions {
  logger: Logger;
  /** Routers dos módulos, montados sob /api. */
  apiRouters: Router[];
  webDistDir?: string;
}

export function createApp({ logger, apiRouters, webDistDir }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  // O Cloud Run fica atrás de um proxy; necessário para cookies seguros e IP do cliente.
  app.set('trust proxy', true);

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', createHealthRouter(), ...apiRouters, apiNotFoundHandler);

  if (webDistDir) {
    app.use(createWebAppRouter(webDistDir));
  }

  app.use(createErrorHandler(logger));

  return app;
}
