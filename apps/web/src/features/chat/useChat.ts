import type { AttachmentPart, ConversationMessage } from '@chat-tess/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getConversation } from '../../api/conversations-api';
import { ApiError } from '../../api/http-client';
import { sendMessage } from '../../api/messages-api';
import { applyStreamEvent, emptyReply, type StreamingReply } from './streaming-reply';

export interface UseChatOptions {
  /** Chamado ao fim de cada turno: título e ordem da conversa podem ter mudado. */
  onTurnFinished(): void;
}

/**
 * Histórico de uma conversa e o envio de mensagens com resposta em stream.
 * O componente que usa este hook é remontado quando a conversa muda (via `key`),
 * então o estado sempre começa limpo.
 */
export function useChat(conversationId: string, { onTurnFinished }: UseChatOptions) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reply, setReply] = useState<StreamingReply | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    const detail = await getConversation(conversationId);
    setMessages(detail.messages);
    setIsLoading(false);
  }, [conversationId]);

  useEffect(() => {
    let isCurrent = true;
    getConversation(conversationId).then(
      (detail) => {
        if (isCurrent) {
          setMessages(detail.messages);
          setIsLoading(false);
        }
      },
      () => {
        if (isCurrent) {
          setSendError('Não foi possível carregar a conversa.');
          setIsLoading(false);
        }
      },
    );
    return () => {
      isCurrent = false;
      abortController.current?.abort();
    };
  }, [conversationId]);

  const send = useCallback(
    async (text: string, attachments: AttachmentPart[]) => {
      setSendError(null);
      setMessages((current) => [...current, optimisticUserMessage(current, text, attachments)]);
      setReply(emptyReply);
      abortController.current = new AbortController();

      try {
        const events = await sendMessage(
          conversationId,
          { text, attachmentIds: attachments.map((attachment) => attachment.attachmentId) },
          abortController.current.signal,
        );
        for await (const event of events) {
          setReply((current) => applyStreamEvent(current ?? emptyReply, event));
        }
      } catch (error) {
        if (!abortController.current.signal.aborted) {
          setSendError(
            error instanceof ApiError ? error.message : 'Não foi possível enviar a mensagem.',
          );
        }
      } finally {
        await reload().catch(() => setSendError('Não foi possível atualizar a conversa.'));
        setReply((current) => (current?.error || current?.wasCompacted ? current : null));
        onTurnFinished();
      }
    },
    [conversationId, reload, onTurnFinished],
  );

  const stop = useCallback(() => abortController.current?.abort(), []);

  const isStreaming = reply !== null && !reply.isFinished;
  return { messages, isLoading, reply, isStreaming, sendError, send, stop };
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
