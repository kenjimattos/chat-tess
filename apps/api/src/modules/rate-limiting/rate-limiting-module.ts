import type { RequestHandler } from 'express';
import type { RateLimitConfig } from '../../infra/config/env';
import type { Database } from '../../infra/database/database';
import type { EventPublisher } from '../../kernel/events/domain-event';
import type { Clock } from '../../kernel/time/clock';
import { ConsumeRateLimit } from './application/consume-rate-limit';
import { createRateLimit } from './http/rate-limit';
import { PrismaRateLimitCounter } from './infra/prisma-rate-limit-counter';

export interface RateLimitingModuleDependencies {
  database: Database;
  events: EventPublisher;
  clock: Clock;
  config: RateLimitConfig;
}

/** Middlewares de rate limit por usuário, entregues às rotas caras. */
export interface RateLimitingModule {
  limitMessages: RequestHandler;
  limitUploads: RequestHandler;
}

export function createRateLimitingModule(deps: RateLimitingModuleDependencies): RateLimitingModule {
  const consumeRateLimit = new ConsumeRateLimit(
    new PrismaRateLimitCounter(deps.database),
    deps.events,
    deps.clock,
  );

  return {
    limitMessages: createRateLimit(consumeRateLimit, {
      name: 'messages',
      limit: deps.config.messagesPerMinute,
      windowSeconds: 60,
    }),
    limitUploads: createRateLimit(consumeRateLimit, {
      name: 'uploads',
      limit: deps.config.uploadsPerMinute,
      windowSeconds: 60,
    }),
  };
}
