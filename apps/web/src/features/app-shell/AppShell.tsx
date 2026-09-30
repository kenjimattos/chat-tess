import type { CurrentUser } from '@chat-tess/shared';
import { ChatView } from '../chat/ChatView';
import { ConversationList } from '../conversations/ConversationList';
import { useConversations } from '../conversations/useConversations';
import { useConversationRoute } from './useConversationRoute';

export interface AppShellProps {
  user: CurrentUser;
  onSignOut(): void;
}

/** Tela principal depois do login: conversas à esquerda, chat à direita. */
export function AppShell({ user, onSignOut }: AppShellProps) {
  const { conversations, loadError, create, rename, remove, refresh } = useConversations();
  const { selectedId, select } = useConversationRoute();

  async function startConversation() {
    const conversation = await create();
    select(conversation.id);
  }

  async function renameConversation(conversationId: string, currentTitle: string) {
    const title = window.prompt('Novo título da conversa:', currentTitle)?.trim();
    if (title && title !== currentTitle) {
      await rename(conversationId, title);
    }
  }

  async function deleteConversation(conversationId: string, title: string) {
    if (window.confirm(`Apagar a conversa "${title}"? Esta ação não pode ser desfeita.`)) {
      await remove(conversationId);
      if (conversationId === selectedId) {
        select(null);
      }
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-semibold text-slate-900">chat-tess</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-700">{user.name}</span>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white max-sm:w-48">
          {loadError && (
            <p role="alert" className="px-3 pt-3 text-sm text-red-700">
              {loadError}
            </p>
          )}
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={select}
            onCreate={() => void startConversation()}
            onRename={(id, title) => void renameConversation(id, title)}
            onDelete={(id, title) => void deleteConversation(id, title)}
          />
        </aside>

        <main className="min-w-0 flex-1">
          {selectedId ? (
            <ChatView
              key={selectedId}
              conversationId={selectedId}
              onTurnFinished={() => void refresh()}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
              <p className="text-slate-600">Converse com o agente, envie imagens e PDFs.</p>
              <button
                type="button"
                onClick={() => void startConversation()}
                className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
              >
                Começar uma conversa
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
