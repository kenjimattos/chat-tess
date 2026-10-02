import type { EventPublisher } from '../../../kernel/events/domain-event';
import type { Clock } from '../../../kernel/time/clock';
import {
  RateLimitExceededError,
  windowStartOf,
  type RateLimitCounter,
  type RateLimitExceeded,
  type RateLimitPolicy,
} from '../domain/rate-limit';

/**
 * Conta uma requisição do usuário na política e recusa as que passam do
 * limite. Só a primeira recusa de cada janela vai para a auditoria, para que
 * um cliente insistente não encha a trilha.
 */
export class ConsumeRateLimit {
  constructor(
    private readonly counter: RateLimitCounter,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(policy: RateLimitPolicy, userId: string): Promise<void> {
    const now = this.clock.now();
    const windowStart = windowStartOf(now, policy.windowSeconds);
    const count = await this.counter.increment(`${policy.name}:${userId}`, windowStart);
    if (count <= policy.limit) {
      return;
    }

    if (count === policy.limit + 1) {
      await this.events.publish({
        type: 'rate_limit.exceeded',
        occurredAt: now,
        actorUserId: userId,
        payload: {
          policy: policy.name,
          limit: policy.limit,
          windowSeconds: policy.windowSeconds,
        },
      } satisfies RateLimitExceeded);
    }

    const windowEndsAt = windowStart.getTime() + policy.windowSeconds * 1000;
    throw new RateLimitExceededError(Math.ceil((windowEndsAt - now.getTime()) / 1000));
  }
}
