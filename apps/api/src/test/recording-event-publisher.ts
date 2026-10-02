import type { DomainEvent, EventPublisher } from '../kernel/events/domain-event';

/** Guarda os eventos publicados, para que os testes verifiquem o que aconteceu. */
export class RecordingEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }

  ofType(type: string): DomainEvent[] {
    return this.events.filter((event) => event.type === type);
  }
}
