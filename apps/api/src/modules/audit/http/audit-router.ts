import { auditEventQuerySchema, type AuditEventResponse } from '@chat-tess/shared';
import { Router, type RequestHandler } from 'express';
import { authenticatedUser } from '../../auth/http/require-authentication';
import type { ListAuditEvents } from '../application/list-audit-events';

export interface AuditRouterOptions {
  requireAuthentication: RequestHandler;
  listAuditEvents: ListAuditEvents;
}

/**
 * GET /audit-events?type=&actorUserId=&before=&limit=
 * Trilha de auditoria. Usuários comuns veem só os próprios eventos.
 */
export function createAuditRouter({
  requireAuthentication,
  listAuditEvents,
}: AuditRouterOptions): Router {
  const router = Router();

  router.get('/audit-events', requireAuthentication, async (request, response) => {
    const query = auditEventQuerySchema.parse(request.query);
    const entries = await listAuditEvents.execute({
      requester: authenticatedUser(response),
      actorUserId: query.actorUserId,
      type: query.type,
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit,
    });

    const body: AuditEventResponse[] = entries.map((entry) => ({
      ...entry,
      occurredAt: entry.occurredAt.toISOString(),
    }));
    response.json(body);
  });

  return router;
}
