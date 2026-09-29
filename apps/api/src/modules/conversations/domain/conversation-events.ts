import type { DomainEvent } from '../../../shared/events/domain-event';

export type ConversationCreated = DomainEvent<
  'conversation.created',
  { conversationId: string; title: string }
>;

export type ConversationRenamed = DomainEvent<
  'conversation.renamed',
  { conversationId: string; title: string }
>;

export type ConversationDeleted = DomainEvent<'conversation.deleted', { conversationId: string }>;
