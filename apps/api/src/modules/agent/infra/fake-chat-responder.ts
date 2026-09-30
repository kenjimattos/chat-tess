import type { LlmMessage, LlmRequest } from '../domain/llm';
import { COMPACTION_INSTRUCTIONS } from '../domain/system-prompt';
import type { ScriptedReply } from './scripted-llm-provider';

const TOOL_COMMAND = /^\/tool\s+(\w+)\s*(\{.*\})?\s*$/s;

/**
 * Respostas previsíveis para `LLM_MODE=fake`, usado nos testes ponta a ponta:
 * - pedido de compactação: devolve um resumo das perguntas do usuário;
 * - "/tool nome {json}": chama a tool; na volta, relata o resultado;
 * - "/blocked": simula uma resposta bloqueada por política de segurança;
 * - demais mensagens: repete o texto e lista os anexos recebidos.
 */
export function fakeChatResponder(request: LlmRequest): ScriptedReply {
  if (request.systemPrompt === COMPACTION_INSTRUCTIONS) {
    return { text: `Resumo automático: ${summarizeUserQuestions(request.messages)}` };
  }

  const lastMessage = request.messages.at(-1);
  if (lastMessage?.role === 'tool') {
    return { text: `Resultado da tool: ${describeToolResults(lastMessage)}` };
  }

  const text = textOf(lastMessage);
  if (text === '/blocked') {
    return { finishReason: 'blocked' };
  }

  const toolCommand = TOOL_COMMAND.exec(text);
  if (toolCommand?.[1]) {
    return {
      toolCalls: [
        {
          type: 'tool_call',
          callId: `fake-call-${request.messages.length}`,
          toolName: toolCommand[1],
          input: toolCommand[2] ? (JSON.parse(toolCommand[2]) as Record<string, unknown>) : {},
        },
      ],
    };
  }

  const attachmentNames = (lastMessage?.parts ?? []).flatMap((part) =>
    part.type === 'attachment' ? [part.fileName] : [],
  );
  const replyParts = [`Você disse: "${text}".`];
  if (attachmentNames.length) {
    replyParts.push(`Recebi ${attachmentNames.length} anexo(s): ${attachmentNames.join(', ')}.`);
  }
  if (request.systemPrompt.includes('Resumo automático:')) {
    replyParts.push('(Estou usando o resumo do início da conversa.)');
  }
  return { text: replyParts.join(' ') };
}

function textOf(message: LlmMessage | undefined): string {
  return (message?.parts ?? [])
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join(' ')
    .trim();
}

function summarizeUserQuestions(messages: LlmMessage[]): string {
  const transcript = textOf(messages[0]);
  const questions = [...transcript.matchAll(/^Usuário: (.*)$/gm)].map((match) => match[1]);
  return questions.length ? questions.join(' | ') : 'sem perguntas';
}

function describeToolResults(message: LlmMessage): string {
  return message.parts
    .flatMap((part) =>
      part.type === 'tool_result'
        ? [`${part.toolName}${part.isError ? ' falhou' : ''} -> ${JSON.stringify(part.output)}`]
        : [],
    )
    .join('; ');
}
