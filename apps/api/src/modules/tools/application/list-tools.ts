import type { CatalogEntry } from '../domain/tool';
import type { ToolRegistry } from './tool-registry';

/** Tools disponíveis para o usuário, com a preferência dele, para a tela de configurações. */
export class ListTools {
  constructor(private readonly registry: ToolRegistry) {}

  execute(userId: string): Promise<CatalogEntry[]> {
    return this.registry.catalogFor(userId);
  }
}
