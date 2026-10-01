import type { MessagePart } from '@chat-tess/shared';
import type { Message } from '../../conversations/domain/conversation';
import type { AttachmentCatalog } from '../domain/attachment-catalog';
import { attachmentNotice } from '../domain/attachment-notice';
import type { AttachmentSource, LlmContentPart, LlmMessage } from '../domain/llm';

/**
 * Converte o histórico salvo nas mensagens enviadas ao LLM, resolvendo os anexos.
 * Cada anexo vai precedido do aviso de que o conteúdo dele é material a analisar.
 */
export async function buildLlmMessages(
  messages: readonly Message[],
  attachments: AttachmentCatalog,
): Promise<LlmMessage[]> {
  const attachmentIds = messages.flatMap((message) =>
    message.parts.flatMap((part) => (part.type === 'attachment' ? [part.attachmentId] : [])),
  );
  const sources = attachmentIds.length
    ? await attachments.resolveSources(attachmentIds)
    : new Map();

  return messages.map((message) => ({
    role: message.role,
    parts: message.parts.flatMap((part) => toLlmParts(part, sources)),
  }));
}

function toLlmParts(part: MessagePart, sources: Map<string, AttachmentSource>): LlmContentPart[] {
  if (part.type !== 'attachment') {
    return [part];
  }

  const source = sources.get(part.attachmentId);
  if (!source) {
    return [{ type: 'text', text: `[anexo indisponível: ${part.fileName}]` }];
  }
  return [
    attachmentNotice(part.fileName),
    { type: 'attachment', fileName: part.fileName, mimeType: part.mimeType, source },
  ];
}
