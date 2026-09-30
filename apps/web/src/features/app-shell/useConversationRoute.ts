import { useCallback, useSyncExternalStore } from 'react';

const CONVERSATION_PATH = /^\/conversations\/([0-9a-f-]+)$/i;

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

function selectedIdFromLocation(): string | null {
  return CONVERSATION_PATH.exec(window.location.pathname)?.[1] ?? null;
}

/** Conversa aberta, guardada na URL: recarregar a página e o botão voltar funcionam. */
export function useConversationRoute() {
  const selectedId = useSyncExternalStore(subscribe, selectedIdFromLocation);

  const select = useCallback((conversationId: string | null) => {
    const path = conversationId ? `/conversations/${conversationId}` : '/';
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, []);

  return { selectedId, select };
}
