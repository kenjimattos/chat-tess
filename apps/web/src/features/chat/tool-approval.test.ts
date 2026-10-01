import type { ConversationMessage, MessagePart } from '@chat-tess/shared';
import { describe, expect, it } from 'vitest';
import { callsAwaitingApproval } from './tool-approval';

function message(
  sequence: number,
  role: ConversationMessage['role'],
  parts: MessagePart[],
): ConversationMessage {
  return { id: `m${sequence}`, sequence, role, parts, createdAt: '2026-10-01T12:00:00Z' };
}

const question = message(1, 'user', [{ type: 'text', text: 'Leia a página' }]);
const scrapeCall: MessagePart = {
  type: 'tool_call',
  callId: 'c1',
  toolName: 'web_scrape',
  input: { url: 'https://example.com' },
  requiresApproval: true,
};
const searchCall: MessagePart = {
  type: 'tool_call',
  callId: 'c2',
  toolName: 'web_search',
  input: { query: 'bolo' },
};

describe('callsAwaitingApproval', () => {
  it('devolve as chamadas da última mensagem que pedem autorização', () => {
    const messages = [question, message(2, 'assistant', [searchCall, scrapeCall])];

    expect(callsAwaitingApproval(messages)).toEqual([scrapeCall]);
  });

  it('não há espera depois que as chamadas receberam resultado', () => {
    const messages = [
      question,
      message(2, 'assistant', [scrapeCall]),
      message(3, 'tool', [
        { type: 'tool_result', callId: 'c1', toolName: 'web_scrape', output: 'ok', isError: false },
      ]),
    ];

    expect(callsAwaitingApproval(messages)).toEqual([]);
  });

  it('não há espera quando o usuário já enviou outra mensagem', () => {
    const messages = [question, message(2, 'assistant', [scrapeCall]), message(3, 'user', [])];

    expect(callsAwaitingApproval(messages)).toEqual([]);
  });

  it('não há espera numa conversa vazia', () => {
    expect(callsAwaitingApproval([])).toEqual([]);
  });
});
