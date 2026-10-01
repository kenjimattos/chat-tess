import { z } from 'zod';
import { defineTool } from '../../domain/define-tool';
import type { ConversationHistory, PageReader } from '../../domain/ports';
import type { Tool } from '../../domain/tool';
import { wasUrlGivenToAgent } from './given-urls';

const DEFAULT_MAX_CHARACTERS = 20_000;

/**
 * Lê uma página da web. Endereços que o usuário enviou ou que vieram da busca
 * são lidos direto; os demais, montados pelo modelo, esperam a autorização do
 * usuário, que vê o endereço inteiro antes de decidir.
 */
export function createWebScrapeTool(reader: PageReader, history: ConversationHistory): Tool {
  return defineTool({
    name: 'web_scrape',
    description:
      'Lê uma página pública da web e devolve o título e o texto principal. ' +
      'Use quando o usuário enviar um link ou quando precisar do conteúdo completo de uma página. ' +
      'Endereços que não vieram do usuário nem de uma busca só são lidos depois de ele autorizar.',
    returnsExternalContent: true,
    requiresApproval: async ({ url }, { conversationId }) =>
      !wasUrlGivenToAgent(url, await history.listByConversation(conversationId)),
    input: z.object({
      url: z.url().describe('Endereço http ou https da página'),
      maxCharacters: z
        .number()
        .int()
        .min(500)
        .max(50_000)
        .optional()
        .describe('Limite de caracteres do texto devolvido'),
    }),
    async run({ url, maxCharacters = DEFAULT_MAX_CHARACTERS }, { signal }) {
      const page = await reader.read(url, signal);
      const truncated = page.text.length > maxCharacters;

      return {
        url: page.url,
        title: page.title,
        text: truncated ? page.text.slice(0, maxCharacters) : page.text,
        truncated,
      };
    },
  });
}
