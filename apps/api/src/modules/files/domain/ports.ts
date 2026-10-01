import type { Attachment } from './attachment';

export interface FileStorage {
  /** Grava o conteúdo e devolve o endereço dele no armazenamento. */
  save(key: string, content: Buffer, mimeType: string): Promise<string>;
  read(storageUri: string): Promise<Buffer>;
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
  linkToMessage(ids: string[], messageId: string): Promise<void>;
}
