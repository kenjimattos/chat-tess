import type { AttachmentPart, ConversationMessage } from '@chat-tess/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getConversation } from '../../api/conversations-api';
import { activeTurns } from './active-turns-store';

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
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  useEffect(() => {
    let isCurrent = true;
    getConversation(conversationId).then(
      (detail) => {
        if (isCurrent) {
          setMessages(detail.messages);
          setLoadError(null);
          setIsLoading(false);
        }
      },
      () => {
        if (isCurrent) {
          setLoadError('Não foi possível carregar a conversa.');
          setIsLoading(false);
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [conversationId, finishedTurns]);

  // Ao sair da conversa, uma resposta já terminada não precisa mais ser guardada.
  useEffect(() => () => activeTurns.dismiss(conversationId), [conversationId]);

  const send = useCallback(
    async (text: string, attachments: AttachmentPart[]) => {
      setMessages((current) => [...current, optimisticUserMessage(current, text, attachments)]);
      await activeTurns.start(
        conversationId,
        { text, attachmentIds: attachments.map((attachment) => attachment.attachmentId) },
        onTurnFinished,
      );
    },
    [conversationId, onTurnFinished],
  );

  const stop = useCallback(() => activeTurns.stop(conversationId), [conversationId]);

  // Depois do fim, só vale mostrar o que o histórico não mostra: erro e aviso de compactação.
  const reply =
    turnReply && (!turnReply.isFinished || turnReply.error || turnReply.wasCompacted)
      ? turnReply
      : null;

  return { messages, isLoading, loadError, reply, isStreaming, send, stop };
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
