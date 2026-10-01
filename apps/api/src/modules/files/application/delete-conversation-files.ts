import type { ConversationDeleted } from '../../conversations/domain/conversation-events';
import { conversationFolderKey } from '../domain/attachment';
import type { FileStorage } from '../domain/ports';

/**
 * Reage à conversa apagada removendo os arquivos dela do armazenamento. Os
 * registros dos anexos saem do banco junto com a conversa; sem este passo, os
 * arquivos ficariam guardados para sempre, sem nada que apontasse para eles.
 */
export class DeleteConversationFiles {
  constructor(private readonly storage: FileStorage) {}

  /** Só o dono apaga a conversa, então `actorUserId` é o dono dos arquivos. */
  async execute({ actorUserId, payload }: ConversationDeleted): Promise<void> {
    if (!actorUserId) {
      return;
    }
    await this.storage.deleteFolder(conversationFolderKey(actorUserId, payload.conversationId));
  }
}
