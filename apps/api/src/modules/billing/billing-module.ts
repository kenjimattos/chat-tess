import type { RequestHandler, Router } from 'express';
import type { Database } from '../../infra/database/database';
import type { InProcessEventBus } from '../../infra/events/in-process-event-bus';
import type { Clock } from '../../shared/time/clock';
import type { LlmCallCompleted } from '../agent/domain/agent-events';
import type { UsageLimiter } from '../agent/domain/usage-limiter';
import type { UserRepository } from '../auth/domain/ports';
import { CreditGuard } from './application/credit-guard';
import { GetUsageSummary } from './application/get-usage-summary';
import { RecordLlmUsage } from './application/record-llm-usage';
import { SetCreditLimit } from './application/set-credit-limit';
import { createBillingRouter } from './http/billing-router';
import { PrismaUsageLedger } from './infra/prisma-usage-ledger';

export interface BillingModuleDependencies {
  database: Database;
  eventBus: InProcessEventBus;
  clock: Clock;
  requireAuthentication: RequestHandler;
  users: UserRepository;
  defaultTokenLimit: number;
}

export interface BillingModule {
  router: Router;
  /** Consultado pelo agente antes de cada turno. */
  usageLimiter: UsageLimiter;
}

export function createBillingModule(deps: BillingModuleDependencies): BillingModule {
  const ledger = new PrismaUsageLedger(deps.database, deps.defaultTokenLimit);
  const recordLlmUsage = new RecordLlmUsage(ledger);

  deps.eventBus.subscribe('llm.call_completed', (event) =>
    recordLlmUsage.execute(event as LlmCallCompleted),
  );

  return {
    router: createBillingRouter({
      requireAuthentication: deps.requireAuthentication,
      getUsageSummary: new GetUsageSummary(ledger),
      setCreditLimit: new SetCreditLimit(deps.users, ledger, deps.eventBus, deps.clock),
    }),
    usageLimiter: new CreditGuard(ledger, deps.eventBus, deps.clock),
  };
}
