import { Router, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../../../shared/errors/app-error';
import { authenticatedUser } from '../../auth/http/require-authentication';
import { conversationIdOf } from '../../conversations/http/conversations-router';
import type { ReadAttachment } from '../application/read-attachment';
import type { UploadAttachment } from '../application/upload-attachment';
import { FileTooLargeError } from '../domain/file-errors';

export interface FilesRouterOptions {
  requireAuthentication: RequestHandler;
  uploadAttachment: UploadAttachment;
  readAttachment: ReadAttachment;
  maxSizeBytes: number;
}

/**
 * - POST /conversations/:id/attachments   envia um arquivo (multipart, campo "file")
 * - GET  /attachments/:id                  devolve o arquivo ao dono
 */
export function createFilesRouter(options: FilesRouterOptions): Router {
  const router = Router();
  const receiveSingleFile = createSingleFileReceiver(options.maxSizeBytes);

  router.post(
    '/conversations/:conversationId/attachments',
    options.requireAuthentication,
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
    '/attachments/:attachmentId',
    options.requireAuthentication,
    async (request, response) => {
      const { attachment, content } = await options.readAttachment.execute(
        String(request.params.attachmentId),
        authenticatedUser(response).id,
      );

      response
        .type(attachment.mimeType)
        .set({
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        })
        .send(content);
    },
  );

  return router;
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
