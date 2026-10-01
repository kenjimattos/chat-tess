import type { AttachmentPart } from '@chat-tess/shared';

/** O que o usuário preparou e ainda não enviou numa conversa. */
export interface ComposerDraft {
  text: string;
  /** Anexos já recebidos pela API, à espera da mensagem. */
  attachments: readonly AttachmentPart[];
  /** Arquivos ainda subindo. */
  uploadingCount: number;
}

const EMPTY_DRAFT: ComposerDraft = { text: '', attachments: [], uploadingCount: 0 };

/**
 * Rascunhos de mensagem, por conversa, no nível do app. Ficam fora do
 * compositor para que trocar de conversa não perca o texto digitado nem os
 * anexos: um arquivo anexado já está guardado na API, e sumir da tela faria o
 * usuário enviar a mensagem sem ele. Um upload que termina com a conversa
 * fechada também entra no rascunho dela.
 *
 * Os snapshots são imutáveis, no formato que o `useSyncExternalStore` espera.
 */
export class ComposerDraftsStore {
  private readonly drafts = new Map<string, ComposerDraft>();
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  draftOf = (conversationId: string): ComposerDraft =>
    this.drafts.get(conversationId) ?? EMPTY_DRAFT;

  setText(conversationId: string, text: string): void {
    this.update(conversationId, (draft) => ({ ...draft, text }));
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
  }

  private update(conversationId: string, change: (draft: ComposerDraft) => ComposerDraft): void {
    this.drafts.set(conversationId, change(this.draftOf(conversationId)));
    this.listeners.forEach((listener) => listener());
  }
}

export const composerDrafts = new ComposerDraftsStore();
