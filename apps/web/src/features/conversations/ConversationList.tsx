import type { ConversationSummary } from '@chat-tess/shared';

export interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect(conversationId: string): void;
  onCreate(): void;
  onRename(conversationId: string, currentTitle: string): void;
  onDelete(conversationId: string, title: string): void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: ConversationListProps) {
  return (
    <nav aria-label="Conversas" className="flex h-full flex-col gap-2 p-3">
      <button
        type="button"
        onClick={onCreate}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Nova conversa
      </button>

      {conversations.length === 0 && (
        <p className="px-2 py-4 text-sm text-slate-500">Nenhuma conversa ainda.</p>
      )}

      <ul className="flex-1 space-y-1 overflow-y-auto">
        {conversations.map((conversation) => {
          const isSelected = conversation.id === selectedId;
          return (
            <li key={conversation.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={isSelected ? 'page' : undefined}
                className={`flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm ${
                  isSelected
                    ? 'bg-slate-200 font-medium text-slate-900'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {conversation.title}
              </button>
              <button
                type="button"
                aria-label={`Renomear ${conversation.title}`}
                onClick={() => onRename(conversation.id, conversation.title)}
                className="rounded p-1 text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 focus:opacity-100"
              >
                ✎
              </button>
              <button
                type="button"
                aria-label={`Apagar ${conversation.title}`}
                onClick={() => onDelete(conversation.id, conversation.title)}
                className="rounded p-1 text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-700 focus:opacity-100"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
