import type { ConversationMessage } from '@chat-tess/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_HISTORY,
  withEarlierPage,
  withLatestPage,
  withMessage,
  type MessagePage,
} from './message-history';

/** Busca a página mais recente ou, com `beforeSequence`, as mensagens anteriores a ela. */
export type LoadMessagePage<Page extends MessagePage> = (beforeSequence?: number) => Promise<Page>;

/**
 * Histórico de uma conversa carregado em páginas: abre pelas mensagens mais
 * recentes e busca as anteriores quando o usuário pede. A página mais recente
 * é recarregada sempre que `refreshKey` muda.
 * `loadPage` precisa ser estável entre renderizações (use `useCallback`).
 */
export function useMessageHistory<Page extends MessagePage>(
  loadPage: LoadMessagePage<Page>,
  refreshKey?: unknown,
) {
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [latestPage, setLatestPage] = useState<Page | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    let isCurrent = true;
    loadPage().then(
      (page) => {
        if (isCurrent) {
          setHistory((current) => withLatestPage(current, page));
          setLatestPage(page);
          setLoadError(null);
          setIsLoading(false);
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setLoadError(error);
          setIsLoading(false);
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [loadPage, refreshKey]);

  const oldestSequence = history.messages[0]?.sequence;

  const loadEarlier = useCallback(async () => {
    if (oldestSequence === undefined) {
      return;
    }
    setIsLoadingEarlier(true);
    try {
      const page = await loadPage(oldestSequence);
      setHistory((current) => withEarlierPage(current, page));
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [loadPage, oldestSequence]);

  /** Mostra uma mensagem na hora, antes de a API confirmar; some ao recarregar. */
  const showImmediately = useCallback(
    (message: ConversationMessage) => setHistory((current) => withMessage(current, message)),
    [],
  );

  return {
    messages: history.messages,
    hasEarlierMessages: history.hasEarlierMessages,
    latestPage,
    isLoading,
    isLoadingEarlier,
    loadError,
    loadEarlier,
    showImmediately,
  };
}
