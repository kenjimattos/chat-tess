import type { ToolCallPart, ToolResultPart } from '@chat-tess/shared';
import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import type { LlmToolDefinition } from '../../agent/domain/llm';
import type { ToolExecutionContext, Toolbox } from '../../agent/domain/toolbox';
import type { Tool, ToolProvider } from '../domain/tool';
import type { ToolExecuted } from '../domain/tool-events';

/**
 * Junta as tools de todas as fontes e as executa para o agente. Uma falha
 * na tool vira um resultado de erro que o LLM lê, e não uma exceção que
 * interrompe o turno.
 */
export class ToolRegistry implements Toolbox {
  constructor(
    private readonly providers: ToolProvider[],
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async definitionsFor(userId: string): Promise<LlmToolDefinition[]> {
    const tools = await this.toolsFor(userId);
    return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  }

  async execute(call: ToolCallPart, context: ToolExecutionContext): Promise<ToolResultPart> {
    const startedAt = this.clock.now().getTime();
    const tool = (await this.toolsFor(context.userId)).find(({ name }) => name === call.toolName);

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

  private async toolsFor(userId: string): Promise<Tool[]> {
    const toolLists = await Promise.all(
      this.providers.map((provider) => provider.toolsFor(userId)),
    );
    return toolLists.flat();
  }
}

async function runSafely(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<{ output: unknown; isError: boolean }> {
  try {
    return { output: await tool.execute(input, context), isError: false };
  } catch (error) {
    return { output: error instanceof Error ? error.message : String(error), isError: true };
  }
}
