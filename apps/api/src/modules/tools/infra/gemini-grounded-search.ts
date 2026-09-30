import { GoogleGenAI } from '@google/genai';
import type { GeminiConnection } from '../../agent/infra/gemini-llm-provider';
import type { WebSearchEngine, WebSearchResult } from '../domain/ports';

const SEARCH_INSTRUCTIONS =
  'Pesquise na web e responda de forma objetiva, com os fatos encontrados e datas quando houver. ' +
  'Responda no idioma da pergunta.';

/**
 * Busca na web com o grounding do Google Search no Gemini. Roda numa chamada
 * separada da conversa, porque a busca nativa do Gemini não se mistura com as
 * tools declaradas pela aplicação na mesma requisição.
 */
export class GeminiGroundedSearch implements WebSearchEngine {
  private readonly models;

  constructor(
    private readonly model: string,
    connection: GeminiConnection,
  ) {
    this.models = new GoogleGenAI({ vertexai: true, ...connection }).models;
  }

  async search(query: string, signal?: AbortSignal): Promise<WebSearchResult> {
    const response = await this.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        systemInstruction: SEARCH_INSTRUCTIONS,
        tools: [{ googleSearch: {} }],
        abortSignal: signal,
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = chunks.flatMap(({ web }) =>
      web?.uri ? [{ title: web.title ?? web.domain ?? web.uri, url: web.uri }] : [],
    );
    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);

    return {
      answer: response.text ?? '',
      sources,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      model: response.modelVersion ?? this.model,
    };
  }
}
