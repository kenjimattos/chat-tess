import type { StreamEvent } from '@chat-tess/shared';
import type { Response } from 'express';

const HEARTBEAT_INTERVAL_MS = 15_000;

export interface EventStream {
  send(event: StreamEvent): void;
  close(): void;
}

/**
 * Abre uma resposta Server-Sent Events. Cada evento vai com o nome igual ao
 * `type` e o objeto em JSON. Um comentário periódico mantém a conexão viva
 * em proxies que encerram conexões ociosas.
 */
export function openEventStream(response: Response): EventStream {
  response.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();

  const heartbeat = setInterval(() => response.write(': ping\n\n'), HEARTBEAT_INTERVAL_MS);

  return {
    send(event) {
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      response.end();
    },
  };
}
