export interface ToolCallRecord {
  userId: string;
  conversationId: string;
  callId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  isError: boolean;
  durationMs: number;
  occurredAt: Date;
}

/** Histórico de execuções de tools, para consulta e depuração. */
export interface ToolCallLog {
  record(call: ToolCallRecord): Promise<void>;
}

/** Catálogo persistido das tools. Hoje só as nativas são sincronizadas. */
export interface ToolCatalog {
  sync(
    tools: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      source: 'built_in' | 'connector';
    }[],
  ): Promise<void>;
}
