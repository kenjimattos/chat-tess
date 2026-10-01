import type { ConversationMessage } from '@chat-tess/shared';

/** Uma página do histórico, como a API devolve. */
export interface MessagePage {
  messages: ConversationMessage[];
  hasEarlierMessages: boolean;
}

/** O trecho do histórico já carregado na tela, em ordem de sequência. */
export type MessageHistory = MessagePage;

export const EMPTY_HISTORY: MessageHistory = { messages: [], hasEarlierMessages: false };

/**
 * Atualiza o histórico com a página mais recente, mantendo as mensagens mais
 * antigas que o usuário já tinha carregado. Mensagens provisórias (a pergunta
 * mostrada antes de a API gravá-la) dão lugar às gravadas.
 */
export function withLatestPage(history: MessageHistory, latest: MessagePage): MessageHistory {
  const firstOfLatest = latest.messages[0];
  if (!firstOfLatest) {
    return latest;
  }

  const earlier = history.messages.filter((message) => message.sequence < firstOfLatest.sequence);
  return {
    messages: [...earlier, ...latest.messages],
    hasEarlierMessages: earlier.length ? history.hasEarlierMessages : latest.hasEarlierMessages,
  };
}

/** Acrescenta no início uma página de mensagens mais antigas. */
export function withEarlierPage(history: MessageHistory, earlier: MessagePage): MessageHistory {
  return {
    messages: [...earlier.messages, ...history.messages],
    hasEarlierMessages: earlier.hasEarlierMessages,
  };
}

export function withMessage(history: MessageHistory, message: ConversationMessage): MessageHistory {
  return { ...history, messages: [...history.messages, message] };
}
