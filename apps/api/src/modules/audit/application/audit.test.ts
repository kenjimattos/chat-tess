import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../../auth/domain/user';
import { InMemoryAuditLog } from '../infra/in-memory-audit-log';
import { ListAuditEvents } from './list-audit-events';
import { RecordAuditEvent } from './record-audit-event';

const ana: User = {
  id: 'user-ana',
  email: 'ana@e.com',
  name: 'Ana',
  avatarUrl: null,
  role: 'user',
};
const admin: User = { ...ana, id: 'user-admin', role: 'admin' };

describe('auditoria', () => {
  let auditLog: InMemoryAuditLog;
  let record: RecordAuditEvent;
  let list: ListAuditEvents;

  beforeEach(async () => {
    auditLog = new InMemoryAuditLog();
    record = new RecordAuditEvent(auditLog);
    list = new ListAuditEvents(auditLog);

    const at = (minute: number) => new Date(`2026-09-30T10:0${minute}:00Z`);
    await record.execute({
      type: 'auth.login_succeeded',
      occurredAt: at(1),
      actorUserId: 'user-ana',
      payload: {},
    });
    await record.execute({
      type: 'message.sent',
      occurredAt: at(2),
      actorUserId: 'user-ana',
      payload: {},
    });
    await record.execute({
      type: 'message.sent',
      occurredAt: at(3),
      actorUserId: 'user-bia',
      payload: {},
    });
    await record.execute({
      type: 'auth.login_denied',
      occurredAt: at(4),
      actorUserId: null,
      payload: {},
    });
  });

  describe('RecordAuditEvent', () => {
    it('grava o evento com o conteúdo compactado', async () => {
      await record.execute({
        type: 'tool.executed',
        occurredAt: new Date('2026-09-30T11:00:00Z'),
        actorUserId: 'user-ana',
        payload: { output: 'x'.repeat(3000) },
      });

      const entry = auditLog.entries.at(-1);
      expect(entry).toMatchObject({ type: 'tool.executed', actorUserId: 'user-ana' });
      expect((entry?.payload as { output: string }).output.length).toBeLessThan(2100);
    });
  });

  describe('ListAuditEvents', () => {
    it('mostra ao usuário comum só os próprios eventos, mais recentes primeiro', async () => {
      const entries = await list.execute({ requester: ana });

      expect(entries.map(({ type }) => type)).toEqual(['message.sent', 'auth.login_succeeded']);
    });

    it('ignora o filtro de outro usuário quando quem pede não é administrador', async () => {
      const entries = await list.execute({ requester: ana, actorUserId: 'user-bia' });

      expect(entries.every(({ actorUserId }) => actorUserId === 'user-ana')).toBe(true);
    });

    it('mostra todos os eventos ao administrador, inclusive os sem autor', async () => {
      const entries = await list.execute({ requester: admin });

      expect(entries).toHaveLength(4);
      expect(entries[0]?.type).toBe('auth.login_denied');
    });

    it('permite ao administrador filtrar por usuário e por tipo', async () => {
      const entries = await list.execute({
        requester: admin,
        actorUserId: 'user-bia',
        type: 'message.sent',
      });

      expect(entries).toHaveLength(1);
    });

    it('pagina pelos eventos anteriores a um instante', async () => {
      const entries = await list.execute({
        requester: admin,
        before: new Date('2026-09-30T10:03:00Z'),
        limit: 1,
      });

      expect(entries.map(({ type }) => type)).toEqual(['message.sent']);
      expect(entries[0]?.actorUserId).toBe('user-ana');
    });

    it('limita o tamanho da página', async () => {
      const entries = await list.execute({ requester: admin, limit: 10_000 });

      expect(entries.length).toBeLessThanOrEqual(100);
    });
  });
});
