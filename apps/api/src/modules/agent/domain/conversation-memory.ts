/** Resumo das mensagens antigas, que as substitui no contexto enviado ao LLM. */
export interface ConversationSummary {
  content: string;
  /** Sequência da última mensagem coberta pelo resumo. */
  coversUntilSequence: number;
  /** Total de mensagens resumidas até aqui, somando compactações anteriores. */
  summarizedMessageCount: number;
}

export interface ConversationMemory {
  summary: ConversationSummary | null;
  /** Entrada mais saída da última chamada ao LLM, em tokens: estimativa do contexto da próxima. */
  lastContextTokens: number;
}

export interface ConversationMemoryRepository {
  load(conversationId: string): Promise<ConversationMemory>;
  saveSummary(conversationId: string, summary: ConversationSummary): Promise<void>;
  recordContextTokens(conversationId: string, tokens: number): Promise<void>;
}
