import type { ToolCallPart, ToolResultPart } from '@chat-tess/shared';
import type { LlmToolDefinition } from '../domain/llm';
import type { ToolExecutionContext, Toolbox } from '../domain/toolbox';

type FakeTool = (input: Record<string, unknown>) => unknown;

/** Caixa de tools para testes: cada tool é uma função síncrona simples. */
export class FakeToolbox implements Toolbox {
  readonly executions: Array<{ call: ToolCallPart; context: ToolExecutionContext }> = [];

  constructor(private readonly tools: Record<string, FakeTool> = {}) {}

  async definitionsFor(): Promise<LlmToolDefinition[]> {
    return Object.keys(this.tools).map((name) => ({
      name,
      description: `Tool de teste ${name}`,
      inputSchema: { type: 'object' },
    }));
  }

  async execute(call: ToolCallPart, context: ToolExecutionContext): Promise<ToolResultPart> {
    this.executions.push({ call, context });
    const base = { type: 'tool_result' as const, callId: call.callId, toolName: call.toolName };
    const tool = this.tools[call.toolName];
    if (!tool) {
      return { ...base, output: `Tool desconhecida: ${call.toolName}`, isError: true };
    }

    try {
      return { ...base, output: tool(call.input), isError: false };
    } catch (error) {
      return {
        ...base,
        output: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }
  }
}
