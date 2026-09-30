import { z } from 'zod';

export const sendMessageRequestSchema = z.object({
  text: z.string().max(100_000).default(''),
  attachmentIds: z.array(z.string()).max(10).default([]),
});
export type SendMessageRequest = z.input<typeof sendMessageRequestSchema>;
