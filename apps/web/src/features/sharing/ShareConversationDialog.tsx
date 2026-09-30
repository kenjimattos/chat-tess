import type { ConversationShareResponse } from '@chat-tess/shared';
import { useEffect, useState } from 'react';
import {
  getConversationShare,
  revokeConversationShare,
  shareConversation,
  sharedConversationUrl,
} from '../../api/conversations-api';

export interface ShareConversationDialogProps {
  conversationId: string;
  title: string;
  onClose(): void;
}

type ShareState =
  | { status: 'loading' }
  | { status: 'not_shared' }
  | { status: 'shared'; share: ConversationShareResponse };

/** Gera, copia e revoga o link somente leitura da conversa. */
export function ShareConversationDialog({
  conversationId,
  title,
  onClose,
}: ShareConversationDialogProps) {
  const [state, setState] = useState<ShareState>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [wasCopied, setWasCopied] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    getConversationShare(conversationId).then(
      (share) =>
        isCurrent && setState(share ? { status: 'shared', share } : { status: 'not_shared' }),
      () => isCurrent && setError('Não foi possível carregar o compartilhamento.'),
    );
    return () => {
      isCurrent = false;
    };
  }, [conversationId]);

  async function run(action: () => Promise<ShareState>, failure: string) {
    setError(null);
    try {
      setState(await action());
    } catch {
      setError(failure);
    }
  }

  const createLink = () =>
    run(
      async () => ({ status: 'shared', share: await shareConversation(conversationId) }),
      'Não foi possível gerar o link.',
    );

  const revokeLink = () =>
    run(async () => {
      await revokeConversationShare(conversationId);
      setWasCopied(false);
      return { status: 'not_shared' };
    }, 'Não foi possível revogar o link.');

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setWasCopied(true);
    } catch {
      setError('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Compartilhar conversa"
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
    >
      <section
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Compartilhar conversa</h2>
            <p className="truncate text-sm text-slate-500">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
          >
            Fechar
          </button>
        </header>

        <p className="text-sm text-slate-600">
          Quem tiver o link e acesso ao chat-tess vê a conversa, inclusive as mensagens futuras, mas
          não pode enviar mensagens.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {state.status === 'loading' && !error && (
          <p className="text-sm text-slate-500">Carregando…</p>
        )}

        {state.status === 'not_shared' && (
          <button
            type="button"
            onClick={() => void createLink()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Gerar link
          </button>
        )}

        {state.status === 'shared' && (
          <SharedLink
            url={sharedConversationUrl(state.share.token)}
            wasCopied={wasCopied}
            onCopy={(url) => void copyLink(url)}
            onRevoke={() => void revokeLink()}
          />
        )}
      </section>
    </div>
  );
}

interface SharedLinkProps {
  url: string;
  wasCopied: boolean;
  onCopy(url: string): void;
  onRevoke(): void;
}

function SharedLink({ url, wasCopied, onCopy, onRevoke }: SharedLinkProps) {
  return (
    <div className="space-y-3">
      <input
        readOnly
        value={url}
        aria-label="Link de compartilhamento"
        onFocus={(event) => event.target.select()}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCopy(url)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {wasCopied ? 'Copiado' : 'Copiar link'}
        </button>
        <button
          type="button"
          onClick={onRevoke}
          className="rounded-lg px-4 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          Revogar link
        </button>
      </div>
    </div>
  );
}
