import type { Tool, ToolProvider } from '../../domain/tool';

/** Tools nativas da aplicação, disponíveis para todos os usuários. */
export class BuiltInToolProvider implements ToolProvider {
  constructor(private readonly tools: Tool[]) {}

  async toolsFor(): Promise<Tool[]> {
    return this.tools;
  }
}
