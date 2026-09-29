import type { MessagePart } from '@chat-tess/shared';

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageRole = 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  conversationId: string;
  /** Posição na conversa, começando em 1. */
  sequence: number;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: Date;
}

export const DEFAULT_CONVERSATION_TITLE = 'Nova conversa';
export const MAX_TITLE_LENGTH = 80;

/** Título a partir do texto da primeira mensagem: primeira linha, sem espaços extras. */
export function titleFromFirstMessage(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
  if (!firstLine) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  if (firstLine.length <= MAX_TITLE_LENGTH) {
    return firstLine;
  }
  return `${firstLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}
