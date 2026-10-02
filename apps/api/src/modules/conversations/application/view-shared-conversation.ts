import type { EventPublisher } from '../../../kernel/events/domain-event';
import type { Clock } from '../../../kernel/time/clock';
import { SharedConversationNotFoundError } from '../domain/conversation-errors';
import type { SharedConversationViewed } from '../domain/conversation-events';
import { SHARE_TOKEN_PATTERN } from '../domain/conversation-share';
import type { ConversationShareRepository, MessageRepository } from '../domain/ports';
import type { ConversationWithMessages, HistoryPage } from './get-conversation';

/**
 * Abre a conversa pelo link, para qualquer usuário logado. Mostra só o que a
 * tela do dono mostra: mensagens do usuário e do assistente. Resultados de
 * tools, que podem trazer conteúdo de terceiros, ficam de fora.
 * A auditoria registra a abertura do link, não cada página do histórico.
 */
export class ViewSharedConversation {
  constructor(
    private readonly shares: ConversationShareRepository,
    private readonly messages: MessageRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(
    token: string,
    viewerId: string,
    page: HistoryPage,
  ): Promise<ConversationWithMessages> {
    const conversation = SHARE_TOKEN_PATTERN.test(token)
      ? await this.shares.findSharedConversation(token)
      : null;
    if (!conversation) {
      throw new SharedConversationNotFoundError();
    }

    const { messages, hasEarlier } = await this.messages.listPage(conversation.id, {
      ...page,
      roles: ['user', 'assistant'],
    });

    const isOpeningTheLink = page.beforeSequence === undefined;
    if (isOpeningTheLink) {
      await this.events.publish({
        type: 'conversation.share_viewed',
        occurredAt: this.clock.now(),
        actorUserId: viewerId,
        payload: { conversationId: conversation.id },
      } satisfies SharedConversationViewed);
    }

    return { conversation, messages, hasEarlierMessages: hasEarlier };
  }
}
