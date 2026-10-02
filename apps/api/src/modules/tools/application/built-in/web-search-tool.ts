import { z } from 'zod';
import type { EventPublisher } from '../../../../kernel/events/domain-event';
import type { Clock } from '../../../../kernel/time/clock';
import type { LlmCallCompleted } from '../../../agent/domain/agent-events';
import { defineTool } from '../../domain/define-tool';
import type { WebSearchEngine } from '../../domain/ports';
import type { Tool } from '../../domain/tool';

export const WEB_SEARCH_TOOL_NAME = 'web_search';

export function createWebSearchTool(
  engine: WebSearchEngine,
  events: EventPublisher,
  clock: Clock,
): Tool {
  return defineTool({
    name: WEB_SEARCH_TOOL_NAME,
    description:
      'Pesquisa na internet informações atuais ou que você não conhece. ' +
      'Devolve uma resposta resumida e as fontes consultadas; cite as fontes para o usuário.',
    returnsExternalContent: true,
    input: z.object({
      query: z.string().min(2).max(500).describe('O que pesquisar, em linguagem natural'),
    }),
    async run({ query }, { userId, conversationId, signal }) {
      const result = await engine.search(query, signal);

      // A busca usa o LLM: o consumo entra na conta do usuário.
      if (result.usage && result.model) {
        await events.publish({
          type: 'llm.call_completed',
          occurredAt: clock.now(),
          actorUserId: userId,
          payload: { conversationId, model: result.model, purpose: 'tool', usage: result.usage },
        } satisfies LlmCallCompleted);
      }

      return { answer: result.answer, sources: result.sources };
    },
  });
}
