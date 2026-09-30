import type { Database } from '../../../shared/database/database';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuditEntry, AuditLog, AuditQuery } from '../domain/audit-entry';

export class PrismaAuditLog implements AuditLog {
  constructor(private readonly database: Database) {}

  async record({ type, actorUserId, payload, occurredAt }: Omit<AuditEntry, 'id'>): Promise<void> {
    await this.database.auditEvent.create({
      // O conteúdo vem de eventos de domínio, sempre serializáveis em JSON.
      data: { type, actorUserId, payload: (payload ?? {}) as Prisma.InputJsonValue, occurredAt },
    });
  }

  async list({ actorUserId, type, before, limit }: AuditQuery): Promise<AuditEntry[]> {
    const records = await this.database.auditEvent.findMany({
      where: {
        ...(actorUserId !== undefined && { actorUserId }),
        ...(type !== undefined && { type }),
        ...(before !== undefined && { occurredAt: { lt: before } }),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return records.map(({ id, type: eventType, actorUserId: actor, payload, occurredAt }) => ({
      id,
      type: eventType,
      actorUserId: actor,
      payload,
      occurredAt,
    }));
  }
}
