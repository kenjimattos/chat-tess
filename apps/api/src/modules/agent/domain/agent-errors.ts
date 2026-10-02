import { AppError } from '../../../kernel/errors/app-error';

export class EmptyMessageError extends AppError {
  constructor() {
    super('validation', 'empty_message', 'Escreva uma mensagem ou envie um anexo.');
  }
}

export class NoMessageToResendError extends AppError {
  constructor() {
    super(
      'validation',
      'no_message_to_resend',
      'Esta conversa ainda não tem uma mensagem sua para reenviar.',
    );
  }
}

export class NoPendingApprovalError extends AppError {
  constructor() {
    super(
      'conflict',
      'no_pending_approval',
      'Esta conversa não tem um pedido de autorização em aberto.',
    );
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

/** O provedor interrompeu a resposta por política de segurança. */
export class ResponseBlockedError extends AppError {
  constructor() {
    super(
      'forbidden',
      'response_blocked',
      'O modelo não pode responder a este pedido por política de segurança. Reformule a mensagem.',
    );
  }
}

/** A resposta chegou ao limite de tamanho de saída do modelo e foi cortada. */
export class ResponseTruncatedError extends AppError {
  constructor() {
    super(
      'limit_exceeded',
      'response_truncated',
      'A resposta ficou longa demais e foi cortada. Peça para o assistente continuar.',
    );
  }
}
