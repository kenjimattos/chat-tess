import type { SharedConversation } from '@chat-tess/shared';
import { useEffect, useState } from 'react';
import { sharedAttachmentUrl } from '../../api/attachments-api';
import { getSharedConversation } from '../../api/conversations-api';
import { ApiError } from '../../api/http-client';
import { MessageBubble } from '../chat/MessageBubble';

type PageState =
  | { status: 'loading' }
  | { status: 'loaded'; conversation: SharedConversation }
  | { status: 'error'; message: string };

/** Conversa aberta por link: só leitura, sem campo de mensagem nem lista de conversas. */
export function SharedConversationPage({ token }: { token: string }) {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    getSharedConversation(token).then(
      (conversation) => isCurrent && setState({ status: 'loaded', conversation }),
      (error: unknown) =>
        isCurrent &&
        setState({
          status: 'error',
          message:
            error instanceof ApiError && error.status === 404
              ? 'Este link de compartilhamento não existe ou foi revogado.'
              : 'Não foi possível carregar a conversa.',
        }),
    );
    return () => {
      isCurrent = false;
    };
  }, [token]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-semibold text-slate-900">
            {state.status === 'loaded' ? state.conversation.title : 'chat-tess'}
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

      <main aria-label="Conversa compartilhada" className="flex-1 space-y-4 overflow-y-auto p-4">
        {state.status === 'loading' && (
          <p className="text-center text-sm text-slate-500">Carregando conversa…</p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="pt-16 text-center text-slate-600">
            {state.message}
          </p>
        )}
        {state.status === 'loaded' && state.conversation.messages.length === 0 && (
          <p className="pt-16 text-center text-slate-500">Esta conversa ainda não tem mensagens.</p>
        )}
        {state.status === 'loaded' &&
          state.conversation.messages.map((message) => (
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
