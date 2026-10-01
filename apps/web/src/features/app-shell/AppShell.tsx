import type { CurrentUser } from '@chat-tess/shared';
import { useState, useSyncExternalStore } from 'react';
import { activeTurns } from '../chat/active-turns-store';
import { ChatView } from '../chat/ChatView';
import { ConversationList } from '../conversations/ConversationList';
import { ShareConversationDialog } from '../sharing/ShareConversationDialog';
import { ToolSettingsPanel } from '../tools/ToolSettingsPanel';
import { useConversations } from '../conversations/useConversations';
import { UsageMeter } from '../usage/UsageMeter';
import { useUsage } from '../usage/useUsage';
import { useConversationRoute } from './useConversationRoute';
import { useUnloadWarning } from './useUnloadWarning';

export interface AppShellProps {
  user: CurrentUser;
  onSignOut(): void;
}

/** Tela principal depois do login: conversas à esquerda, chat à direita. */
export function AppShell({ user, onSignOut }: AppShellProps) {
  const { conversations, loadError, create, rename, remove, refresh } = useConversations();
  const { selectedId, select } = useConversationRoute();
  const { usage, refresh: refreshUsage } = useUsage();
  const [isToolSettingsOpen, setIsToolSettingsOpen] = useState(false);
  const [sharing, setSharing] = useState<{ conversationId: string; title: string } | null>(null);
  const respondingIds = useSyncExternalStore(activeTurns.subscribe, activeTurns.responding);
  // Fechar a aba corta as respostas em andamento.
  useUnloadWarning(respondingIds.size > 0);

  function handleTurnFinished() {
    void refresh();
    void refreshUsage();
  }

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
      {isToolSettingsOpen && <ToolSettingsPanel onClose={() => setIsToolSettingsOpen(false)} />}
      {sharing && (
        <ShareConversationDialog
          conversationId={sharing.conversationId}
          title={sharing.title}
          onClose={() => setSharing(null)}
        />
      )}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-semibold text-slate-900">chat-tess</span>
        <div className="flex items-center gap-4 text-sm">
          {usage && <UsageMeter usage={usage} />}
          <button
            type="button"
            onClick={() => setIsToolSettingsOpen(true)}
            className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
          >
            Ferramentas
          </button>
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
            respondingIds={respondingIds}
            onSelect={select}
            onCreate={() => void startConversation()}
            onRename={(id, title) => void renameConversation(id, title)}
            onShare={(conversationId, title) => setSharing({ conversationId, title })}
            onDelete={(id, title) => void deleteConversation(id, title)}
          />
        </aside>

        <main className="min-w-0 flex-1">
          {selectedId ? (
            <ChatView
              key={selectedId}
              conversationId={selectedId}
              onTurnFinished={handleTurnFinished}
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
