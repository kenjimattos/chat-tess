import type { AttachmentPart } from '@chat-tess/shared';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ACCEPTED_FILE_TYPES, uploadAttachment } from '../../api/attachments-api';
import { ApiError } from '../../api/http-client';

export interface ComposerProps {
  conversationId: string;
  isStreaming: boolean;
  onSend(text: string, attachments: AttachmentPart[]): void;
  onStop(): void;
}

/** Campo de mensagem com anexos. Enter envia; Shift+Enter quebra a linha. */
export function Composer({ conversationId, isStreaming, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentPart[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const canSend =
    !isStreaming && uploadingCount === 0 && (text.trim() !== '' || attachments.length > 0);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) {
      return;
    }
    onSend(text.trim(), attachments);
    setText('');
    setAttachments([]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  async function uploadFiles(files: FileList | null) {
    setUploadError(null);
    for (const file of Array.from(files ?? [])) {
      setUploadingCount((count) => count + 1);
      try {
        const attachment = await uploadAttachment(conversationId, file);
        setAttachments((current) => [...current, attachment]);
      } catch (error) {
        setUploadError(error instanceof ApiError ? error.message : `Falha ao enviar ${file.name}.`);
      } finally {
        setUploadingCount((count) => count - 1);
      }
    }
    if (fileInput.current) {
      fileInput.current.value = '';
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
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((item) => item.attachmentId !== attachment.attachmentId),
                  )
                }
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
          disabled={isStreaming}
          className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          title="Anexar PDF ou imagem"
        >
          📎<span className="sr-only">Anexar</span>
        </button>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
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
