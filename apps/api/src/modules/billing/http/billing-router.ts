import { setCreditLimitRequestSchema, type UsageSummaryResponse } from '@chat-tess/shared';
import { Router, type RequestHandler } from 'express';
import { authenticatedUser, requireAdmin } from '../../auth/http/require-authentication';
import type { GetUsageSummary } from '../application/get-usage-summary';
import type { SetCreditLimit } from '../application/set-credit-limit';

export interface BillingRouterOptions {
  requireAuthentication: RequestHandler;
  getUsageSummary: GetUsageSummary;
  setCreditLimit: SetCreditLimit;
}

/**
 * - GET /usage                    consumo e limite do usuário
 * - PUT /admin/credit-limits      administrador define o limite de um usuário
 */
export function createBillingRouter(options: BillingRouterOptions): Router {
  const router = Router();

  router.get('/usage', options.requireAuthentication, async (_request, response) => {
    const summary = await options.getUsageSummary.execute(authenticatedUser(response).id);
    const body: UsageSummaryResponse = {
      ...summary,
      recentUsage: summary.recentUsage.map(({ userId: _userId, occurredAt, ...record }) => ({
        ...record,
        occurredAt: occurredAt.toISOString(),
      })),
    };
    response.json(body);
  });

  router.put(
    '/admin/credit-limits',
    options.requireAuthentication,
    requireAdmin,
    async (request, response) => {
      const { email, tokenLimit } = setCreditLimitRequestSchema.parse(request.body);
      const account = await options.setCreditLimit.execute({
        admin: authenticatedUser(response),
        email,
        tokenLimit,
      });
      response.json(account);
    },
  );

  return router;
}
