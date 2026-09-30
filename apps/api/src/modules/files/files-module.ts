import type { RequestHandler, Router } from 'express';
import type { Database } from '../../shared/database/database';
import type { EventPublisher } from '../../shared/events/domain-event';
import type { Clock } from '../../shared/time/clock';
import type { AttachmentCatalog } from '../agent/domain/attachment-catalog';
import type { ConversationRepository } from '../conversations/domain/ports';
import { ReadAttachment } from './application/read-attachment';
import { StoredAttachmentCatalog } from './application/stored-attachment-catalog';
import { UploadAttachment } from './application/upload-attachment';
import type { FileStorage } from './domain/ports';
import { createFilesRouter } from './http/files-router';
import { GcsFileStorage } from './infra/gcs-file-storage';
import { LocalFileStorage } from './infra/local-file-storage';
import { PrismaAttachmentRepository } from './infra/prisma-attachment-repository';

export type FileStorageConfig =
  { kind: 'local'; rootDir: string } | { kind: 'gcs'; bucket: string };

export interface FilesModuleDependencies {
  database: Database;
  events: EventPublisher;
  clock: Clock;
  requireAuthentication: RequestHandler;
  conversations: ConversationRepository;
  storage: FileStorageConfig;
  maxSizeBytes: number;
}

export interface FilesModule {
  router: Router;
  /** Usado pelo agente para validar anexos e enviá-los ao LLM. */
  attachmentCatalog: AttachmentCatalog;
}

export function createFilesModule(deps: FilesModuleDependencies): FilesModule {
  const attachments = new PrismaAttachmentRepository(deps.database);
  const storage = createFileStorage(deps.storage);

  return {
    router: createFilesRouter({
      requireAuthentication: deps.requireAuthentication,
      uploadAttachment: new UploadAttachment(
        deps.conversations,
        attachments,
        storage,
        deps.events,
        deps.clock,
        deps.maxSizeBytes,
      ),
      readAttachment: new ReadAttachment(attachments, storage),
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
