import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool';

const context = { userId: 'user-ana', conversationId: 'conversation-1' };

const input = z.object({ to: z.email() });

describe('defineTool', () => {
  it('nunca pede autorização quando a tool não define a regra', async () => {
    const tool = defineTool({
      name: 'lookup',
      description: 'Consulta',
      returnsExternalContent: false,
      input,
      run: async () => 'ok',
    });

    expect(await tool.requiresApproval({ to: 'ana@empresa.com' }, context)).toBe(false);
  });

  it('aplica a regra de autorização da tool aos argumentos já validados', async () => {
    const tool = defineTool({
      name: 'send_email',
      description: 'Envia um e-mail',
      returnsExternalContent: false,
      input,
      requiresApproval: async ({ to }, { userId }) =>
        userId === 'user-ana' && !to.endsWith('@empresa.com'),
      run: async () => 'enviado',
    });

    expect(await tool.requiresApproval({ to: 'fora@atacante.example' }, context)).toBe(true);
    expect(await tool.requiresApproval({ to: 'bia@empresa.com' }, context)).toBe(false);
  });

  it('não pede autorização para argumentos inválidos, que a execução recusa', async () => {
    const tool = defineTool({
      name: 'send_email',
      description: 'Envia um e-mail',
      returnsExternalContent: false,
      input,
      requiresApproval: async () => true,
      run: async () => 'enviado',
    });

    expect(await tool.requiresApproval({ to: 'não é e-mail' }, context)).toBe(false);
    await expect(tool.execute({ to: 'não é e-mail' }, context)).rejects.toThrow(
      /Argumentos inválidos/,
    );
  });
});
