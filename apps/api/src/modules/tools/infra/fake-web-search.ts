import type { WebSearchEngine, WebSearchResult } from '../domain/ports';

/** Busca previsível para testes ponta a ponta (`LLM_MODE=fake`): não acessa a internet. */
export class FakeWebSearch implements WebSearchEngine {
  async search(query: string): Promise<WebSearchResult> {
    return {
      answer: `Resultados simulados para "${query}".`,
      sources: [{ title: 'Fonte simulada', url: 'https://example.com/fonte-simulada' }],
      usage: null,
      model: null,
    };
  }
}
