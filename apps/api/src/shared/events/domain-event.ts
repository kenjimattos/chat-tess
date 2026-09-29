/**
 * Fato relevante que aconteceu na aplicação. Use cases publicam eventos;
 * módulos como auditoria e billing reagem a eles sem serem chamados diretamente.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly occurredAt: Date;
  /** Usuário que causou o evento; `null` para eventos do sistema. */
  readonly actorUserId: string | null;
  readonly payload: TPayload;
}

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export type EventHandler = (event: DomainEvent) => Promise<void> | void;
