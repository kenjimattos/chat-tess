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

export type ConversationShared = DomainEvent<'conversation.shared', { conversationId: string }>;

export type ConversationShareRevoked = DomainEvent<
  'conversation.share_revoked',
  { conversationId: string }
>;

/** Quem abriu o link fica em `actorUserId`. */
export type SharedConversationViewed = DomainEvent<
  'conversation.share_viewed',
  { conversationId: string }
>;
