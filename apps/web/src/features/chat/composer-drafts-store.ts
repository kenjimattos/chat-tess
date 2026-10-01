import type { AttachmentPart } from '@chat-tess/shared';

/** O que o usuário preparou e ainda não enviou numa conversa. */
export interface ComposerDraft {
  text: string;
  /** Anexos já recebidos pela API, à espera da mensagem. */
  attachments: readonly AttachmentPart[];
  /** Arquivos ainda subindo. */
  uploadingCount: number;
}

/** Onde o texto do rascunho é guardado para sobreviver ao recarregamento da página. */
export type DraftTextStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const TEXT_KEY_PREFIX = 'chat-tess:rascunho:';

/**
 * Rascunhos de mensagem, por conversa, no nível do app. Ficam fora do
 * compositor para que trocar de conversa não perca o texto digitado nem os
 * anexos: um arquivo anexado já está guardado na API, e sumir da tela faria o
 * usuário enviar a mensagem sem ele. Um upload que termina com a conversa
 * fechada também entra no rascunho dela.
 *
 * Recarregar a página também não perde o rascunho: o texto fica no
 * `textStorage` (o sessionStorage da aba) e os anexos são relidos da API, que
 * é quem os guarda (`restoreAttachments`).
 *
 * Os snapshots são imutáveis, no formato que o `useSyncExternalStore` espera.
 */
export class ComposerDraftsStore {
  private readonly drafts = new Map<string, ComposerDraft>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly textStorage: DraftTextStorage | null = null) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  draftOf = (conversationId: string): ComposerDraft => {
    const known = this.drafts.get(conversationId);
    if (known) {
      return known;
    }
    const restored = { text: this.storedText(conversationId), attachments: [], uploadingCount: 0 };
    this.drafts.set(conversationId, restored);
    return restored;
  };

  setText(conversationId: string, text: string): void {
    this.update(conversationId, (draft) => ({ ...draft, text }));
    this.storeText(conversationId, text);
  }

  /** Junta ao rascunho os anexos pendentes que a API guarda e a tela ainda não conhece. */
  restoreAttachments(conversationId: string, pending: readonly AttachmentPart[]): void {
    this.update(conversationId, (draft) => {
      const known = new Set(draft.attachments.map((item) => item.attachmentId));
      const missing = pending.filter((item) => !known.has(item.attachmentId));
      return missing.length ? { ...draft, attachments: [...draft.attachments, ...missing] } : draft;
    });
  }

  uploadStarted(conversationId: string): void {
    this.update(conversationId, (draft) => ({
      ...draft,
      uploadingCount: draft.uploadingCount + 1,
    }));
  }

  /** Sem `attachment`, o upload falhou. */
  uploadFinished(conversationId: string, attachment?: AttachmentPart): void {
    this.update(conversationId, (draft) => ({
      ...draft,
      attachments: attachment ? [...draft.attachments, attachment] : draft.attachments,
      uploadingCount: draft.uploadingCount - 1,
    }));
  }

  removeAttachment(conversationId: string, attachmentId: string): void {
    this.update(conversationId, (draft) => ({
      ...draft,
      attachments: draft.attachments.filter((item) => item.attachmentId !== attachmentId),
    }));
  }

  /** Depois de enviar: limpa texto e anexos; uploads em andamento continuam contando. */
  clearSent(conversationId: string): void {
    this.update(conversationId, (draft) => ({ ...draft, text: '', attachments: [] }));
    this.storeText(conversationId, '');
  }

  private storedText(conversationId: string): string {
    return this.textStorage?.getItem(TEXT_KEY_PREFIX + conversationId) ?? '';
  }

  private storeText(conversationId: string, text: string): void {
    if (text) {
      this.textStorage?.setItem(TEXT_KEY_PREFIX + conversationId, text);
    } else {
      this.textStorage?.removeItem(TEXT_KEY_PREFIX + conversationId);
    }
  }

  private update(conversationId: string, change: (draft: ComposerDraft) => ComposerDraft): void {
    const current = this.draftOf(conversationId);
    const changed = change(current);
    if (changed === current) {
      return;
    }
    this.drafts.set(conversationId, changed);
    this.listeners.forEach((listener) => listener());
  }
}

export const composerDrafts = new ComposerDraftsStore(
  typeof sessionStorage === 'undefined' ? null : sessionStorage,
);
