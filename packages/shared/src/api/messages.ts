import { z } from 'zod';

export const sendMessageRequestSchema = z.object({
  text: z.string().max(100_000).default(''),
  attachmentIds: z.array(z.string()).max(10).default([]),
});
export type SendMessageRequest = z.input<typeof sendMessageRequestSchema>;

/**
 * Refaz o último turno da conversa a partir da última mensagem do usuário.
 * Sem `text`, a mesma mensagem é reenviada; com `text`, ela é editada antes.
 */
export const resendLastMessageRequestSchema = z.object({
  text: z.string().max(100_000).optional(),
});
export type ResendLastMessageRequest = z.input<typeof resendLastMessageRequestSchema>;
