import type { StreamEvent } from '@chat-tess/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/http-client';
import { ActiveTurnsStore } from './active-turns-store';

/** Stream controlado pelo teste: cada `push` entrega um evento; `end` fecha. */
function controllableStream() {
  const queue: Array<(value: IteratorResult<StreamEvent>) => void> = [];
  const pending: IteratorResult<StreamEvent>[] = [];
  const deliver = (result: IteratorResult<StreamEvent>) => {
    const waiting = queue.shift();
    if (waiting) waiting(result);
    else pending.push(result);
  };
  const stream: AsyncIterable<StreamEvent> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        pending.length
          ? Promise.resolve(pending.shift()!)
          : new Promise<IteratorResult<StreamEvent>>((resolve) => queue.push(resolve)),
    }),
  };
  return {
    stream,
    push: (event: StreamEvent) => deliver({ value: event, done: false }),
    end: () => deliver({ value: undefined, done: true }),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const message = { text: 'Oi', attachmentIds: [] };

describe('ActiveTurnsStore', () => {
  it('acompanha a resposta de cada conversa enquanto ela chega', async () => {
    const first = controllableStream();
    const store = new ActiveTurnsStore(async () => first.stream);

    const turn = store.start('conversa-a', message, () => {});
    first.push({ type: 'text_delta', text: 'Olá' });
    await flush();

    expect(store.replyOf('conversa-a')?.text).toBe('Olá');
    expect(store.responding()).toEqual(new Set(['conversa-a']));
    expect(store.replyOf('conversa-b')).toBeNull();

    first.push({ type: 'done', messageId: 'm1' });
    first.end();
    await turn;

    expect(store.replyOf('conversa-a')?.isFinished).toBe(true);
    expect(store.responding()).toEqual(new Set());
    expect(store.finishedTurnsOf('conversa-a')).toBe(1);
  });

  it('mantém respostas de conversas diferentes em paralelo', async () => {
    const streams = { a: controllableStream(), b: controllableStream() };
    const store = new ActiveTurnsStore(async (id) => streams[id as 'a' | 'b'].stream);

    void store.start('a', message, () => {});
    void store.start('b', message, () => {});
    streams.a.push({ type: 'text_delta', text: 'resposta A' });
    streams.b.push({ type: 'text_delta', text: 'resposta B' });
    await flush();

    expect(store.replyOf('a')?.text).toBe('resposta A');
    expect(store.replyOf('b')?.text).toBe('resposta B');
    expect(store.responding()).toEqual(new Set(['a', 'b']));
  });

  it('avisa quem acompanha a cada mudança', async () => {
    const { stream, push, end } = controllableStream();
    const store = new ActiveTurnsStore(async () => stream);
    const listener = vi.fn();
    store.subscribe(listener);

    const turn = store.start('a', message, () => {});
    push({ type: 'text_delta', text: 'x' });
    end();
    await turn;

    expect(listener).toHaveBeenCalled();
  });

  it('mostra o erro da API recebido antes do stream', async () => {
    const store = new ActiveTurnsStore(async () => {
      throw new ApiError(409, 'turn_in_progress', 'Aguarde a resposta terminar.');
    });
    const onFinished = vi.fn();

    await store.start('a', message, onFinished);

    expect(store.replyOf('a')).toMatchObject({
      error: 'Aguarde a resposta terminar.',
      isFinished: true,
    });
    expect(onFinished).toHaveBeenCalledOnce();
  });

  it('interrompe só a conversa pedida, sem mostrar erro', async () => {
    const store = new ActiveTurnsStore(
      (_id, _message, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError'))),
        ),
    );

    const turn = store.start('a', message, () => {});
    store.stop('a');
    await turn;

    expect(store.replyOf('a')).toMatchObject({ error: null, isFinished: true });
  });

  it('esquece só respostas que já terminaram', async () => {
    const { stream, end } = controllableStream();
    const store = new ActiveTurnsStore(async () => stream);

    const turn = store.start('a', message, () => {});
    store.dismiss('a');
    expect(store.replyOf('a')).not.toBeNull();

    end();
    await turn;
    store.dismiss('a');

    expect(store.replyOf('a')).toBeNull();
  });
});
