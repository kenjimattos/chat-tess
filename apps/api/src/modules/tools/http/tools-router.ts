import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticatedUser } from '../../auth/http/require-authentication';
import type { ListTools } from '../application/list-tools';
import type { SetToolEnabled } from '../application/set-tool-enabled';

export interface ToolsRouterOptions {
  requireAuthentication: RequestHandler;
  listTools: ListTools;
  setToolEnabled: SetToolEnabled;
}

const setToolEnabledSchema = z.object({ enabled: z.boolean() });

/**
 * - GET /tools              tools disponíveis e se estão ligadas para o usuário
 * - PUT /tools/:toolName    liga ou desliga uma tool
 */
export function createToolsRouter(options: ToolsRouterOptions): Router {
  const router = Router();
  router.use('/tools', options.requireAuthentication);

  router.get('/tools', async (_request, response) => {
    const catalog = await options.listTools.execute(authenticatedUser(response).id);
    response.json(
      catalog.map(({ tool, source, enabled }) => ({
        name: tool.name,
        description: tool.description,
        source,
        enabled,
      })),
    );
  });

  router.put('/tools/:toolName', async (request, response) => {
    const { enabled } = setToolEnabledSchema.parse(request.body);
    await options.setToolEnabled.execute({
      userId: authenticatedUser(response).id,
      toolName: String(request.params.toolName),
      enabled,
    });
    response.status(204).end();
  });

  return router;
}
