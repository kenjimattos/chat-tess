import type { DomainEvent } from '../../../kernel/events/domain-event';
import { compactPayload } from '../domain/audit-payload';
import type { AuditLog } from '../domain/audit-entry';

/** Grava qualquer evento de domínio na trilha de auditoria. */
export class RecordAuditEvent {
  constructor(private readonly auditLog: AuditLog) {}

  execute(event: DomainEvent): Promise<void> {
    return this.auditLog.record({
      type: event.type,
      actorUserId: event.actorUserId,
      payload: compactPayload(event.payload),
      occurredAt: event.occurredAt,
    });
  }
}
