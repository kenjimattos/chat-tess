import type { StreamEvent } from '@chat-tess/shared';
import { describe, expect, it } from 'vitest';
import { readEventStream } from './event-stream-reader';

/** Cria um corpo de resposta que entrega o texto nos pedaços informados. */
function bodyFrom(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of readEventStream(body)) {
    events.push(event);
  }
  return events;
}

const sse = (event: StreamEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

describe('readEventStream', () => {
  it('lê os eventos em ordem', async () => {
    const events = await collect(
      bodyFrom(sse({ type: 'text_delta', text: 'Olá' }), sse({ type: 'done', messageId: 'm1' })),
    );

    expect(events).toEqual([
      { type: 'text_delta', text: 'Olá' },
      { type: 'done', messageId: 'm1' },
    ]);
  });

  it('remonta um evento que chega partido em vários pedaços', async () => {
    const whole = sse({ type: 'text_delta', text: 'ação ✓' });

    const events = await collect(bodyFrom(whole.slice(0, 7), whole.slice(7, 30), whole.slice(30)));

    expect(events).toEqual([{ type: 'text_delta', text: 'ação ✓' }]);
  });

  it('ignora os comentários de heartbeat', async () => {
    const events = await collect(bodyFrom(': ping\n\n', sse({ type: 'done', messageId: 'm1' })));

    expect(events).toEqual([{ type: 'done', messageId: 'm1' }]);
  });

  it('recusa um evento fora do contrato', async () => {
    await expect(
      collect(bodyFrom('event: x\ndata: {"type":"desconhecido"}\n\n')),
    ).rejects.toThrow();
  });
});
