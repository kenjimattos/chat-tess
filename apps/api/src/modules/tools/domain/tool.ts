import type { ToolExecutionContext } from '../../agent/domain/toolbox';

/**
 * Uma capacidade que o agente pode usar. Para adicionar uma tool, implemente
 * esta interface e registre a implementação no `ToolRegistry`.
 */
export interface Tool {
  /** Nome único, em snake_case, que o LLM usa para chamar a tool. */
  readonly name: string;
  /** Explica ao LLM quando e como usar a tool. */
  readonly description: string;
  /** JSON Schema dos argumentos. */
  readonly inputSchema: Record<string, unknown>;
  /** Devolve o resultado para o LLM. Erros lançados viram resultado com `isError`. */
  execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown>;
}

/** Fonte de tools: as nativas, as de conectores e as de servidores MCP. */
export interface ToolProvider {
  toolsFor(userId: string): Promise<Tool[]>;
}
