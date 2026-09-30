export interface AuditEntry {
  id: string;
  type: string;
  actorUserId: string | null;
  payload: unknown;
  occurredAt: Date;
}

export interface AuditQuery {
  /** Restringe aos eventos causados por este usuário. */
  actorUserId?: string;
  type?: string;
  /** Paginação: só eventos anteriores a este instante. */
  before?: Date;
  limit: number;
}

export interface AuditLog {
  record(entry: Omit<AuditEntry, 'id'>): Promise<void>;
  /** Mais recentes primeiro. */
  list(query: AuditQuery): Promise<AuditEntry[]>;
}
