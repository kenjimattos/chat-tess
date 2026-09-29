import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import { EmailNotAllowedError } from '../domain/auth-errors';
import type { LoginDenied, LoginSucceeded } from '../domain/auth-events';
import { isEmailAllowed, normalizeEmail } from '../domain/email-allowlist';
import type { AllowedEmailRepository, SessionTokens, UserRepository } from '../domain/ports';
import type { User, VerifiedIdentity } from '../domain/user';

export interface SignInResult {
  user: User;
  sessionToken: string;
}

/**
 * Conclui o login de uma identidade já confirmada pelo provedor: aplica a
 * lista de permitidos, cria o usuário no primeiro acesso e abre a sessão.
 */
export class SignIn {
  constructor(
    private readonly users: UserRepository,
    private readonly allowedEmails: AllowedEmailRepository,
    private readonly sessionTokens: SessionTokens,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(verifiedIdentity: VerifiedIdentity): Promise<SignInResult> {
    const identity = { ...verifiedIdentity, email: normalizeEmail(verifiedIdentity.email) };

    await this.assertEmailIsAllowed(identity.email);

    const existingUser = await this.users.findByEmail(identity.email);
    const user = existingUser
      ? await this.users.updateProfile(existingUser.id, identity)
      : await this.users.create(identity);
    const sessionToken = await this.sessionTokens.issue(user.id);

    await this.events.publish({
      type: 'auth.login_succeeded',
      occurredAt: this.clock.now(),
      actorUserId: user.id,
      payload: { email: user.email, isFirstLogin: !existingUser },
    } satisfies LoginSucceeded);

    return { user, sessionToken };
  }

  private async assertEmailIsAllowed(email: string): Promise<void> {
    const allowedPatterns = await this.allowedEmails.listPatterns();
    if (isEmailAllowed(email, allowedPatterns)) {
      return;
    }

    await this.events.publish({
      type: 'auth.login_denied',
      occurredAt: this.clock.now(),
      actorUserId: null,
      payload: { email, reason: 'email_not_allowed' },
    } satisfies LoginDenied);

    throw new EmailNotAllowedError(email);
  }
}
