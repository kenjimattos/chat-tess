import type { Router } from 'express';
import type { AppConfig } from '../../infra/config/env';
import type { Database } from '../../infra/database/database';
import type { EventPublisher } from '../../kernel/events/domain-event';
import type { Logger } from '../../infra/logging/logger';
import type { Clock } from '../../kernel/time/clock';
import { GetCurrentUser } from './application/get-current-user';
import { SeedAllowedEmails } from './application/seed-allowed-emails';
import { SignIn } from './application/sign-in';
import { createAuthRouter, type LoginMethod } from './http/auth-router';
import { createRequireAuthentication } from './http/require-authentication';
import { SessionCookie } from './http/session-cookie';
import { GoogleIdentityProvider } from './infra/google-identity-provider';
import { JwtSessionTokens } from './infra/jwt-session-tokens';
import { PrismaAllowedEmailRepository } from './infra/prisma-allowed-email-repository';
import { PrismaUserRepository } from './infra/prisma-user-repository';
import type { UserRepository } from './domain/ports';

export interface AuthModuleDependencies {
  config: AppConfig;
  database: Database;
  events: EventPublisher;
  clock: Clock;
  logger: Logger;
}

export interface AuthModule {
  router: Router;
  /** Usado por módulos que localizam usuários (ex.: limites de consumo). */
  users: UserRepository;
  /** Middleware que as rotas protegidas dos outros módulos usam. */
  requireAuthentication: ReturnType<typeof createRequireAuthentication>;
  /** Garante na lista de permitidos os padrões vindos da configuração. */
  seedAllowedEmails(): Promise<void>;
}

export function createAuthModule({
  config,
  database,
  events,
  clock,
  logger,
}: AuthModuleDependencies): AuthModule {
  const users = new PrismaUserRepository(database);
  const allowedEmails = new PrismaAllowedEmailRepository(database);
  const sessionTokens = new JwtSessionTokens({ ...config.session, clock });
  const sessionCookie = new SessionCookie({
    secure: config.session.secureCookie,
    ttlSeconds: config.session.ttlSeconds,
  });

  const signIn = new SignIn(users, allowedEmails, sessionTokens, events, clock, config.adminEmails);
  const getCurrentUser = new GetCurrentUser(users, sessionTokens);
  const seedAllowedEmails = new SeedAllowedEmails(allowedEmails);

  return {
    users,
    router: createAuthRouter({
      signIn,
      getCurrentUser,
      sessionCookie,
      loginMethod: toLoginMethod(config),
      secureCookies: config.session.secureCookie,
      logger,
    }),
    requireAuthentication: createRequireAuthentication(getCurrentUser, sessionCookie),
    seedAllowedEmails: () => seedAllowedEmails.execute(config.allowedEmails),
  };
}

function toLoginMethod({ auth, http }: AppConfig): LoginMethod {
  if (auth.mode === 'test') {
    return { mode: 'test' };
  }

  return {
    mode: 'google',
    publicBaseUrl: http.publicBaseUrl,
    identityProvider: new GoogleIdentityProvider({
      ...auth.google,
      redirectUri: `${http.publicBaseUrl}/api/auth/google/callback`,
    }),
  };
}
