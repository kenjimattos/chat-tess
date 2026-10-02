import cookieParser from 'cookie-parser';
import express, { type Express, type Router } from 'express';
import { pinoHttp } from 'pino-http';
import { apiNotFoundHandler, createErrorHandler } from './http/error-handler';
import { createHealthRouter, type ReadinessCheck } from './http/health-router';
import { createWebAppRouter } from './http/web-app';
import type { Logger } from './infra/logging/logger';

export interface AppOptions {
  logger: Logger;
  /** Routers dos módulos, montados sob /api. */
  apiRouters: Router[];
  readinessChecks: Record<string, ReadinessCheck>;
  webDistDir?: string;
}

export function createApp({
  logger,
  apiRouters,
  readinessChecks,
  webDistDir,
}: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  // O Cloud Run fica atrás de um proxy; necessário para cookies seguros e IP do cliente.
  app.set('trust proxy', true);

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api', createHealthRouter({ readinessChecks }), ...apiRouters, apiNotFoundHandler);

  if (webDistDir) {
    app.use(createWebAppRouter(webDistDir));
  }

  app.use(createErrorHandler(logger));

  return app;
}
