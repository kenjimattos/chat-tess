import { attachmentPartSchema, type AttachmentPart } from '@chat-tess/shared';
import { toApiError } from './http-client';

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

export function attachmentUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}`;
}
