import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import { silentLogger } from '../../../shared/logging/logger';
import {
  TEST_ROLE_HEADER,
  TEST_USER_HEADER,
  fakeRequireAuthentication,
} from '../../auth/http/fake-authentication.test-support';
import { ListAuditEvents } from '../application/list-audit-events';
import { InMemoryAuditLog } from '../infra/in-memory-audit-log';
import { createAuditRouter } from './audit-router';

describe('GET /api/audit-events', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    const auditLog = new InMemoryAuditLog();
    await auditLog.record({
      type: 'message.sent',
      actorUserId: 'ana',
      payload: { n: 1 },
      occurredAt: new Date('2026-09-30T10:00:00Z'),
    });
    await auditLog.record({
      type: 'message.sent',
      actorUserId: 'bia',
      payload: { n: 2 },
      occurredAt: new Date('2026-09-30T10:01:00Z'),
    });
    const router = createAuditRouter({
      requireAuthentication: fakeRequireAuthentication,
      listAuditEvents: new ListAuditEvents(auditLog),
    });
    app = createApp({ logger: silentLogger, apiRouters: [router], readinessChecks: {} });
  });

  it('devolve ao usuário os próprios eventos', async () => {
    const response = await request(app).get('/api/audit-events').set(TEST_USER_HEADER, 'ana');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: expect.any(String),
        type: 'message.sent',
        actorUserId: 'ana',
        payload: { n: 1 },
        occurredAt: '2026-09-30T10:00:00.000Z',
      },
    ]);
  });

  it('devolve todos os eventos ao administrador', async () => {
    const response = await request(app)
      .get('/api/audit-events')
      .set(TEST_USER_HEADER, 'admin')
      .set(TEST_ROLE_HEADER, 'admin');

    expect(response.body).toHaveLength(2);
  });

  it('recusa filtros inválidos', async () => {
    const response = await request(app)
      .get('/api/audit-events?before=ontem')
      .set(TEST_USER_HEADER, 'ana');

    expect(response.status).toBe(400);
  });
});
