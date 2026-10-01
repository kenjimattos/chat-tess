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
  /**
   * Verdadeiro quando o resultado traz conteúdo de terceiros (páginas, buscas,
   * e-mails). O registro marca esse conteúdo como externo antes de devolvê-lo ao LLM.
   */
  readonly returnsExternalContent: boolean;
  /**
   * Diz se esta chamada só pode executar depois de o usuário autorizar. Vale para
   * ações que mudam algo fora da conversa ou que podem levar dados dela a terceiros:
   * uma instrução escondida em conteúdo externo não consegue dispará-las sozinha.
   */
  requiresApproval(input: Record<string, unknown>, context: ToolExecutionContext): Promise<boolean>;
  /** Devolve o resultado para o LLM. Erros lançados viram resultado com `isError`. */
  execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown>;
}

export type ToolSource = 'built_in' | 'connector' | 'mcp';

/** Fonte de tools: as nativas, as de conectores e as de servidores MCP. */
export interface ToolProvider {
  readonly source: ToolSource;
  toolsFor(userId: string): Promise<Tool[]>;
}

/** Uma tool com a origem e a preferência do usuário. */
export interface CatalogEntry {
  tool: Tool;
  source: ToolSource;
  enabled: boolean;
}
