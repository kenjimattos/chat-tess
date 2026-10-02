import type { DomainEvent } from '../../../kernel/events/domain-event';

export type LoginSucceeded = DomainEvent<
  'auth.login_succeeded',
  { email: string; isFirstLogin: boolean }
>;

export type LoginDenied = DomainEvent<'auth.login_denied', { email: string; reason: string }>;
