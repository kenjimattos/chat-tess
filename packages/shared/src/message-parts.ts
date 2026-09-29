import { z } from 'zod';

/**
 * Formato neutro de mensagem, independente de provedor de LLM.
 * Uma mensagem é uma lista ordenada de partes; os adapters de LLM convertem
 * este formato para o formato do provedor.
 */

export const messageRoleSchema = z.enum(['user', 'assistant', 'tool']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextPart = z.infer<typeof textPartSchema>;

export const attachmentPartSchema = z.object({
  type: z.literal('attachment'),
  attachmentId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export type AttachmentPart = z.infer<typeof attachmentPartSchema>;

export const toolCallPartSchema = z.object({
  type: z.literal('tool_call'),
  callId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  /** Dados opacos do provedor que precisam voltar intactos no turno seguinte. */
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
});
export type ToolCallPart = z.infer<typeof toolCallPartSchema>;

export const toolResultPartSchema = z.object({
  type: z.literal('tool_result'),
  callId: z.string(),
  toolName: z.string(),
  output: z.unknown(),
  isError: z.boolean(),
});
export type ToolResultPart = z.infer<typeof toolResultPartSchema>;

export const messagePartSchema = z.discriminatedUnion('type', [
  textPartSchema,
  attachmentPartSchema,
  toolCallPartSchema,
  toolResultPartSchema,
]);
export type MessagePart = z.infer<typeof messagePartSchema>;

export const messagePartsSchema = z.array(messagePartSchema);

export function joinTextParts(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
