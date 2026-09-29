import { describe, expect, it } from 'vitest';
import { joinTextParts, messagePartsSchema, type MessagePart } from './message-parts';

describe('messagePartsSchema', () => {
  it('aceita uma mensagem com texto, anexo e chamada de tool', () => {
    const parts = [
      { type: 'text', text: 'Resuma este PDF' },
      {
        type: 'attachment',
        attachmentId: 'att-1',
        fileName: 'contrato.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      },
      { type: 'tool_call', callId: 'call-1', toolName: 'web_search', input: { query: 'vitest' } },
    ];

    expect(messagePartsSchema.parse(parts)).toEqual(parts);
  });

  it('rejeita uma parte de tipo desconhecido', () => {
    const result = messagePartsSchema.safeParse([{ type: 'audio', url: 'x' }]);

    expect(result.success).toBe(false);
  });
});

describe('joinTextParts', () => {
  it('concatena apenas as partes de texto, na ordem', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Olá, ' },
      { type: 'tool_call', callId: 'call-1', toolName: 'web_search', input: {} },
      { type: 'text', text: 'mundo' },
    ];

    expect(joinTextParts(parts)).toBe('Olá, mundo');
  });
});
