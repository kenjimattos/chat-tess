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

  it('apaga a pasta com tudo o que foi gravado nela', async () => {
    const inFolder = await storage.save('users/u2/conversations/c1/a', Buffer.from('a'));
    const outside = await storage.save('users/u2/conversations/c2/b', Buffer.from('b'));

    await storage.deleteFolder('users/u2/conversations/c1');

    await expect(storage.read(inFolder)).rejects.toThrow(/ENOENT/);
    expect((await storage.read(outside)).toString()).toBe('b');
  });

  it('não falha ao apagar uma pasta que não existe', async () => {
    await expect(storage.deleteFolder('users/u2/conversations/nenhuma')).resolves.toBeUndefined();
  });

  it('não permite apagar fora da pasta de armazenamento', async () => {
    await expect(storage.deleteFolder('../..')).rejects.toThrow(/fora da pasta/);
  });

  it('pede que o conteúdo vá embutido para o LLM', () => {
    expect(storage.uriReadableByModel()).toBeNull();
  });
});
