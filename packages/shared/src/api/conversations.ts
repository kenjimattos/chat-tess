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

export const conversationDetailSchema = z.object({
  conversation: conversationSummarySchema,
  messages: z.array(conversationMessageSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const createConversationRequestSchema = z.object({
  title: z.string().optional(),
});

export const renameConversationRequestSchema = z.object({
  title: z.string(),
});
