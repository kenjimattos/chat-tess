import {
  attachmentPartSchema,
  pendingAttachmentListSchema,
  type AttachmentPart,
} from '@chat-tess/shared';
import { requestJson, toApiError } from './http-client';

export const ACCEPTED_FILE_TYPES = 'application/pdf,image/png,image/jpeg,image/webp';

export async function uploadAttachment(
  conversationId: string,
  file: File,
): Promise<AttachmentPart> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`/api/conversations/${conversationId}/attachments`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return attachmentPartSchema.parse(await response.json());
}

/** Anexos que já subiram para a conversa e ainda não foram enviados em uma mensagem. */
export async function listPendingAttachments(conversationId: string): Promise<AttachmentPart[]> {
  return pendingAttachmentListSchema.parse(
    await requestJson(`/conversations/${conversationId}/attachments/pending`),
  );
}

/** Remove um anexo ainda não enviado, apagando o arquivo guardado. */
export async function removePendingAttachment(attachmentId: string): Promise<void> {
  await requestJson(`/attachments/${attachmentId}`, { method: 'DELETE' });
}

export function attachmentUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}`;
}

/** Anexo visto por um link de compartilhamento. */
export function sharedAttachmentUrl(token: string, attachmentId: string): string {
  return `/api/shared/${token}/attachments/${attachmentId}`;
}
