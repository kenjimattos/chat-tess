import type { DomainEvent } from '../../../kernel/events/domain-event';

export type CreditLimitChanged = DomainEvent<
  'credits.limit_changed',
  { userId: string; email: string; previousLimit: number; newLimit: number }
>;

export type CreditLimitReached = DomainEvent<
  'credits.limit_reached',
  { tokenLimit: number; tokensUsed: number }
>;
