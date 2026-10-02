import { AppError } from '../../../kernel/errors/app-error';

/**
 * Turnos em andamento. Um turno por conversa evita respostas intercaladas no
 * histórico; o limite por usuário evita que turnos paralelos passem juntos
 * pela conferência de crédito.
 */
export interface ActiveTurns {
  /** Reserva o turno de forma atômica, mesmo com várias instâncias da API. */
  tryAcquire(request: TurnReservation): Promise<TurnReservationResult>;
  release(turnId: string): Promise<void>;
}

export interface TurnReservation {
  userId: string;
  conversationId: string;
  maxPerUser: number;
  /** Reservas mais antigas que isto são de instâncias que caíram e são descartadas. */
  staleBefore: Date;
}

export type TurnReservationResult =
  | { status: 'acquired'; turnId: string }
  | { status: 'conversation_busy' }
  | { status: 'user_limit_reached' };

/** Maior duração esperada de um turno; depois disso a reserva é considerada abandonada. */
export const STALE_TURN_AFTER_MS = 15 * 60 * 1000;

export class TurnInProgressError extends AppError {
  constructor() {
    super(
      'conflict',
      'turn_in_progress',
      'Esta conversa ainda está respondendo a mensagem anterior. Aguarde a resposta terminar.',
    );
  }
}

export class TooManyActiveTurnsError extends AppError {
  constructor(maxPerUser: number) {
    super(
      'conflict',
      'too_many_active_turns',
      `Você já tem ${maxPerUser} respostas em andamento. Aguarde uma delas terminar.`,
      { maxPerUser },
    );
  }
}
