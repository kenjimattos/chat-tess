import { randomUUID } from 'node:crypto';
import type { ActiveTurns, TurnReservation, TurnReservationResult } from '../domain/active-turns';

interface Reservation {
  userId: string;
  conversationId: string;
  startedAt: Date;
}

/** Dublê em memória de `ActiveTurns` para testes. */
export class InMemoryActiveTurns implements ActiveTurns {
  private readonly reservations = new Map<string, Reservation>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async tryAcquire(request: TurnReservation): Promise<TurnReservationResult> {
    for (const [turnId, reservation] of this.reservations) {
      if (reservation.startedAt < request.staleBefore) {
        this.reservations.delete(turnId);
      }
    }

    const active = [...this.reservations.values()];
    if (active.some(({ conversationId }) => conversationId === request.conversationId)) {
      return { status: 'conversation_busy' };
    }
    if (active.filter(({ userId }) => userId === request.userId).length >= request.maxPerUser) {
      return { status: 'user_limit_reached' };
    }

    const turnId = randomUUID();
    this.reservations.set(turnId, {
      userId: request.userId,
      conversationId: request.conversationId,
      startedAt: this.now(),
    });
    return { status: 'acquired', turnId };
  }

  async release(turnId: string): Promise<void> {
    this.reservations.delete(turnId);
  }

  get activeCount(): number {
    return this.reservations.size;
  }
}
