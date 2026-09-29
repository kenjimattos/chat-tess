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
