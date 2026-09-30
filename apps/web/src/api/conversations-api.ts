import {
  conversationDetailSchema,
  conversationListSchema,
  conversationShareSchema,
  conversationShareStateSchema,
  conversationSummarySchema,
  sharedConversationSchema,
  type ConversationDetail,
  type ConversationShareResponse,
  type ConversationSummary,
  type SharedConversation,
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

export async function getConversationShare(
  conversationId: string,
): Promise<ConversationShareResponse | null> {
  const state = conversationShareStateSchema.parse(
    await requestJson(`/conversations/${conversationId}/share`),
  );
  return state.share;
}

export async function shareConversation(
  conversationId: string,
): Promise<ConversationShareResponse> {
  return conversationShareSchema.parse(
    await sendJson(`/conversations/${conversationId}/share`, 'PUT', {}),
  );
}

export async function revokeConversationShare(conversationId: string): Promise<void> {
  await requestJson(`/conversations/${conversationId}/share`, { method: 'DELETE' });
}

export async function getSharedConversation(token: string): Promise<SharedConversation> {
  return sharedConversationSchema.parse(await requestJson(`/shared/${token}`));
}

/** Endereço da página que mostra a conversa compartilhada. */
export function sharedConversationUrl(token: string): string {
  return `${window.location.origin}/shared/${token}`;
}
