import { Router, type RequestHandler, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../../../kernel/errors/app-error';
import { authenticatedUser } from '../../auth/http/require-authentication';
import { conversationIdOf } from '../../conversations/http/conversations-router';
import type { ListPendingAttachments } from '../application/list-pending-attachments';
import type { AttachmentContent, ReadAttachment } from '../application/read-attachment';
import type { ReadSharedAttachment } from '../application/read-shared-attachment';
import type { RemovePendingAttachment } from '../application/remove-pending-attachment';
import type { UploadAttachment } from '../application/upload-attachment';
import { FileTooLargeError } from '../domain/file-errors';
import { createOneUploadAtATime } from './one-upload-at-a-time';

export interface FilesRouterOptions {
  requireAuthentication: RequestHandler;
  /** Rate limit de uploads, aplicado antes de receber o arquivo. */
  uploadRateLimit: RequestHandler;
  uploadAttachment: UploadAttachment;
  listPendingAttachments: ListPendingAttachments;
  removePendingAttachment: RemovePendingAttachment;
  readAttachment: ReadAttachment;
  readSharedAttachment: ReadSharedAttachment;
  maxSizeBytes: number;
}

/**
 * - POST   /conversations/:id/attachments          envia um arquivo (multipart, campo "file")
 * - GET    /conversations/:id/attachments/pending  anexos ainda não enviados em uma mensagem
 * - GET    /attachments/:id                        devolve o arquivo ao dono
 * - DELETE /attachments/:id                        remove um anexo ainda não enviado
 * - GET    /shared/:token/attachments/:id          devolve o anexo de uma conversa compartilhada
 */
export function createFilesRouter(options: FilesRouterOptions): Router {
  const router = Router();
  const receiveSingleFile = createSingleFileReceiver(options.maxSizeBytes);

  router.post(
    '/conversations/:conversationId/attachments',
    options.requireAuthentication,
    options.uploadRateLimit,
    createOneUploadAtATime(),
    receiveSingleFile,
    async (request, response) => {
      if (!request.file) {
        throw new AppError('validation', 'missing_file', 'Envie o arquivo no campo "file".');
      }

      const attachment = await options.uploadAttachment.execute({
        userId: authenticatedUser(response).id,
        conversationId: conversationIdOf(request),
        fileName: decodeFileName(request.file.originalname),
        content: request.file.buffer,
      });
      response.status(201).json(attachment);
    },
  );

  router.get(
    '/conversations/:conversationId/attachments/pending',
    options.requireAuthentication,
    async (request, response) => {
      const pending = await options.listPendingAttachments.execute(
        conversationIdOf(request),
        authenticatedUser(response).id,
      );
      response.json(pending);
    },
  );

  router.delete(
    '/attachments/:attachmentId',
    options.requireAuthentication,
    async (request, response) => {
      await options.removePendingAttachment.execute(
        String(request.params.attachmentId),
        authenticatedUser(response).id,
      );
      response.status(204).end();
    },
  );

  router.get(
    '/attachments/:attachmentId',
    options.requireAuthentication,
    async (request, response) => {
      const file = await options.readAttachment.execute(
        String(request.params.attachmentId),
        authenticatedUser(response).id,
      );
      sendAttachment(response, file, 'private, max-age=3600');
    },
  );

  router.get(
    '/shared/:token/attachments/:attachmentId',
    options.requireAuthentication,
    async (request, response) => {
      const file = await options.readSharedAttachment.execute(
        String(request.params.token),
        String(request.params.attachmentId),
      );
      // Sem cache: depois de revogar o link, o anexo não pode continuar aparecendo.
      sendAttachment(response, file, 'private, no-store');
    },
  );

  return router;
}

function sendAttachment(
  response: Response,
  { attachment, content }: AttachmentContent,
  cacheControl: string,
): void {
  response
    .type(attachment.mimeType)
    .set({
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    })
    .send(content);
}

/** Recebe um arquivo em memória; o limite de tamanho vira um erro de negócio. */
function createSingleFileReceiver(maxSizeBytes: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes, files: 1 },
  }).single('file');

  return (request, response, next) => {
    upload(request, response, (error: unknown) => {
      if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new FileTooLargeError(maxSizeBytes));
        return;
      }
      if (error instanceof MulterError) {
        next(
          new AppError('validation', 'invalid_upload', 'Envie um único arquivo no campo "file".'),
        );
        return;
      }
      next(error);
    });
  };
}

/** O multer lê o nome do arquivo como latin1; nomes com acento chegam em UTF-8. */
function decodeFileName(originalName: string): string {
  return Buffer.from(originalName, 'latin1').toString('utf8');
}
