import type { Storage } from '@google-cloud/storage';
import { describe, expect, it } from 'vitest';
import { GcsFileStorage } from './gcs-file-storage';

interface StoredObject {
  content: Buffer;
  options: unknown;
}

/**
 * Dublê do cliente do Cloud Storage: guarda os objetos em memória, por bucket
 * e chave, só com as operações que o adapter usa.
 */
function fakeStorageClient() {
  const objects = new Map<string, StoredObject>();
  const client = {
    bucket: (bucketName: string) => ({
      file: (key: string) => ({
        async save(content: Buffer, options: unknown) {
          objects.set(`${bucketName}/${key}`, { content, options });
        },
        async download(): Promise<[Buffer]> {
          const object = objects.get(`${bucketName}/${key}`);
          if (!object) {
            throw new Error(`No such object: ${bucketName}/${key}`);
          }
          return [object.content];
        },
        async delete({ ignoreNotFound }: { ignoreNotFound: boolean }) {
          if (!objects.delete(`${bucketName}/${key}`) && !ignoreNotFound) {
            throw new Error(`No such object: ${bucketName}/${key}`);
          }
        },
      }),
      async deleteFiles({ prefix }: { prefix: string }) {
        for (const path of objects.keys()) {
          if (path.startsWith(`${bucketName}/${prefix}`)) {
            objects.delete(path);
          }
        }
      },
    }),
  };
  return { objects, client: client as unknown as Storage };
}

function gcsStorage() {
  const { objects, client } = fakeStorageClient();
  return { objects, storage: new GcsFileStorage('anexos', client) };
}

describe('GcsFileStorage', () => {
  it('grava no bucket com o tipo do arquivo e devolve o endereço gs://', async () => {
    const { storage, objects } = gcsStorage();

    const uri = await storage.save('users/u1/a', Buffer.from('conteúdo'), 'application/pdf');

    expect(uri).toBe('gs://anexos/users/u1/a');
    expect(objects.get('anexos/users/u1/a')).toEqual({
      content: Buffer.from('conteúdo'),
      options: { contentType: 'application/pdf', resumable: false },
    });
  });

  it('lê o conteúdo pelo endereço devolvido', async () => {
    const { storage } = gcsStorage();
    const uri = await storage.save('users/u1/a', Buffer.from('conteúdo'), 'application/pdf');

    expect((await storage.read(uri)).toString()).toBe('conteúdo');
  });

  it('recusa ler um endereço que não é do Cloud Storage', async () => {
    const { storage } = gcsStorage();

    await expect(storage.read('file:///etc/passwd')).rejects.toThrow(/Cloud Storage inválido/);
  });

  it('apaga um arquivo, sem falhar se ele já não existir', async () => {
    const { storage, objects } = gcsStorage();
    const uri = await storage.save('users/u1/a', Buffer.from('a'), 'image/png');

    await storage.delete(uri);
    await storage.delete(uri);

    expect(objects.size).toBe(0);
  });

  it('apaga só os arquivos da pasta pedida', async () => {
    const { storage, objects } = gcsStorage();
    await storage.save('users/u1/conversations/c1/a', Buffer.from('a'), 'image/png');
    await storage.save('users/u1/conversations/c1/b', Buffer.from('b'), 'image/png');
    await storage.save('users/u1/conversations/c10/c', Buffer.from('c'), 'image/png');

    await storage.deleteFolder('users/u1/conversations/c1');

    expect([...objects.keys()]).toEqual(['anexos/users/u1/conversations/c10/c']);
  });

  it('entrega ao LLM o próprio endereço gs://', () => {
    const { storage } = gcsStorage();

    expect(storage.uriReadableByModel('gs://anexos/users/u1/a')).toBe('gs://anexos/users/u1/a');
  });
});
