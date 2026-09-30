import type { User } from '../../auth/domain/user';
import type { AuditEntry, AuditLog } from '../domain/audit-entry';

export const MAX_PAGE_SIZE = 100;

export interface ListAuditEventsInput {
  requester: User;
  /** Só administradores podem consultar eventos de outro usuário ou de todos. */
  actorUserId?: string;
  type?: string;
  before?: Date;
  limit?: number;
}

/**
 * Consulta a trilha de auditoria. Usuários comuns veem só os próprios eventos;
 * administradores veem todos e podem filtrar por usuário.
 */
export class ListAuditEvents {
  constructor(private readonly auditLog: AuditLog) {}

  execute({
    requester,
    actorUserId,
    type,
    before,
    limit = 50,
  }: ListAuditEventsInput): Promise<AuditEntry[]> {
    const isAdmin = requester.role === 'admin';

    return this.auditLog.list({
      actorUserId: isAdmin ? actorUserId : requester.id,
      type,
      before,
      limit: Math.min(Math.max(limit, 1), MAX_PAGE_SIZE),
    });
  }
}
