import { AppError } from '../../../kernel/errors/app-error';
import type { EventPublisher } from '../../../kernel/events/domain-event';
import type { Clock } from '../../../kernel/time/clock';
import { normalizeEmail } from '../../auth/domain/email-allowlist';
import type { UserRepository } from '../../auth/domain/ports';
import type { User } from '../../auth/domain/user';
import type { CreditLimitChanged } from '../domain/billing-events';
import type { CreditAccount, UsageLedger } from '../domain/credit-account';

export interface SetCreditLimitInput {
  admin: User;
  email: string;
  tokenLimit: number;
}

/** Um administrador define o limite de tokens de um usuário. */
export class SetCreditLimit {
  constructor(
    private readonly users: UserRepository,
    private readonly ledger: UsageLedger,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute({ admin, email, tokenLimit }: SetCreditLimitInput): Promise<CreditAccount> {
    if (!Number.isInteger(tokenLimit) || tokenLimit < 0) {
      throw new AppError(
        'validation',
        'invalid_token_limit',
        'O limite precisa ser um inteiro não negativo.',
      );
    }
    const user = await this.users.findByEmail(normalizeEmail(email));
    if (!user) {
      throw new AppError('not_found', 'user_not_found', 'Usuário não encontrado.', { email });
    }

    const previous = await this.ledger.accountOf(user.id);
    const account = await this.ledger.setLimit(user.id, tokenLimit);

    await this.events.publish({
      type: 'credits.limit_changed',
      occurredAt: this.clock.now(),
      actorUserId: admin.id,
      payload: {
        userId: user.id,
        email: user.email,
        previousLimit: previous.tokenLimit,
        newLimit: tokenLimit,
      },
    } satisfies CreditLimitChanged);

    return account;
  }
}
