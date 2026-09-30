import { AppError } from '../../../shared/errors/app-error';

export class EmptyMessageError extends AppError {
  constructor() {
    super('validation', 'empty_message', 'Escreva uma mensagem ou envie um anexo.');
  }
}

/** Lançado pelo adapter quando o contexto enviado passa do limite do modelo. */
export class ContextWindowExceededError extends AppError {
  constructor() {
    super(
      'limit_exceeded',
      'context_window_exceeded',
      'A conversa ficou longa demais para o modelo, mesmo após a compactação. Inicie uma nova conversa.',
    );
  }
}
