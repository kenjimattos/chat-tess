import type { ConversationSummary } from '@chat-tess/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  createConversation,
  deleteConversation,
  listConversations,
  renameConversation,
} from '../../api/conversations-api';

/** Lista de conversas do usuário e as ações sobre ela. */
export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setConversations(await listConversations());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    listConversations().then(
      (loaded) => {
        if (isCurrent) {
          setConversations(loaded);
          setIsLoading(false);
        }
      },
      () => {
        if (isCurrent) {
          setLoadError('Não foi possível carregar as conversas.');
          setIsLoading(false);
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  const create = useCallback(async () => {
    const conversation = await createConversation();
    setConversations((current) => [conversation, ...current]);
    return conversation;
  }, []);

  const rename = useCallback(async (conversationId: string, title: string) => {
    const renamed = await renameConversation(conversationId, title);
    setConversations((current) => current.map((item) => (item.id === renamed.id ? renamed : item)));
  }, []);

  const remove = useCallback(async (conversationId: string) => {
    await deleteConversation(conversationId);
    setConversations((current) => current.filter((item) => item.id !== conversationId));
  }, []);

  return { conversations, isLoading, loadError, refresh, create, rename, remove };
}
