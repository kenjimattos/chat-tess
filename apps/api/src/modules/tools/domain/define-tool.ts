import { z } from 'zod';
import type { ToolExecutionContext } from '../../agent/domain/toolbox';
import type { Tool } from './tool';

export interface ToolDefinition<TSchema extends z.ZodObject> {
  name: string;
  description: string;
  input: TSchema;
  /** Ver `Tool.returnsExternalContent`. */
  returnsExternalContent: boolean;
  /** Ver `Tool.requiresApproval`. Sem ele, a tool nunca pede autorização. */
  requiresApproval?(input: z.infer<TSchema>, context: ToolExecutionContext): Promise<boolean>;
  run(input: z.infer<TSchema>, context: ToolExecutionContext): Promise<unknown>;
}

/**
 * Cria uma tool a partir de um schema Zod: o mesmo schema gera o JSON Schema
 * enviado ao LLM e valida os argumentos antes de executar.
 */
export function defineTool<TSchema extends z.ZodObject>(definition: ToolDefinition<TSchema>): Tool {
  const { $schema: _dialect, ...inputSchema } = z.toJSONSchema(definition.input);

  return {
    name: definition.name,
    description: definition.description,
    inputSchema,
    returnsExternalContent: definition.returnsExternalContent,
    async requiresApproval(rawInput, context) {
      // Argumentos inválidos não chegam a executar: não há o que autorizar.
      const parsed = definition.input.safeParse(rawInput);
      return parsed.success && (await definition.requiresApproval?.(parsed.data, context)) === true;
    },
    async execute(rawInput, context) {
      const parsed = definition.input.safeParse(rawInput);
      if (!parsed.success) {
        throw new Error(`Argumentos inválidos: ${z.prettifyError(parsed.error)}`);
      }
      return definition.run(parsed.data, context);
    },
  };
}
