import type { ToolCallPart } from '@chat-tess/shared';
import { isAttachmentNotice } from '../domain/attachment-notice';
import type { LlmMessage, LlmRequest } from '../domain/llm';
import { COMPACTION_INSTRUCTIONS } from '../domain/system-prompt';
import type { ScriptedReply } from './scripted-llm-provider';

const TOOL_COMMAND = /^\/tool\s+(\w+)\s*(\{.*\})?\s*$/s;
const INJECTED_TOOL_COMMAND = /\/tool\s+(\w+)\s+(\{.*\})/s;
const SLOW_REPLY =
  'Resposta lenta: um dois três quatro cinco seis sete oito nove dez onze doze treze ' +
  'catorze quinze dezesseis dezessete dezoito dezenove vinte. Fim da resposta lenta.';

/**
 * Respostas previsíveis para `LLM_MODE=fake`, usado nos testes ponta a ponta:
 * - pedido de compactação: devolve um resumo das perguntas do usuário;
 * - "/tool nome {json}": chama a tool; na volta, relata o resultado;
 * - resultado de tool contendo "/tool nome {json}": obedece e chama a tool, como um
 *   modelo enganado por uma instrução escondida em conteúdo externo (prompt injection);
 * - "/blocked": simula uma resposta bloqueada por política de segurança;
 * - "/slow": responde devagar (cerca de 4 s), para testar respostas em andamento;
 * - demais mensagens: repete o texto e lista os anexos recebidos.
 */
export function fakeChatResponder(request: LlmRequest): ScriptedReply {
  if (request.systemPrompt === COMPACTION_INSTRUCTIONS) {
    return { text: `Resumo automático: ${summarizeUserQuestions(request.messages)}` };
  }

  const lastMessage = request.messages.at(-1);
  if (lastMessage?.role === 'tool') {
    const injectedCall = injectedToolCall(lastMessage, request.messages.length);
    return injectedCall
      ? { toolCalls: [injectedCall] }
      : { text: `Resultado da tool: ${describeToolResults(lastMessage)}` };
  }

  const text = textOf(lastMessage);
  if (text === '/blocked') {
    return { finishReason: 'blocked' };
  }
  if (text === '/slow') {
    return { text: SLOW_REPLY, chunkDelayMs: 400 };
  }

  const toolCommand = TOOL_COMMAND.exec(text);
  if (toolCommand?.[1]) {
    return { toolCalls: [toolCall(toolCommand[1], toolCommand[2], request.messages.length)] };
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

function toolCall(
  toolName: string,
  inputJson: string | undefined,
  callNumber: number,
): ToolCallPart {
  return {
    type: 'tool_call',
    callId: `fake-call-${callNumber}`,
    toolName,
    input: inputJson ? (JSON.parse(inputJson) as Record<string, unknown>) : {},
  };
}

/** O comando "/tool" escondido no conteúdo que uma tool trouxe, se houver. */
function injectedToolCall(message: LlmMessage, callNumber: number): ToolCallPart | null {
  const contents = message.parts.flatMap((part) =>
    part.type === 'tool_result' && !part.isError ? textsIn(part.output) : [],
  );
  for (const content of contents) {
    const command = INJECTED_TOOL_COMMAND.exec(content);
    if (command?.[1]) {
      return toolCall(command[1], command[2], callNumber);
    }
  }
  return null;
}

/** Todos os textos de um valor JSON, em qualquer profundidade. */
function textsIn(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  return value !== null && typeof value === 'object' ? Object.values(value).flatMap(textsIn) : [];
}

/** O texto que o usuário escreveu, sem os avisos que acompanham os anexos. */
function textOf(message: LlmMessage | undefined): string {
  return (message?.parts ?? [])
    .flatMap((part) => (part.type === 'text' && !isAttachmentNotice(part) ? [part.text] : []))
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
