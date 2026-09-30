import { z } from 'zod';
import { tokenUsageSchema } from '../stream-events';

export const usageSummarySchema = z.object({
  tokenLimit: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative(),
  remainingTokens: z.number().int().nonnegative(),
  recentUsage: z.array(
    z.object({
      conversationId: z.string().nullable(),
      model: z.string(),
      purpose: z.enum(['chat', 'compaction', 'tool']),
      usage: tokenUsageSchema,
      occurredAt: z.string(),
    }),
  ),
});
export type UsageSummaryResponse = z.infer<typeof usageSummarySchema>;

export const setCreditLimitRequestSchema = z.object({
  email: z.email(),
  tokenLimit: z.number().int().nonnegative(),
});
export type SetCreditLimitRequest = z.infer<typeof setCreditLimitRequestSchema>;
