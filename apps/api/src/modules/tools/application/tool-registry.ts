import type { ToolCallPart, ToolResultPart } from '@chat-tess/shared';
import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import type { LlmToolDefinition } from '../../agent/domain/llm';
import type { ToolExecutionContext, Toolbox } from '../../agent/domain/toolbox';
import { markAsExternal } from '../domain/external-content';
import type { ToolPreferences } from '../domain/ports';
import type { CatalogEntry, Tool, ToolProvider } from '../domain/tool';
import type { ToolExecuted } from '../domain/tool-events';

/**
 * Junta as tools de todas as fontes e as executa para o agente. Cada usuário
 * pode desligar tools; as não configuradas ficam ligadas. Uma falha na tool
 * vira um resultado de erro que o LLM lê, e não uma exceção que interrompe o turno.
 * Resultados com conteúdo de terceiros chegam ao LLM marcados como externos.
 */
export class ToolRegistry implements Toolbox {
  constructor(
    private readonly providers: ToolProvider[],
    private readonly preferences: ToolPreferences,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  /** Todas as tools que o usuário pode usar, ligadas ou não. */
  async catalogFor(userId: string): Promise<CatalogEntry[]> {
    const [settings, toolsBySource] = await Promise.all([
      this.preferences.settingsOf(userId),
      Promise.all(
        this.providers.map(async (provider) => ({
          source: provider.source,
          tools: await provider.toolsFor(userId),
        })),
      ),
    ]);

    return toolsBySource.flatMap(({ source, tools }) =>
      tools.map((tool) => ({ tool, source, enabled: settings.get(tool.name) ?? true })),
    );
  }

  async definitionsFor(userId: string): Promise<LlmToolDefinition[]> {
    const tools = await this.enabledToolsFor(userId);
    return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  }

  async execute(call: ToolCallPart, context: ToolExecutionContext): Promise<ToolResultPart> {
    const startedAt = this.clock.now().getTime();
    const tool = (await this.enabledToolsFor(context.userId)).find(
      ({ name }) => name === call.toolName,
    );

    const { output, isError } = tool
      ? await runSafely(tool, call.input, context)
      : { output: `A tool "${call.toolName}" não existe ou não está habilitada.`, isError: true };

    await this.events.publish({
      type: 'tool.executed',
      occurredAt: this.clock.now(),
      actorUserId: context.userId,
      payload: {
        conversationId: context.conversationId,
        callId: call.callId,
        toolName: call.toolName,
        input: call.input,
        output,
        isError,
        durationMs: this.clock.now().getTime() - startedAt,
      },
    } satisfies ToolExecuted);

    return { type: 'tool_result', callId: call.callId, toolName: call.toolName, output, isError };
  }

  private async enabledToolsFor(userId: string): Promise<Tool[]> {
    const catalog = await this.catalogFor(userId);
    return catalog.filter(({ enabled }) => enabled).map(({ tool }) => tool);
  }
}

async function runSafely(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<{ output: unknown; isError: boolean }> {
  try {
    const output = await tool.execute(input, context);
    return {
      output: tool.returnsExternalContent ? markAsExternal(output) : output,
      isError: false,
    };
  } catch (error) {
    return { output: error instanceof Error ? error.message : String(error), isError: true };
  }
}
