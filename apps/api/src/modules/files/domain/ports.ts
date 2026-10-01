import type { Attachment } from './attachment';

export interface FileStorage {
  /** Grava o conteúdo e devolve o endereço dele no armazenamento. */
  save(key: string, content: Buffer, mimeType: string): Promise<string>;
  read(storageUri: string): Promise<Buffer>;
  /** Apaga o arquivo; não falha se ele já não existir. */
  delete(storageUri: string): Promise<void>;
  /** Apaga tudo o que foi gravado com chaves dentro da pasta; não falha se ela não existir. */
  deleteFolder(folderKey: string): Promise<void>;
  /**
   * Endereço que o LLM consegue ler direto (por exemplo, gs:// no Agent Platform),
   * ou `null` quando o conteúdo precisa ir embutido na requisição.
   */
  uriReadableByModel(storageUri: string): string | null;
}

export type NewAttachment = Omit<Attachment, 'id' | 'messageId'>;

export interface AttachmentRepository {
  create(attachment: NewAttachment): Promise<Attachment>;
  findById(id: string): Promise<Attachment | null>;
  findByIds(ids: string[]): Promise<Attachment[]>;
  /** Anexos da conversa ainda não enviados em uma mensagem, do mais antigo para o mais novo. */
  listPending(conversationId: string): Promise<Attachment[]>;
  /** Soma dos tamanhos dos anexos pendentes do usuário, em todas as conversas. */
  pendingBytesOf(userId: string): Promise<number>;
  linkToMessage(ids: string[], messageId: string): Promise<void>;
  delete(id: string): Promise<void>;
}
