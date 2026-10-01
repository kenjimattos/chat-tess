import type { ConversationMessage } from '@chat-tess/shared';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  withEarlierPage,
  withLatestPage,
  withMessage,
  type MessageHistory,
} from './message-history';

function message(sequence: number, id = `m${sequence}`): ConversationMessage {
  return {
    id,
    sequence,
    role: 'user',
    parts: [{ type: 'text', text: `mensagem ${sequence}` }],
    createdAt: '2026-10-01T10:00:00.000Z',
  };
}

function idsOf(history: MessageHistory): string[] {
  return history.messages.map(({ id }) => id);
}

describe('histórico de mensagens em páginas', () => {
  it('começa pela página mais recente', () => {
    const history = withLatestPage(EMPTY_HISTORY, {
      messages: [message(3), message(4)],
      hasEarlierMessages: true,
    });

    expect(idsOf(history)).toEqual(['m3', 'm4']);
    expect(history.hasEarlierMessages).toBe(true);
  });

  it('acrescenta as mensagens anteriores no início', () => {
    const latest = { messages: [message(3), message(4)], hasEarlierMessages: true };

    const history = withEarlierPage(latest, {
      messages: [message(1), message(2)],
      hasEarlierMessages: false,
    });

    expect(idsOf(history)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(history.hasEarlierMessages).toBe(false);
  });

  it('mantém as mensagens antigas já carregadas quando a página mais recente avança', () => {
    const loaded = {
      messages: [message(1), message(2), message(3), message(4)],
      hasEarlierMessages: false,
    };

    const history = withLatestPage(loaded, {
      messages: [message(5), message(6)],
      hasEarlierMessages: true,
    });

    expect(idsOf(history)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
    expect(history.hasEarlierMessages).toBe(false);
  });

  it('troca a pergunta provisória pela mensagem gravada', () => {
    const loaded = { messages: [message(1), message(2)], hasEarlierMessages: false };
    const waiting = withMessage(loaded, message(3, 'pending-1'));

    const history = withLatestPage(waiting, {
      messages: [message(1), message(2), message(3), message(4)],
      hasEarlierMessages: false,
    });

    expect(idsOf(history)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('fica vazio quando a conversa não tem mensagens', () => {
    expect(withLatestPage(EMPTY_HISTORY, { messages: [], hasEarlierMessages: false })).toEqual(
      EMPTY_HISTORY,
    );
  });
});
