import type { AttachmentPart } from '@chat-tess/shared';
import type { AttachmentSource } from './llm';

export interface AttachmentOwner {
  userId: string;
  conversationId: string;
}

/** O que o agente precisa dos anexos; o armazenamento fica no módulo de arquivos. */
export interface AttachmentCatalog {
  /**
   * Devolve os anexos enviados pelo usuário nesta conversa e ainda não usados
   * em outra mensagem. Lança erro se algum não existir ou não for dele.
   */
  findPendingForMessage(attachmentIds: string[], owner: AttachmentOwner): Promise<AttachmentPart[]>;
  attachToMessage(attachmentIds: string[], messageId: string): Promise<void>;
  /** Endereço ou conteúdo de cada anexo, para envio ao LLM. */
  resolveSources(attachmentIds: string[]): Promise<Map<string, AttachmentSource>>;
}
