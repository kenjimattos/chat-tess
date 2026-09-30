import type { MessagePart } from '@chat-tess/shared';
import type { Message } from '../../conversations/domain/conversation';

const ROLE_LABEL = { user: 'Usuário', assistant: 'Assistente', tool: 'Tool' } as const;
const MAX_TOOL_OUTPUT_CHARACTERS = 2000;

/** Versão em texto das mensagens, usada como entrada da compactação. */
export function renderTranscript(messages: readonly Message[]): string {
  return messages
    .map((message) => `${ROLE_LABEL[message.role]}: ${message.parts.map(renderPart).join('\n')}`)
    .join('\n\n');
}

function renderPart(part: MessagePart): string {
  switch (part.type) {
    case 'text':
      return part.text;
    case 'attachment':
      return `[anexo: ${part.fileName} (${part.mimeType})]`;
    case 'tool_call':
      return `[chamou a tool ${part.toolName} com ${JSON.stringify(part.input)}]`;
    case 'tool_result':
      return `[resultado de ${part.toolName}${part.isError ? ' (erro)' : ''}: ${truncate(
        JSON.stringify(part.output) ?? '',
      )}]`;
  }
}

function truncate(text: string): string {
  return text.length <= MAX_TOOL_OUTPUT_CHARACTERS
    ? text
    : `${text.slice(0, MAX_TOOL_OUTPUT_CHARACTERS)}… (cortado)`;
}
