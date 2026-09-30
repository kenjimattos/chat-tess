import type { RequestHandler, Router } from 'express';
import type { Database } from '../../shared/database/database';
import type { InProcessEventBus } from '../../shared/events/in-process-event-bus';
import { ListAuditEvents } from './application/list-audit-events';
import { RecordAuditEvent } from './application/record-audit-event';
import { createAuditRouter } from './http/audit-router';
import { PrismaAuditLog } from './infra/prisma-audit-log';

export interface AuditModuleDependencies {
  database: Database;
  eventBus: InProcessEventBus;
  requireAuthentication: RequestHandler;
}

export interface AuditModule {
  router: Router;
}

/** Registra na trilha de auditoria todo evento de domínio publicado na aplicação. */
export function createAuditModule({
  database,
  eventBus,
  requireAuthentication,
}: AuditModuleDependencies): AuditModule {
  const auditLog = new PrismaAuditLog(database);
  const recordAuditEvent = new RecordAuditEvent(auditLog);

  eventBus.subscribeToAll((event) => recordAuditEvent.execute(event));

  return {
    router: createAuditRouter({
      requireAuthentication,
      listAuditEvents: new ListAuditEvents(auditLog),
    }),
  };
}
