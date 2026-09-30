import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalFileStorage } from './local-file-storage';

const storage = new LocalFileStorage(mkdtempSync(path.join(tmpdir(), 'chat-tess-files-')));

describe('LocalFileStorage', () => {
  it('grava e lê o conteúdo pelo endereço devolvido', async () => {
    const uri = await storage.save('users/u1/arquivo', Buffer.from('conteúdo'));

    expect(uri).toMatch(/^file:\/\//);
    expect((await storage.read(uri)).toString()).toBe('conteúdo');
  });

  it('não permite gravar fora da pasta de armazenamento', async () => {
    await expect(storage.save('../../fora', Buffer.from('x'))).rejects.toThrow(/fora da pasta/);
  });

  it('não permite ler fora da pasta de armazenamento', async () => {
    await expect(storage.read('file:///etc/passwd')).rejects.toThrow(/fora da pasta/);
  });

  it('pede que o conteúdo vá embutido para o LLM', () => {
    expect(storage.uriReadableByModel()).toBeNull();
  });
});
