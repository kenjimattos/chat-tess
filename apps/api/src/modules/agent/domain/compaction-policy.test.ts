import type { MessagePart } from '@chat-tess/shared';
import { describe, expect, it } from 'vitest';
import type { Message, MessageRole } from '../../conversations/domain/conversation';
import { countMessagesToSummarize, estimateTokens, shouldCompact } from './compaction-policy';

function messagesWithRoles(roles: MessageRole[]): Message[] {
  const parts: MessagePart[] = [{ type: 'text', text: '...' }];
  return roles.map((role, index) => ({
    id: `m${index + 1}`,
    conversationId: 'c1',
    sequence: index + 1,
    role,
    parts,
    createdAt: new Date('2026-09-30T10:00:00Z'),
  }));
}

describe('estimateTokens', () => {
  it('estima cerca de um token a cada 4 caracteres, arredondando para cima', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('shouldCompact', () => {
  const threshold = { contextTokenLimit: 1000, thresholdRatio: 0.8 };

  it('não compacta enquanto o contexto projetado fica abaixo do limiar', () => {
    expect(shouldCompact(700, 'a'.repeat(396), threshold)).toBe(false);
  });

  it('compacta quando o contexto projetado atinge o limiar', () => {
    expect(shouldCompact(700, 'a'.repeat(400), threshold)).toBe(true);
  });

  it('considera a nova mensagem mesmo quando a conversa ainda está vazia', () => {
    expect(shouldCompact(0, 'a'.repeat(4000), threshold)).toBe(true);
  });
});

describe('countMessagesToSummarize', () => {
  it('resume tudo antes das mensagens recentes quando o corte cai num turno do usuário', () => {
    const messages = messagesWithRoles([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);

    expect(countMessagesToSummarize(messages, 2)).toBe(4);
  });

  it('recua o corte até o início do turno para não separar a tool do resultado', () => {
    const messages = messagesWithRoles([
      'user',
      'assistant',
      'user',
      'assistant', // chamada de tool
      'tool',
      'assistant',
    ]);

    expect(countMessagesToSummarize(messages, 2)).toBe(2);
  });

  it('não resume nada quando só há um turno', () => {
    const messages = messagesWithRoles(['user', 'assistant', 'tool', 'assistant']);

    expect(countMessagesToSummarize(messages, 1)).toBe(0);
  });

  it('não resume nada quando há menos mensagens do que as recentes a manter', () => {
    expect(countMessagesToSummarize(messagesWithRoles(['user', 'assistant']), 6)).toBe(0);
  });
});
