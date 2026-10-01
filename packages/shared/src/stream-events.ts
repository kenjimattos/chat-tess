import { z } from 'zod';

/**
 * Eventos enviados pelo servidor durante um turno do agente (SSE).
 * O nome do evento SSE é o campo `type`; o corpo é o objeto inteiro em JSON.
 */

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_delta'), text: z.string() }),
  z.object({
    type: z.literal('tool_started'),
    callId: z.string(),
    toolName: z.string(),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('tool_finished'),
    callId: z.string(),
    toolName: z.string(),
    isError: z.boolean(),
  }),
  /**
   * O turno parou: as chamadas listadas só executam depois de o usuário autorizar.
   * A decisão é enviada em outra requisição, que retoma o turno (ver `decideToolApprovalsRequestSchema`).
   */
  z.object({
    type: z.literal('approval_required'),
    calls: z.array(
      z.object({
        callId: z.string(),
        toolName: z.string(),
        input: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
  z.object({ type: z.literal('compacted'), summarizedMessageCount: z.number().int().positive() }),
  z.object({ type: z.literal('usage'), usage: tokenUsageSchema }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('done'), messageId: z.string() }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type StreamEventType = StreamEvent['type'];
