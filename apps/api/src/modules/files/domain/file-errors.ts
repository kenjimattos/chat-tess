import { AppError } from '../../../shared/errors/app-error';
import { SUPPORTED_FILE_DESCRIPTION } from './file-type';

export class UnsupportedFileTypeError extends AppError {
  constructor() {
    super(
      'validation',
      'unsupported_file_type',
      `Tipo de arquivo não suportado. Envie ${SUPPORTED_FILE_DESCRIPTION}.`,
    );
  }
}

export class FileTooLargeError extends AppError {
  constructor(maxSizeBytes: number) {
    super(
      'validation',
      'file_too_large',
      `O arquivo passa do limite de ${Math.floor(maxSizeBytes / 1024 / 1024)} MB.`,
    );
  }
}

export class EmptyFileError extends AppError {
  constructor() {
    super('validation', 'empty_file', 'O arquivo está vazio.');
  }
}

export class TooManyPendingAttachmentsError extends AppError {
  constructor(maxPending: number) {
    super(
      'limit_exceeded',
      'too_many_pending_attachments',
      `Cada mensagem leva até ${maxPending} anexos. Envie ou remova os que já estão na conversa.`,
      { maxPending },
    );
  }
}

export class PendingAttachmentsQuotaExceededError extends AppError {
  constructor(maxPendingBytes: number) {
    super(
      'limit_exceeded',
      'pending_attachments_quota_exceeded',
      `Seus anexos ainda não enviados passariam de ${Math.floor(maxPendingBytes / 1024 / 1024)} MB, ` +
        'somando todas as conversas. Envie ou remova alguns antes de anexar outro.',
      { maxPendingBytes },
    );
  }
}

export class AttachmentNotFoundError extends AppError {
  constructor(attachmentId: string) {
    super('not_found', 'attachment_not_found', 'Anexo não encontrado.', { attachmentId });
  }
}

export class AttachmentAlreadySentError extends AppError {
  constructor() {
    super(
      'conflict',
      'attachment_already_sent',
      'Este anexo já foi enviado em uma mensagem e não pode ser removido.',
    );
  }
}

export class InvalidAttachmentError extends AppError {
  constructor() {
    super(
      'validation',
      'invalid_attachment',
      'Um dos anexos não existe, não pertence a esta conversa ou já foi enviado.',
    );
  }
}
