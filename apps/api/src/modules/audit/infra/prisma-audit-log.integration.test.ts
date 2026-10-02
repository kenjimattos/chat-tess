import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../infra/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaAuditLog } from './prisma-audit-log';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const auditLog = new PrismaAuditLog(database);
const ANA = '11111111-1111-4111-8111-111111111111';
const BIA = '22222222-2222-4222-8222-222222222222';

describe('PrismaAuditLog', () => {
  beforeEach(async () => {
    await resetDatabase(database);
    const at = (minute: number) => new Date(`2026-09-30T10:0${minute}:00Z`);
    await auditLog.record({
      type: 'auth.login_succeeded',
      actorUserId: ANA,
      payload: { email: 'a' },
      occurredAt: at(1),
    });
    await auditLog.record({
      type: 'message.sent',
      actorUserId: ANA,
      payload: {},
      occurredAt: at(2),
    });
    await auditLog.record({
      type: 'message.sent',
      actorUserId: BIA,
      payload: {},
      occurredAt: at(3),
    });
    await auditLog.record({
      type: 'auth.login_denied',
      actorUserId: null,
      payload: {},
      occurredAt: at(4),
    });
  });
  afterAll(() => database.$disconnect());

  it('grava e devolve os eventos, mais recentes primeiro', async () => {
    const entries = await auditLog.list({ limit: 10 });

    expect(entries.map(({ type }) => type)).toEqual([
      'auth.login_denied',
      'message.sent',
      'message.sent',
      'auth.login_succeeded',
    ]);
    expect(entries.at(-1)).toMatchObject({ actorUserId: ANA, payload: { email: 'a' } });
  });

  it('filtra por autor, tipo e instante', async () => {
    const entries = await auditLog.list({
      actorUserId: ANA,
      type: 'message.sent',
      before: new Date('2026-09-30T10:05:00Z'),
      limit: 10,
    });

    expect(entries).toHaveLength(1);
  });

  it('não exige que o autor exista: o registro sobrevive à exclusão do usuário', async () => {
    const entries = await auditLog.list({ actorUserId: BIA, limit: 10 });

    expect(entries).toHaveLength(1);
  });
});
