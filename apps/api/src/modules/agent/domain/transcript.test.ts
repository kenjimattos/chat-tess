import { describe, expect, it } from 'vitest';
import type { Message } from '../../conversations/domain/conversation';
import { renderTranscript } from './transcript';

function message(role: Message['role'], parts: Message['parts'], sequence: number): Message {
  return {
    id: `m${sequence}`,
    conversationId: 'c1',
    sequence,
    role,
    parts,
    createdAt: new Date('2026-09-30T10:00:00Z'),
  };
}

describe('renderTranscript', () => {
  it('descreve texto, anexos, tools e resultados em ordem', () => {
    const transcript = renderTranscript([
      message(
        'user',
        [
          { type: 'text', text: 'Veja o contrato' },
          {
            type: 'attachment',
            attachmentId: 'a1',
            fileName: 'contrato.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 10,
          },
        ],
        1,
      ),
      message(
        'assistant',
        [{ type: 'tool_call', callId: 'c1', toolName: 'web_search', input: { query: 'lei' } }],
        2,
      ),
      message(
        'tool',
        [
          {
            type: 'tool_result',
            callId: 'c1',
            toolName: 'web_search',
            output: 'ok',
            isError: false,
          },
        ],
        3,
      ),
      message('assistant', [{ type: 'text', text: 'Pronto.' }], 4),
    ]);

    expect(transcript).toBe(
      [
        'Usuário: Veja o contrato\n[anexo: contrato.pdf (application/pdf)]',
        'Assistente: [chamou a tool web_search com {"query":"lei"}]',
        'Tool: [resultado de web_search: "ok"]',
        'Assistente: Pronto.',
      ].join('\n\n'),
    );
  });

  it('corta resultados de tool muito longos', () => {
    const transcript = renderTranscript([
      message(
        'tool',
        [
          {
            type: 'tool_result',
            callId: 'c1',
            toolName: 'web_scrape',
            output: 'x'.repeat(5000),
            isError: true,
          },
        ],
        1,
      ),
    ]);

    expect(transcript.length).toBeLessThan(2100);
    expect(transcript).toContain('(erro)');
    expect(transcript.endsWith('… (cortado)]')).toBe(true);
  });
});
