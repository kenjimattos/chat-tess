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

/** Tetos dos anexos ainda não enviados em uma mensagem. */
export interface PendingAttachmentLimits {
  maxPerConversation: number;
  /** Soma dos tamanhos, em todas as conversas do usuário. */
  maxBytesPerUser: number;
}

export type PendingAttachmentResult =
  | { status: 'created'; attachment: Attachment }
  | { status: 'conversation_full' }
  | { status: 'user_quota_exceeded' };

export interface AttachmentRepository {
  /**
   * Cria o anexo pendente se ele couber nos tetos. Conferir e criar é uma
   * operação só: uploads simultâneos do mesmo usuário não passam juntos do limite.
   */
  createPending(
    attachment: NewAttachment,
    limits: PendingAttachmentLimits,
  ): Promise<PendingAttachmentResult>;
  findById(id: string): Promise<Attachment | null>;
  findByIds(ids: string[]): Promise<Attachment[]>;
  /** Anexos da conversa ainda não enviados em uma mensagem, do mais antigo para o mais novo. */
  listPending(conversationId: string): Promise<Attachment[]>;
  linkToMessage(ids: string[], messageId: string): Promise<void>;
  delete(id: string): Promise<void>;
}
