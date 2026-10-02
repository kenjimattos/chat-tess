import type { AttachmentPart, ConversationMessage } from '@chat-tess/shared';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getConversation } from '../../api/conversations-api';
import { activeTurns } from './active-turns-store';
import { callsAwaitingApproval } from './tool-approval';
import { useMessageHistory } from './useMessageHistory';

export interface UseChatOptions {
  /** Chamado ao fim de cada turno: título e ordem da conversa podem ter mudado. */
  onTurnFinished(): void;
}

/**
 * Histórico de uma conversa e o envio de mensagens com resposta em stream.
 * A resposta vive no `activeTurns`: continua chegando se o usuário abrir outra
 * conversa, e aparece de novo quando ele voltar.
 * O componente que usa este hook é remontado quando a conversa muda (via `key`).
 */
export function useChat(conversationId: string, { onTurnFinished }: UseChatOptions) {
  const turnReply = useSyncExternalStore(activeTurns.subscribe, () =>
    activeTurns.replyOf(conversationId),
  );
  const finishedTurns = useSyncExternalStore(activeTurns.subscribe, () =>
    activeTurns.finishedTurnsOf(conversationId),
  );
  const isStreaming = turnReply !== null && !turnReply.isFinished;

  // Carrega ao abrir e depois de cada resposta, quando o texto em stream dá
  // lugar à mensagem gravada. Não recarrega no início do turno, para não
  // apagar a pergunta que já aparece na tela antes de a API gravá-la.
  const loadPage = useCallback(
    (beforeSequence?: number) => getConversation(conversationId, beforeSequence),
    [conversationId],
  );
  const history = useMessageHistory(loadPage, finishedTurns);
  const { messages, showImmediately, rewindTo } = history;

  // Ao sair da conversa, uma resposta já terminada não precisa mais ser guardada.
  useEffect(() => () => activeTurns.dismiss(conversationId), [conversationId]);

  const send = useCallback(
    async (text: string, attachments: AttachmentPart[]) => {
      showImmediately(optimisticUserMessage(messages, text, attachments));
      await activeTurns.start(
        conversationId,
        { text, attachmentIds: attachments.map((attachment) => attachment.attachmentId) },
        onTurnFinished,
      );
    },
    [conversationId, messages, onTurnFinished, showImmediately],
  );

  /**
   * Refaz o último turno a partir de `message`, a última mensagem do usuário.
   * Com `newText`, a mensagem é editada antes. A resposta antiga sai da tela
   * na hora; se a API recusar, ela volta quando o histórico é relido.
   */
  const resend = useCallback(
    async (message: ConversationMessage, newText?: string) => {
      rewindTo(newText === undefined ? message : withText(message, newText));
      await activeTurns.resend(conversationId, { text: newText }, onTurnFinished);
    },
    [conversationId, onTurnFinished, rewindTo],
  );

  // O pedido de autorização vem do histórico: continua lá depois de recarregar a página.
  // Entre o fim do turno e a releitura, o histórico ainda traz o pedido já respondido.
  const awaitingApproval =
    isStreaming || history.isRefreshing ? [] : callsAwaitingApproval(messages);

  /** Responde ao pedido de autorização, para todas as chamadas dele, e retoma o turno. */
  const decideApprovals = useCallback(
    async (isApproved: boolean) => {
      const approvedCallIds = isApproved
        ? callsAwaitingApproval(messages).map((call) => call.callId)
        : [];
      await activeTurns.decide(conversationId, { approvedCallIds }, onTurnFinished);
    },
    [conversationId, messages, onTurnFinished],
  );

  const stop = useCallback(() => activeTurns.stop(conversationId), [conversationId]);

  // Depois do fim, só vale mostrar o que o histórico não mostra: erro e aviso de compactação.
  const reply =
    turnReply && (!turnReply.isFinished || turnReply.error || turnReply.wasCompacted)
      ? turnReply
      : null;

  return {
    messages,
    isLoading: history.isLoading,
    loadError: history.loadError ? 'Não foi possível carregar a conversa.' : null,
    hasEarlierMessages: history.hasEarlierMessages,
    isLoadingEarlier: history.isLoadingEarlier,
    loadEarlier: history.loadEarlier,
    reply,
    isStreaming,
    awaitingApproval,
    send,
    resend,
    decideApprovals,
    stop,
  };
}

/** A mensagem com o texto trocado, mantendo os anexos. */
function withText(message: ConversationMessage, text: string): ConversationMessage {
  const attachments = message.parts.filter((part) => part.type === 'attachment');
  return {
    ...message,
    parts: [...(text ? [{ type: 'text' as const, text }] : []), ...attachments],
  };
}

/** Mostra a pergunta na hora, antes de a API confirmar; é substituída ao recarregar. */
function optimisticUserMessage(
  current: ConversationMessage[],
  text: string,
  attachments: AttachmentPart[],
): ConversationMessage {
  return {
    id: `pending-${Date.now()}`,
    sequence: (current.at(-1)?.sequence ?? 0) + 1,
    role: 'user',
    parts: [...(text ? [{ type: 'text' as const, text }] : []), ...attachments],
    createdAt: new Date().toISOString(),
  };
}
