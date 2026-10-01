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

/**
 * Abre a conversa com a página mais recente do histórico ou, com
 * `beforeSequence`, com as mensagens anteriores a essa sequência.
 */
export async function getConversation(
  conversationId: string,
  beforeSequence?: number,
): Promise<ConversationDetail> {
  return conversationDetailSchema.parse(
    await requestJson(`/conversations/${conversationId}${earlierPageQuery(beforeSequence)}`),
  );
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

export async function getSharedConversation(
  token: string,
  beforeSequence?: number,
): Promise<SharedConversation> {
  return sharedConversationSchema.parse(
    await requestJson(`/shared/${token}${earlierPageQuery(beforeSequence)}`),
  );
}

function earlierPageQuery(beforeSequence?: number): string {
  return beforeSequence === undefined ? '' : `?before=${beforeSequence}`;
}

/** Endereço da página que mostra a conversa compartilhada. */
export function sharedConversationUrl(token: string): string {
  return `${window.location.origin}/shared/${token}`;
}
