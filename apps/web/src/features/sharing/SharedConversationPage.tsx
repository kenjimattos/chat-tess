import { useCallback, useRef } from 'react';
import { sharedAttachmentUrl } from '../../api/attachments-api';
import { getSharedConversation } from '../../api/conversations-api';
import { ApiError } from '../../api/http-client';
import { EarlierMessagesButton } from '../chat/EarlierMessagesButton';
import { MessageBubble } from '../chat/MessageBubble';
import { useMessageHistory } from '../chat/useMessageHistory';
import { useKeepPositionOnPrepend } from '../chat/useScrollPosition';

/** Conversa aberta por link: só leitura, sem campo de mensagem nem lista de conversas. */
export function SharedConversationPage({ token }: { token: string }) {
  const loadPage = useCallback(
    (beforeSequence?: number) => getSharedConversation(token, beforeSequence),
    [token],
  );
  const {
    messages,
    latestPage,
    isLoading,
    loadError,
    hasEarlierMessages,
    isLoadingEarlier,
    loadEarlier,
  } = useMessageHistory(loadPage);
  const scrollArea = useRef<HTMLElement>(null);
  const { rememberPosition } = useKeepPositionOnPrepend(scrollArea, messages[0]?.id);

  function loadEarlierKeepingPosition() {
    rememberPosition();
    void loadEarlier();
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-semibold text-slate-900">
            {latestPage?.title ?? 'chat-tess'}
          </h1>
          <p className="text-xs text-slate-500">Conversa compartilhada · somente leitura</p>
        </div>
        <a
          href="/"
          className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        >
          Ir para minhas conversas
        </a>
      </header>

      <main
        ref={scrollArea}
        aria-label="Conversa compartilhada"
        className="flex-1 space-y-4 overflow-y-auto p-4"
      >
        {isLoading && <p className="text-center text-sm text-slate-500">Carregando conversa…</p>}
        {loadError !== null && (
          <p role="alert" className="pt-16 text-center text-slate-600">
            {describeLoadError(loadError)}
          </p>
        )}
        {latestPage && messages.length === 0 && (
          <p className="pt-16 text-center text-slate-500">Esta conversa ainda não tem mensagens.</p>
        )}
        {hasEarlierMessages && (
          <EarlierMessagesButton isLoading={isLoadingEarlier} onLoad={loadEarlierKeepingPosition} />
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            attachmentUrlOf={(attachmentId) => sharedAttachmentUrl(token, attachmentId)}
          />
        ))}
      </main>
    </div>
  );
}

function describeLoadError(error: unknown): string {
  return error instanceof ApiError && error.status === 404
    ? 'Este link de compartilhamento não existe ou foi revogado.'
    : 'Não foi possível carregar a conversa.';
}
