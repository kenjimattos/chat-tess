import {
  conversationDetailSchema,
  conversationListSchema,
  conversationSummarySchema,
  type ConversationDetail,
  type ConversationSummary,
} from '@chat-tess/shared';
import { requestJson, sendJson } from './http-client';

export async function listConversations(): Promise<ConversationSummary[]> {
  return conversationListSchema.parse(await requestJson('/conversations'));
}

export async function createConversation(): Promise<ConversationSummary> {
  return conversationSummarySchema.parse(await sendJson('/conversations', 'POST', {}));
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  return conversationDetailSchema.parse(await requestJson(`/conversations/${conversationId}`));
}

export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<ConversationSummary> {
  return conversationSummarySchema.parse(
    await sendJson(`/conversations/${conversationId}`, 'PATCH', { title }),
  );
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await requestJson(`/conversations/${conversationId}`, { method: 'DELETE' });
}
