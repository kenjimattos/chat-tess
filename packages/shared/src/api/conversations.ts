import { z } from 'zod';
import { messagePartsSchema, messageRoleSchema } from '../message-parts';

/** Datas trafegam em ISO 8601. */
export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationListSchema = z.array(conversationSummarySchema);

export const conversationMessageSchema = z.object({
  id: z.string(),
  sequence: z.number().int().positive(),
  role: messageRoleSchema,
  parts: messagePartsSchema,
  createdAt: z.string(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/**
 * O histórico vem em páginas, das mensagens mais recentes para as mais antigas:
 * sem `before`, as últimas `limit` mensagens; com `before`, as anteriores a essa sequência.
 */
export const messagePageQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const conversationDetailSchema = z.object({
  conversation: conversationSummarySchema,
  /** Uma página do histórico, em ordem de sequência. */
  messages: z.array(conversationMessageSchema),
  /** Há mensagens mais antigas que as desta página. */
  hasEarlierMessages: z.boolean(),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const createConversationRequestSchema = z.object({
  title: z.string().optional(),
});

export const renameConversationRequestSchema = z.object({
  title: z.string(),
});

/** Link somente leitura; a página fica em `/shared/{token}`. */
export const conversationShareSchema = z.object({
  token: z.string(),
  createdAt: z.string(),
});
export type ConversationShareResponse = z.infer<typeof conversationShareSchema>;

/** Estado do compartilhamento para o dono: `share` é `null` enquanto não há link. */
export const conversationShareStateSchema = z.object({
  share: conversationShareSchema.nullable(),
});
export type ConversationShareState = z.infer<typeof conversationShareStateSchema>;

/** O que quem abre o link vê: título e mensagens, sem dados do dono. */
export const sharedConversationSchema = z.object({
  title: z.string(),
  messages: z.array(conversationMessageSchema),
  hasEarlierMessages: z.boolean(),
});
export type SharedConversation = z.infer<typeof sharedConversationSchema>;
