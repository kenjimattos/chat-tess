import { describe, expect, it } from 'vitest';
import { sanitizeFileName } from './attachment';

describe('sanitizeFileName', () => {
  it('mantém um nome comum', () => {
    expect(sanitizeFileName('Relatório final.pdf')).toBe('Relatório final.pdf');
  });

  it('remove pastas do caminho', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\ana\\foto.png')).toBe('foto.png');
  });

  it('remove caracteres de controle', () => {
    expect(sanitizeFileName('foto\u0000\n.png')).toBe('foto.png');
  });

  it('usa um nome padrão quando não sobra nada', () => {
    expect(sanitizeFileName('  ')).toBe('arquivo');
    expect(sanitizeFileName('pasta/')).toBe('arquivo');
  });

  it('limita o tamanho do nome', () => {
    expect(sanitizeFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(200);
  });
});
