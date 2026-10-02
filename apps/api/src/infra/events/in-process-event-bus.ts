import type { DomainEvent, EventHandler, EventPublisher } from '../../kernel/events/domain-event';

export type HandlerFailureReporter = (error: unknown, event: DomainEvent) => void;

const ALL_EVENTS = '*';

/**
 * Event bus síncrono em memória. Uma falha em um handler é reportada e não
 * interrompe os demais handlers nem o use case que publicou o evento.
 */
export class InProcessEventBus implements EventPublisher {
  private readonly handlersByType = new Map<string, EventHandler[]>();

  constructor(private readonly reportHandlerFailure: HandlerFailureReporter) {}

  subscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.handlersByType.get(eventType) ?? [];
    this.handlersByType.set(eventType, [...handlers, handler]);
  }

  subscribeToAll(handler: EventHandler): void {
    this.subscribe(ALL_EVENTS, handler);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = [
      ...(this.handlersByType.get(event.type) ?? []),
      ...(this.handlersByType.get(ALL_EVENTS) ?? []),
    ];

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.reportHandlerFailure(error, event);
      }
    }
  }
}
