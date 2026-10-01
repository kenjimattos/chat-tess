import type { ConversationMessage } from '@chat-tess/shared';
import { useState, type FormEvent } from 'react';
import { MessageBubble } from './MessageBubble';

export interface LastUserMessageProps {
  message: ConversationMessage;
  /** Refaz o turno com a mesma mensagem. */
  onResend(): void;
  /** Refaz o turno com o texto novo. */
  onEdit(text: string): void;
}

/**
 * A última mensagem do usuário, com as ações de refazer o turno: reenviar como
 * está ou editar o texto antes. A resposta anterior é substituída pela nova.
 */
export function LastUserMessage({ message, onResend, onEdit }: LastUserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <EditForm
        initialText={textOf(message)}
        hasAttachments={message.parts.some((part) => part.type === 'attachment')}
        onCancel={() => setIsEditing(false)}
        onSave={(text) => {
          setIsEditing(false);
          onEdit(text);
        }}
      />
    );
  }

  return (
    <div className="space-y-1">
      <MessageBubble message={message} />
      <div className="flex justify-end gap-1 text-xs text-slate-500">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded px-2 py-1 hover:bg-slate-200"
        >
          Editar
        </button>
        <button type="button" onClick={onResend} className="rounded px-2 py-1 hover:bg-slate-200">
          Reenviar
        </button>
      </div>
    </div>
  );
}

interface EditFormProps {
  initialText: string;
  /** Com anexos, a mensagem pode ficar sem texto. */
  hasAttachments: boolean;
  onCancel(): void;
  onSave(text: string): void;
}

function EditForm({ initialText, hasAttachments, onCancel, onSave }: EditFormProps) {
  const [text, setText] = useState(initialText);
  const canSave = text.trim() !== '' || hasAttachments;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSave) {
      onSave(text.trim());
    }
  }

  return (
    <form onSubmit={submit} className="ml-auto max-w-[85%] space-y-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        autoFocus
        aria-label="Editar mensagem"
        className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
      />
      <div className="flex justify-end gap-2 text-sm">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 hover:bg-slate-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          Salvar e reenviar
        </button>
      </div>
    </form>
  );
}

function textOf(message: ConversationMessage): string {
  return message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}
