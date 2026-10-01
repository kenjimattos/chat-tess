import type { MessagePart, MessageRole, TokenUsage } from '@chat-tess/shared';

export interface ReadablePage {
  /** Endereço final, depois de redirecionamentos. */
  url: string;
  title: string;
  text: string;
}

/** Busca uma página pública e extrai o texto legível. */
export interface PageReader {
  read(url: string, signal?: AbortSignal): Promise<ReadablePage>;
}

export interface WebSearchResult {
  answer: string;
  sources: { title: string; url: string }[];
  /** Consumo do LLM usado na busca, quando houver. */
  usage: TokenUsage | null;
  model: string | null;
}

export interface WebSearchEngine {
  search(query: string, signal?: AbortSignal): Promise<WebSearchResult>;
}

/** Quais tools cada usuário deixou habilitadas. */
export interface ToolPreferences {
  /** Preferências explícitas do usuário: nome da tool para habilitada ou não. */
  settingsOf(userId: string): Promise<Map<string, boolean>>;
  set(userId: string, toolName: string, enabled: boolean): Promise<void>;
}

export interface HistoryMessage {
  role: MessageRole;
  parts: MessagePart[];
}

/** O histórico da conversa em que a tool roda; o repositório de mensagens o implementa. */
export interface ConversationHistory {
  /** Todas as mensagens da conversa, em ordem. */
  listByConversation(conversationId: string): Promise<readonly HistoryMessage[]>;
}
