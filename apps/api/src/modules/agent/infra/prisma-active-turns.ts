import type { Database } from '../../../infra/database/database';
import type { ActiveTurns, TurnReservation, TurnReservationResult } from '../domain/active-turns';

/**
 * Reservas de turno no Postgres, válidas entre as instâncias do Cloud Run.
 * A linha do usuário é travada durante a reserva, para que duas requisições
 * simultâneas não contem as mesmas reservas e passem as duas.
 */
export class PrismaActiveTurns implements ActiveTurns {
  constructor(private readonly database: Database) {}

  async tryAcquire(request: TurnReservation): Promise<TurnReservationResult> {
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM users WHERE id = ${request.userId}::uuid FOR UPDATE`;
      await transaction.activeTurn.deleteMany({
        where: { startedAt: { lt: request.staleBefore } },
      });

      const busy = await transaction.activeTurn.findUnique({
        where: { conversationId: request.conversationId },
      });
      if (busy) {
        return { status: 'conversation_busy' };
      }
      const activeForUser = await transaction.activeTurn.count({
        where: { userId: request.userId },
      });
      if (activeForUser >= request.maxPerUser) {
        return { status: 'user_limit_reached' };
      }

      const turn = await transaction.activeTurn.create({
        data: { userId: request.userId, conversationId: request.conversationId },
      });
      return { status: 'acquired', turnId: turn.id };
    });
  }

  async release(turnId: string): Promise<void> {
    await this.database.activeTurn.deleteMany({ where: { id: turnId } });
  }
}
