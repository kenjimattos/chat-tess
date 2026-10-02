import type { ConversationMessage } from '@chat-tess/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_HISTORY,
  rewoundTo,
  withEarlierPage,
  withLatestPage,
  withMessage,
  type MessagePage,
} from './message-history';

/** Busca a página mais recente ou, com `beforeSequence`, as mensagens anteriores a ela. */
export type LoadMessagePage<Page extends MessagePage> = (beforeSequence?: number) => Promise<Page>;

/** Nenhuma carga terminou ainda; diferente de qualquer `refreshKey`, inclusive `undefined`. */
const NOTHING_SETTLED = Symbol('nothing-settled');

/**
 * Histórico de uma conversa carregado em páginas: abre pelas mensagens mais
 * recentes e busca as anteriores quando o usuário pede. A página mais recente
 * é recarregada sempre que `refreshKey` muda; até ela chegar, `isRefreshing`
 * avisa que as mensagens na tela são as de antes da mudança.
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
  const [settledRefreshKey, setSettledRefreshKey] = useState<unknown>(NOTHING_SETTLED);

  useEffect(() => {
    let isCurrent = true;
    loadPage().then(
      (page) => {
        if (isCurrent) {
          setHistory((current) => withLatestPage(current, page));
          setLatestPage(page);
          setLoadError(null);
          setIsLoading(false);
          setSettledRefreshKey(refreshKey);
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setLoadError(error);
          setIsLoading(false);
          setSettledRefreshKey(refreshKey);
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

  /** Deixa `message` como a última da tela, descartando o que veio depois dela. */
  const rewindTo = useCallback(
    (message: ConversationMessage) => setHistory((current) => rewoundTo(current, message)),
    [],
  );

  return {
    messages: history.messages,
    hasEarlierMessages: history.hasEarlierMessages,
    latestPage,
    isLoading,
    // Derivado na renderização: já vale no mesmo quadro em que `refreshKey` muda.
    isRefreshing: settledRefreshKey !== refreshKey,
    isLoadingEarlier,
    loadError,
    loadEarlier,
    showImmediately,
    rewindTo,
  };
}
