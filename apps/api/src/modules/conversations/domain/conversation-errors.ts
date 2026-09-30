import { AppError } from '../../../shared/errors/app-error';

/**
 * Também usado quando a conversa existe mas pertence a outro usuário:
 * responder "não encontrada" evita revelar que ela existe.
 */
export class ConversationNotFoundError extends AppError {
  constructor(conversationId: string) {
    super('not_found', 'conversation_not_found', 'Conversa não encontrada.', { conversationId });
  }
}

/** Token inexistente ou revogado: nos dois casos, o link não leva a nada. */
export class SharedConversationNotFoundError extends AppError {
  constructor() {
    super(
      'not_found',
      'shared_conversation_not_found',
      'Este link de compartilhamento não existe ou foi revogado.',
    );
  }
}
