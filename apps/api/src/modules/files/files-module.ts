import type { RequestHandler, Router } from 'express';
import type { FileStorageConfig } from '../../infra/config/env';
import type { Database } from '../../infra/database/database';
import type { InProcessEventBus } from '../../infra/events/in-process-event-bus';
import type { Clock } from '../../kernel/time/clock';
import type { AttachmentCatalog } from '../agent/domain/attachment-catalog';
import type {
  ConversationRepository,
  ConversationShareRepository,
} from '../conversations/domain/ports';
import type { ConversationDeleted } from '../conversations/domain/conversation-events';
import { DeleteConversationFiles } from './application/delete-conversation-files';
import { ListPendingAttachments } from './application/list-pending-attachments';
import { ReadAttachment } from './application/read-attachment';
import { ReadSharedAttachment } from './application/read-shared-attachment';
import { RemovePendingAttachment } from './application/remove-pending-attachment';
import { StoredAttachmentCatalog } from './application/stored-attachment-catalog';
import { UploadAttachment } from './application/upload-attachment';
import type { FileStorage } from './domain/ports';
import { createFilesRouter } from './http/files-router';
import { GcsFileStorage } from './infra/gcs-file-storage';
import { LocalFileStorage } from './infra/local-file-storage';
import { PrismaAttachmentRepository } from './infra/prisma-attachment-repository';

export interface FilesModuleDependencies {
  database: Database;
  eventBus: InProcessEventBus;
  clock: Clock;
  requireAuthentication: RequestHandler;
  limitUploads: RequestHandler;
  conversations: ConversationRepository;
  /** Libera os anexos de conversas compartilhadas por link. */
  shares: ConversationShareRepository;
  storage: FileStorageConfig;
  maxSizeBytes: number;
  maxPendingBytesPerUser: number;
}

export interface FilesModule {
  router: Router;
  /** Usado pelo agente para validar anexos e enviá-los ao LLM. */
  attachmentCatalog: AttachmentCatalog;
}

export function createFilesModule(deps: FilesModuleDependencies): FilesModule {
  const attachments = new PrismaAttachmentRepository(deps.database);
  const storage = createFileStorage(deps.storage);

  const deleteConversationFiles = new DeleteConversationFiles(storage);
  deps.eventBus.subscribe('conversation.deleted', (event) =>
    deleteConversationFiles.execute(event as ConversationDeleted),
  );

  return {
    router: createFilesRouter({
      requireAuthentication: deps.requireAuthentication,
      uploadRateLimit: deps.limitUploads,
      uploadAttachment: new UploadAttachment(
        deps.conversations,
        attachments,
        storage,
        deps.eventBus,
        deps.clock,
        { maxSizeBytes: deps.maxSizeBytes, maxPendingBytesPerUser: deps.maxPendingBytesPerUser },
      ),
      listPendingAttachments: new ListPendingAttachments(deps.conversations, attachments),
      removePendingAttachment: new RemovePendingAttachment(
        attachments,
        storage,
        deps.eventBus,
        deps.clock,
      ),
      readAttachment: new ReadAttachment(attachments, storage),
      readSharedAttachment: new ReadSharedAttachment(deps.shares, attachments, storage),
      maxSizeBytes: deps.maxSizeBytes,
    }),
    attachmentCatalog: new StoredAttachmentCatalog(attachments, storage),
  };
}

function createFileStorage(config: FileStorageConfig): FileStorage {
  return config.kind === 'gcs'
    ? new GcsFileStorage(config.bucket)
    : new LocalFileStorage(config.rootDir);
}
