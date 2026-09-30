import type { Attachment } from '../domain/attachment';
import { AttachmentNotFoundError } from '../domain/file-errors';
import type { AttachmentRepository, FileStorage } from '../domain/ports';

export interface AttachmentContent {
  attachment: Attachment;
  content: Buffer;
}

/** Devolve o arquivo ao dono, para exibir a imagem ou abrir o PDF na conversa. */
export class ReadAttachment {
  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(attachmentId: string, userId: string): Promise<AttachmentContent> {
    const attachment = await this.attachments.findById(attachmentId);
    if (!attachment || attachment.userId !== userId) {
      throw new AttachmentNotFoundError(attachmentId);
    }

    return { attachment, content: await this.storage.read(attachment.storageUri) };
  }
}
