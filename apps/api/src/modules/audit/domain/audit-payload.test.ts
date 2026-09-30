import { describe, expect, it } from 'vitest';
import { compactPayload } from './audit-payload';

describe('compactPayload', () => {
  it('mantém conteúdo pequeno sem alteração', () => {
    const payload = {
      conversationId: 'c1',
      usage: { inputTokens: 10 },
      tags: ['a'],
      ok: true,
      n: null,
    };

    expect(compactPayload(payload)).toEqual(payload);
  });

  it('corta textos longos e informa quanto foi omitido', () => {
    const compacted = compactPayload({ output: 'x'.repeat(2500) }) as { output: string };

    expect(compacted.output).toHaveLength(2000 + '… (+500 caracteres)'.length);
    expect(compacted.output.endsWith('… (+500 caracteres)')).toBe(true);
  });

  it('limita listas longas', () => {
    const compacted = compactPayload(Array.from({ length: 60 }, (_, index) => index)) as unknown[];

    expect(compacted).toHaveLength(51);
    expect(compacted.at(-1)).toBe('… (+10 itens)');
  });

  it('omite objetos aninhados profundos demais', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 'fundo' } } } } } } };

    expect(JSON.stringify(compactPayload(deep))).toContain('[conteúdo aninhado omitido]');
  });
});
