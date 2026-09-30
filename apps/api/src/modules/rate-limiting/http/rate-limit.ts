import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../auth/http/require-authentication';
import type { ConsumeRateLimit } from '../application/consume-rate-limit';
import { RateLimitExceededError, type RateLimitPolicy } from '../domain/rate-limit';

/**
 * Middleware que aplica a política ao usuário logado. Vai depois de
 * `requireAuthentication` e antes de qualquer trabalho caro da rota.
 * A recusa responde 429 com `Retry-After`.
 */
export function createRateLimit(
  consumeRateLimit: ConsumeRateLimit,
  policy: RateLimitPolicy,
): RequestHandler {
  return async (_request, response, next) => {
    try {
      await consumeRateLimit.execute(policy, authenticatedUser(response).id);
      next();
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      next(error);
    }
  };
}
