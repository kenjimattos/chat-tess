import type { ConversationSummary } from './conversation-memory';

const BASE_INSTRUCTIONS = `Você é o chat-tess, um assistente prestativo e direto.
Responda no idioma do usuário. Use Markdown quando ajudar a leitura.
Quando o usuário enviar imagens ou PDFs, baseie a resposta no conteúdo deles.
Quando tiver tools disponíveis, use-as se ajudarem a responder com precisão.`;

export interface SystemPromptInput {
  now: Date;
  summary: ConversationSummary | null;
}

export function buildSystemPrompt({ now, summary }: SystemPromptInput): string {
  const sections = [BASE_INSTRUCTIONS, `Data e hora atuais (UTC): ${now.toISOString()}.`];

  if (summary) {
    sections.push(
      `O início desta conversa foi resumido para caber no contexto. Resumo:\n${summary.content}`,
    );
  }

  return sections.join('\n\n');
}

export const COMPACTION_INSTRUCTIONS = `Você resume conversas entre um usuário e um assistente.
Escreva um resumo que permita continuar a conversa sem perder informação útil:
fatos, decisões, preferências do usuário, nomes, números, conteúdo relevante de anexos
e resultados de tools, e perguntas ainda em aberto. Escreva em tópicos, no idioma da conversa.
Responda apenas com o resumo.`;
