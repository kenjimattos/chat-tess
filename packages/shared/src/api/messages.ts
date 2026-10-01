import { z } from 'zod';

/** Também é o teto de anexos que uma conversa guarda à espera de envio. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const sendMessageRequestSchema = z.object({
  text: z.string().max(100_000).default(''),
  attachmentIds: z.array(z.string()).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
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

/**
 * Decisão do usuário sobre as chamadas de tool que esperam autorização na conversa.
 * As chamadas fora de `approvedCallIds` são negadas.
 */
export const decideToolApprovalsRequestSchema = z.object({
  approvedCallIds: z.array(z.string()).max(50).default([]),
});
export type DecideToolApprovalsRequest = z.input<typeof decideToolApprovalsRequestSchema>;
