import { describe, expect, it } from 'vitest';
import { UploadQueue } from './upload-queue';

/** Upload que só termina quando o teste manda, e registra quando começou. */
function controllableUpload(name: string, started: string[]) {
  let finish = (_result: string) => {};
  let fail = (_error: Error) => {};
  const result = new Promise<string>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const upload = () => {
    started.push(name);
    return result;
  };
  return { upload, finish: () => finish(name), fail: () => fail(new Error(name)) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('UploadQueue', () => {
  it('começa o upload na hora quando a fila está vazia', async () => {
    const started: string[] = [];
    const queue = new UploadQueue();
    const first = controllableUpload('primeiro', started);

    const result = queue.enqueue(first.upload);
    await flush();

    expect(started).toEqual(['primeiro']);
    first.finish();
    expect(await result).toBe('primeiro');
  });

  it('só começa o upload seguinte quando o anterior termina', async () => {
    const started: string[] = [];
    const queue = new UploadQueue();
    const first = controllableUpload('primeiro', started);
    const second = controllableUpload('segundo', started);
    void queue.enqueue(first.upload);
    const secondResult = queue.enqueue(second.upload);
    await flush();
    expect(started).toEqual(['primeiro']);

    first.finish();
    await flush();

    expect(started).toEqual(['primeiro', 'segundo']);
    second.finish();
    expect(await secondResult).toBe('segundo');
  });

  it('a falha de um upload vai para quem o pediu e não trava os seguintes', async () => {
    const started: string[] = [];
    const queue = new UploadQueue();
    const first = controllableUpload('primeiro', started);
    const second = controllableUpload('segundo', started);
    const firstResult = queue.enqueue(first.upload);
    const secondResult = queue.enqueue(second.upload);

    first.fail();
    second.finish();

    await expect(firstResult).rejects.toThrow('primeiro');
    expect(await secondResult).toBe('segundo');
  });
});
