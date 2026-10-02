import { MAX_ATTACHMENTS_PER_MESSAGE, type AttachmentPart } from '@chat-tess/shared';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  ACCEPTED_FILE_TYPES,
  listPendingAttachments,
  removePendingAttachment,
  uploadAttachment,
} from '../../api/attachments-api';
import { ApiError } from '../../api/http-client';
import { composerDrafts } from './composer-drafts-store';
import { uploadQueue } from './upload-queue';

export interface ComposerProps {
  conversationId: string;
  isStreaming: boolean;
  onSend(text: string, attachments: AttachmentPart[]): void;
  onStop(): void;
}

/**
 * Campo de mensagem com anexos. Enter envia; Shift+Enter quebra a linha.
 * O rascunho vive no `composerDrafts`: continua lá se o usuário abrir outra conversa.
 */
export function Composer({ conversationId, isStreaming, onSend, onStop }: ComposerProps) {
  const { text, attachments, uploadingCount } = useSyncExternalStore(composerDrafts.subscribe, () =>
    composerDrafts.draftOf(conversationId),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Ao abrir a conversa, recupera os anexos que ficaram por enviar (por exemplo,
  // depois de recarregar a página). Se a consulta falhar, o rascunho só fica sem eles.
  useEffect(() => {
    listPendingAttachments(conversationId).then(
      (pending) => composerDrafts.restoreAttachments(conversationId, pending),
      () => undefined,
    );
  }, [conversationId]);

  const freeAttachmentSlots = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length - uploadingCount;
  const canSend =
    !isStreaming && uploadingCount === 0 && (text.trim() !== '' || attachments.length > 0);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) {
      return;
    }
    onSend(text.trim(), [...attachments]);
    composerDrafts.clearSent(conversationId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  /**
   * Põe na fila de uploads os arquivos que ainda cabem na mensagem e avisa dos
   * que ficaram de fora. Sobem um por vez, depois dos que já estão na fila.
   */
  async function uploadFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    // Libera o campo já, para o usuário poder escolher mais arquivos enquanto estes sobem.
    if (fileInput.current) {
      fileInput.current.value = '';
    }
    const fitting = selected.slice(0, freeAttachmentSlots);
    setUploadError(
      fitting.length < selected.length
        ? `Cada mensagem leva até ${MAX_ATTACHMENTS_PER_MESSAGE} anexos. ` +
            `Ficaram de fora ${selected.length - fitting.length} dos arquivos escolhidos.`
        : null,
    );

    // A API recusou por limite (429: rate limit, anexos pendentes, teto em MB ou
    // upload em andamento): os arquivos seguintes desta leva não são tentados.
    let hasReachedLimit = false;
    const uploads = fitting.map((file) => {
      composerDrafts.uploadStarted(conversationId);
      return uploadQueue.enqueue(async () => {
        if (hasReachedLimit) {
          composerDrafts.uploadFinished(conversationId);
          return;
        }
        try {
          const attachment = await uploadAttachment(conversationId, file);
          composerDrafts.uploadFinished(conversationId, attachment);
        } catch (error) {
          composerDrafts.uploadFinished(conversationId);
          setUploadError(
            error instanceof ApiError ? error.message : `Falha ao enviar ${file.name}.`,
          );
          hasReachedLimit = error instanceof ApiError && error.status === 429;
        }
      });
    });
    await Promise.all(uploads);
  }

  /** Apaga o arquivo na API; o anexo só sai da lista se a remoção der certo. */
  async function removeAttachment(attachment: AttachmentPart) {
    setUploadError(null);
    try {
      await removePendingAttachment(attachment.attachmentId);
      composerDrafts.removeAttachment(conversationId, attachment.attachmentId);
    } catch (error) {
      setUploadError(
        error instanceof ApiError ? error.message : `Falha ao remover ${attachment.fileName}.`,
      );
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-slate-200 bg-white p-3">
      {(attachments.length > 0 || uploadingCount > 0) && (
        <ul aria-label="Anexos a enviar" className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.attachmentId}
              className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-xs"
            >
              {attachment.fileName}
              <button
                type="button"
                aria-label={`Remover ${attachment.fileName}`}
                onClick={() => void removeAttachment(attachment)}
                className="rounded-full px-1.5 hover:bg-slate-200"
              >
                ✕
              </button>
            </li>
          ))}
          {uploadingCount > 0 && <li className="py-1 text-xs text-slate-500">Enviando arquivo…</li>}
        </ul>
      )}

      {uploadError && (
        <p role="alert" className="text-sm text-red-700">
          {uploadError}
        </p>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          multiple
          hidden
          aria-label="Anexar arquivos"
          onChange={(event) => void uploadFiles(event.target.files)}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={isStreaming || freeAttachmentSlots <= 0}
          className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          title={
            freeAttachmentSlots > 0
              ? 'Anexar PDF ou imagem'
              : `Limite de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem`
          }
        >
          📎<span className="sr-only">Anexar</span>
        </button>
        <textarea
          value={text}
          onChange={(event) => composerDrafts.setText(conversationId, event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Escreva uma mensagem…"
          aria-label="Mensagem"
          className="max-h-48 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-lg bg-slate-200 px-4 py-2 font-medium text-slate-800 hover:bg-slate-300"
          >
            Parar
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Enviar
          </button>
        )}
      </div>
    </form>
  );
}
