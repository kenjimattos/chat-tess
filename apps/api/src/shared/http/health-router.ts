import { Router } from 'express';

/** Verificação de uma dependência externa; lança erro quando ela está indisponível. */
export type ReadinessCheck = () => Promise<void>;

export interface HealthRouterOptions {
  readinessChecks: Record<string, ReadinessCheck>;
}

type DependencyStatus = 'ok' | 'unavailable';

/**
 * - GET /health: o processo está no ar (liveness).
 * - GET /health/ready: as dependências respondem (readiness).
 */
export function createHealthRouter({ readinessChecks }: HealthRouterOptions): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  router.get('/health/ready', async (_request, response) => {
    const dependencies = await runChecks(readinessChecks);
    const isReady = Object.values(dependencies).every((status) => status === 'ok');

    response
      .status(isReady ? 200 : 503)
      .json({ status: isReady ? 'ok' : 'unavailable', dependencies });
  });

  return router;
}

async function runChecks(
  checks: Record<string, ReadinessCheck>,
): Promise<Record<string, DependencyStatus>> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      const status: DependencyStatus = await check().then(
        () => 'ok',
        () => 'unavailable',
      );
      return [name, status] as const;
    }),
  );

  return Object.fromEntries(entries);
}
