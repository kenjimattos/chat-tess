import type { StreamEvent } from '@chat-tess/shared';
import { describe, expect, it } from 'vitest';
import { applyStreamEvent, emptyReply } from './streaming-reply';

const applyAll = (events: StreamEvent[]) => events.reduce(applyStreamEvent, emptyReply);

describe('applyStreamEvent', () => {
  it('acumula o texto recebido', () => {
    const reply = applyAll([
      { type: 'text_delta', text: 'Olá, ' },
      { type: 'text_delta', text: 'Ana' },
    ]);

    expect(reply.text).toBe('Olá, Ana');
    expect(reply.isFinished).toBe(false);
  });

  it('acompanha o início e o fim de cada tool', () => {
    const reply = applyAll([
      { type: 'tool_started', callId: 'c1', toolName: 'web_search', input: {} },
      { type: 'tool_started', callId: 'c2', toolName: 'web_scrape', input: {} },
      { type: 'tool_finished', callId: 'c1', toolName: 'web_search', isError: false },
      { type: 'tool_finished', callId: 'c2', toolName: 'web_scrape', isError: true },
    ]);

    expect(reply.tools).toEqual([
      { callId: 'c1', toolName: 'web_search', status: 'succeeded' },
      { callId: 'c2', toolName: 'web_scrape', status: 'failed' },
    ]);
  });

  it('registra que houve compactação', () => {
    expect(applyAll([{ type: 'compacted', summarizedMessageCount: 4 }]).wasCompacted).toBe(true);
  });

  it('termina com a mensagem de erro', () => {
    const reply = applyAll([
      { type: 'text_delta', text: 'parcial' },
      { type: 'error', code: 'agent_failed', message: 'Falhou.' },
    ]);

    expect(reply).toMatchObject({ text: 'parcial', error: 'Falhou.', isFinished: true });
  });

  it('termina ao receber o fim da resposta', () => {
    expect(applyAll([{ type: 'done', messageId: 'm1' }]).isFinished).toBe(true);
  });

  it('termina quando o turno para à espera da autorização do usuário', () => {
    const reply = applyAll([
      { type: 'text_delta', text: 'Vou abrir a página.' },
      {
        type: 'approval_required',
        calls: [{ callId: 'c1', toolName: 'web_scrape', input: { url: 'https://example.com' } }],
      },
    ]);

    expect(reply).toMatchObject({ text: 'Vou abrir a página.', error: null, isFinished: true });
  });
});
