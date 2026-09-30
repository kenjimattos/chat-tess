import { randomUUID } from 'node:crypto';
import type { AuditEntry, AuditLog, AuditQuery } from '../domain/audit-entry';

export class InMemoryAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  async record(entry: Omit<AuditEntry, 'id'>): Promise<void> {
    this.entries.push({ ...entry, id: randomUUID() });
  }

  async list({ actorUserId, type, before, limit }: AuditQuery): Promise<AuditEntry[]> {
    return this.entries
      .filter((entry) => actorUserId === undefined || entry.actorUserId === actorUserId)
      .filter((entry) => type === undefined || entry.type === type)
      .filter((entry) => before === undefined || entry.occurredAt < before)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }
}
