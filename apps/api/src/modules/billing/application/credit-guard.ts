import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import type { UsageLimiter } from '../../agent/domain/usage-limiter';
import { CreditLimitReachedError } from '../domain/billing-errors';
import type { CreditLimitReached } from '../domain/billing-events';
import { hasCredit, type UsageLedger } from '../domain/credit-account';

/**
 * Bloqueia novos turnos de quem esgotou o limite. A verificação é feita antes
 * de cada turno, então o turno em andamento pode passar um pouco do limite.
 */
export class CreditGuard implements UsageLimiter {
  constructor(
    private readonly ledger: UsageLedger,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async assertCanSpend(userId: string): Promise<void> {
    const account = await this.ledger.accountOf(userId);
    if (hasCredit(account)) {
      return;
    }

    await this.events.publish({
      type: 'credits.limit_reached',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: { tokenLimit: account.tokenLimit, tokensUsed: account.tokensUsed },
    } satisfies CreditLimitReached);
    throw new CreditLimitReachedError(account.tokenLimit);
  }
}
